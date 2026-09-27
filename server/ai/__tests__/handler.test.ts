import { beforeEach, describe, expect, it } from 'vitest'
import { handleChat, handleModels, readServerConfig } from '../handler'
import { FREE_ROUTER_MODEL, resetFreeModelCache, type FetchLike } from '../models'
import { SCOPE_REPLY } from '../prompt'
import type { AiChatResponse, AiErrorResponse, AiModelsResponse } from '../../../src/lib/ai/types'

const ENV = { OPENROUTER_API_KEY: 'sk-or-v1-test-key-value' }

const FREE_CATALOGUE = {
  data: [
    {
      id: FREE_ROUTER_MODEL,
      pricing: { prompt: '0', completion: '0' },
      architecture: { output_modalities: ['text'] },
      context_length: 200_000,
    },
    {
      id: 'demo/helper:free',
      pricing: { prompt: '0', completion: '0' },
      architecture: { output_modalities: ['text'] },
      context_length: 90_000,
    },
  ],
}

interface Recorded {
  url: string
  body: Record<string, unknown> | null
}

/** Fake OpenRouter: serves the catalogue and records chat requests. */
function fakeOpenRouter(
  handler: (attempt: number, body: Record<string, unknown>) => { status: number; payload: unknown },
) {
  const calls: Recorded[] = []
  let chatAttempt = 0
  const fetchImpl: FetchLike = async (url, init) => {
    if (url.endsWith('/models')) {
      calls.push({ url, body: null })
      return { ok: true, status: 200, json: async () => FREE_CATALOGUE }
    }
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null
    calls.push({ url, body })
    chatAttempt += 1
    const result = handler(chatAttempt, body ?? {})
    return { ok: result.status < 400, status: result.status, json: async () => result.payload }
  }
  return { fetchImpl, calls }
}

function replyPayload(content: string, model: string) {
  return {
    model,
    choices: [{ message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 12, completion_tokens: 30 },
  }
}

const deps = (fetchImpl: FetchLike) => ({ fetchImpl, now: () => 1_700_000_000_000 })

const userTurn = {
  messages: [{ role: 'user' as const, content: 'Plan my day: maths, gym, groceries.' }],
}

beforeEach(() => {
  resetFreeModelCache()
})

describe('readServerConfig', () => {
  it('reads the key only from the server environment', () => {
    expect(readServerConfig(ENV).apiKey).toBe('sk-or-v1-test-key-value')
    expect(readServerConfig({}).apiKey).toBeNull()
  })

  it('clamps configured values into safe ranges', () => {
    const config = readServerConfig({
      OPENROUTER_MAX_TOKENS: '99999',
      OPENROUTER_TEMPERATURE: '9',
    })
    expect(config.maxTokens).toBe(2048)
    expect(config.temperature).toBe(1.5)
  })
})

describe('GET /api/ai/models', () => {
  it('returns verified free models without ever exposing the key', async () => {
    const { fetchImpl } = fakeOpenRouter(() => ({ status: 200, payload: {} }))
    const result = await handleModels(readServerConfig(ENV), deps(fetchImpl))
    expect(result.status).toBe(200)

    const body = result.body as AiModelsResponse
    expect(body.hasKey).toBe(true)
    expect(body.source).toBe('live')
    expect(body.defaultModel).toBe(FREE_ROUTER_MODEL)
    expect(body.models.map((model) => model.id)).toContain('demo/helper:free')

    const serialized = JSON.stringify(result.body)
    expect(serialized).not.toContain('sk-or-v1')
    expect(serialized.toLowerCase()).not.toContain('apikey')
  })

  it('reports hasKey:false when unconfigured so the UI can explain it', async () => {
    const { fetchImpl } = fakeOpenRouter(() => ({ status: 200, payload: {} }))
    const result = await handleModels(readServerConfig({}), deps(fetchImpl))
    expect((result.body as AiModelsResponse).hasKey).toBe(false)
  })
})


describe('POST /api/ai/chat', () => {
  it('refuses to run without a server key', async () => {
    const { fetchImpl } = fakeOpenRouter(() => ({ status: 200, payload: {} }))
    const result = await handleChat(userTurn, readServerConfig({}), deps(fetchImpl))
    expect(result.status).toBe(503)
    expect((result.body as AiErrorResponse).error.code).toBe('missing_key')
  })

  it('rejects a malformed body', async () => {
    const { fetchImpl } = fakeOpenRouter(() => ({ status: 200, payload: {} }))
    const result = await handleChat({ messages: [] }, readServerConfig(ENV), deps(fetchImpl))
    expect(result.status).toBe(400)
    expect((result.body as AiErrorResponse).error.code).toBe('bad_request')
  })

  it('sends only a verified free model upstream', async () => {
    const { fetchImpl, calls } = fakeOpenRouter((_attempt, body) => ({
      status: 200,
      payload: replyPayload('You have three things today.', String(body['model'])),
    }))
    const result = await handleChat(
      { ...userTurn, model: 'anthropic/claude-paid' },
      readServerConfig(ENV),
      deps(fetchImpl),
    )
    expect(result.status).toBe(200)
    const chatCall = calls.find((call) => call.url.endsWith('/chat/completions'))
    expect(chatCall?.body?.['model']).toBe(FREE_ROUTER_MODEL)

    const body = result.body as AiChatResponse
    expect(body.reply).toBe('You have three things today.')
    expect(body.free).toBe(true)
    expect(body.notice).toMatch(/no longer a free model/)
  })

  it('clamps temperature and max_tokens before calling OpenRouter', async () => {
    const { fetchImpl, calls } = fakeOpenRouter(() => ({
      status: 200,
      payload: replyPayload('ok', FREE_ROUTER_MODEL),
    }))
    await handleChat(
      { ...userTurn, temperature: 8, maxTokens: 999_999 },
      readServerConfig(ENV),
      deps(fetchImpl),
    )
    const chatCall = calls.find((call) => call.url.endsWith('/chat/completions'))
    expect(chatCall?.body?.['temperature']).toBe(1.5)
    expect(chatCall?.body?.['max_tokens']).toBe(2048)
  })

  it('falls back to another free model when the first is busy', async () => {
    const { fetchImpl } = fakeOpenRouter((attempt) =>
      attempt === 1
        ? { status: 429, payload: { error: { message: 'rate limited' } } }
        : { status: 200, payload: replyPayload('Second model saved the day.', 'demo/helper:free') },
    )
    const result = await handleChat(userTurn, readServerConfig(ENV), deps(fetchImpl))
    expect(result.status).toBe(200)
    const body = result.body as AiChatResponse
    expect(body.reply).toBe('Second model saved the day.')
    expect(body.model).toBe('demo/helper:free')
    expect(body.notice).toMatch(/busy/)
  })

  it('maps an exhausted free allowance to a clear, retryable error', async () => {
    const { fetchImpl } = fakeOpenRouter(() => ({
      status: 429,
      payload: { error: { message: 'free model daily limit reached' } },
    }))
    const result = await handleChat(userTurn, readServerConfig(ENV), deps(fetchImpl))
    expect(result.status).toBe(429)
    const body = result.body as AiErrorResponse
    expect(body.error.code).toBe('free_daily_limit')
    expect(body.error.retryable).toBe(true)
  })

  it('does not retry a rejected key across models', async () => {
    let attempts = 0
    const { fetchImpl } = fakeOpenRouter(() => {
      attempts += 1
      return { status: 401, payload: { error: { message: 'invalid api key' } } }
    })
    const result = await handleChat(userTurn, readServerConfig(ENV), deps(fetchImpl))
    expect(result.status).toBe(502)
    expect((result.body as AiErrorResponse).error.code).toBe('invalid_key')
    expect(attempts).toBe(1)
  })
})


describe('scope and privacy guarantees', () => {
  it('returns typed suggestions the user must confirm', async () => {
    const content = [
      'Science project is unfinished — I can move it to tomorrow.',
      '```morrow-actions',
      '{"actions":[{"kind":"reschedule_task","payload":{"task_id":"task-1","date":"2026-09-24"}}]}',
      '```',
    ].join('\n')
    const { fetchImpl } = fakeOpenRouter(() => ({
      status: 200,
      payload: replyPayload(content, FREE_ROUTER_MODEL),
    }))
    const result = await handleChat(userTurn, readServerConfig(ENV), deps(fetchImpl))
    const body = result.body as AiChatResponse
    expect(body.proposals).toHaveLength(1)
    expect(body.proposals[0]?.kind).toBe('reschedule_task')
    expect(body.reply).not.toContain('morrow-actions')
  })

  it('tells the model to stay on topic', async () => {
    const { fetchImpl, calls } = fakeOpenRouter(() => ({
      status: 200,
      payload: replyPayload(SCOPE_REPLY, FREE_ROUTER_MODEL),
    }))
    await handleChat(userTurn, readServerConfig(ENV), deps(fetchImpl))
    const chatCall = calls.find((call) => call.url.endsWith('/chat/completions'))
    const messages = chatCall?.body?.['messages'] as Array<{ role: string; content: string }>
    expect(messages[0]?.role).toBe('system')
    expect(messages[0]?.content).toContain('planning assistant')
    expect(messages[0]?.content).toContain(SCOPE_REPLY)
  })

  it('forwards only whitelisted planning context, never arbitrary fields', async () => {
    const { fetchImpl, calls } = fakeOpenRouter(() => ({
      status: 200,
      payload: replyPayload('ok', FREE_ROUTER_MODEL),
    }))
    await handleChat(
      {
        ...userTurn,
        context: {
          planningStyle: 'minimal',
          tasks: [{ id: 't1', title: 'Buy milk', minutes: 20 }],
          email: 'private@example.com',
          apiKey: 'sk-or-v1-should-be-ignored',
        },
      },
      readServerConfig(ENV),
      deps(fetchImpl),
    )
    const chatCall = calls.find((call) => call.url.endsWith('/chat/completions'))
    const serialized = JSON.stringify(chatCall?.body)
    expect(serialized).toContain('Buy milk')
    expect(serialized).not.toContain('private@example.com')
    expect(serialized).not.toContain('should-be-ignored')
  })

  it('never leaks the key in an error message', async () => {
    const { fetchImpl } = fakeOpenRouter(() => ({
      status: 500,
      payload: { error: { message: 'boom with sk-or-v1-secret-abc inside' } },
    }))
    const result = await handleChat(userTurn, readServerConfig(ENV), deps(fetchImpl))
    const serialized = JSON.stringify(result.body)
    expect(serialized).not.toContain('sk-or-v1-secret-abc')
    expect(serialized).toContain('[redacted]')
  })
})
