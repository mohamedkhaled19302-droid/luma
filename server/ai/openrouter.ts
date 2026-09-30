import type {
  AiChatResponse,
  AiConfirmationRequest,
  AiPlanningContext,
  AiProposal,
} from '../../src/lib/ai/types.js'
import { BRAND } from '../../src/lib/brand.js'
import { AiProxyError, mapUpstreamStatus, toAiProxyError } from './errors.js'
import { MAX_MODEL_CANDIDATES, type FetchLike } from './models.js'
import { parseAssistantReply, proposalFromToolCall } from './proposals.js'
import { buildContextBlock, buildSystemPrompt } from './prompt.js'
import {
  confirmationCopy,
  isToolValidationFailure,
  OPENROUTER_TOOL_SCHEMAS,
  validateToolCall,
} from './tools.js'

/**
 * OpenRouter transport.
 *
 * Only this module knows the API key, and it only ever receives a model that
 * `models.ts` has already verified as 100% free.
 */

export const OPENROUTER_DEFAULT_BASE = 'https://openrouter.ai/api/v1'
export const DEFAULT_MAX_TOKENS = 800
export const DEFAULT_TEMPERATURE = 0.4
export const REQUEST_TIMEOUT_MS = 45_000
/**
 * Ceiling for one whole request, across every candidate we try. The free pool
 * is slow enough that three sequential 45s attempts would outlive the platform
 * limit, so we would be killed mid-call instead of returning a clean error.
 */
export const TOTAL_REQUEST_BUDGET_MS = 30_000
/**
 * Ceiling for a single candidate. The free tier mixes small models that answer
 * in a couple of seconds with large ones that can sit on a provider queue for
 * half a minute. Waiting out one slow model burns the whole budget, so we give
 * it a fair slice and then move to the next candidate instead.
 */
export const PER_MODEL_TIMEOUT_MS = 12_000

/**
 * Some free models answer 403 for everyone but the agentic harnesses they are
 * reserved for. That verdict is stable for a while, and with only a handful of
 * candidate slots it is expensive to rediscover on every request, so each
 * instance remembers what it learned and tries the model that last worked
 * first. Both are per-instance and time limited: a cold function still
 * discovers the pool, and a restarted one is never wrong for long.
 */
const BLOCKED_MODEL_TTL_MS = 10 * 60_000
const blockedModels = new Map<string, number>()
/** Last observed round-trip time per model, so we stop re-picking the slow one. */
const modelLatencyMs = new Map<string, number>()

/**
 * Order candidates by what this instance has learned: models that answered
 * quickly first, then untried ones, then models that were slow last time, with
 * the withheld ones last. Purely a preference — nothing is dropped, and an
 * instance that has learned nothing still tries everything in catalogue order.
 */
function orderCandidates(candidates: readonly string[]): string[] {
  const now = Date.now()
  for (const [id, until] of blockedModels) {
    if (until <= now) blockedModels.delete(id)
  }
  const rank = (model: string): number => {
    const seen = modelLatencyMs.get(model)
    if (seen === undefined) return 1
    return seen <= PER_MODEL_TIMEOUT_MS / 2 ? 0 : 2
  }
  const live = candidates.filter((model) => !blockedModels.has(model))
  const blocked = candidates.filter((model) => blockedModels.has(model))
  return [
    ...live.filter((model) => rank(model) === 0).sort((a, b) => modelLatencyMs.get(a)! - modelLatencyMs.get(b)!),
    ...live.filter((model) => rank(model) === 1),
    ...live.filter((model) => rank(model) === 2),
    ...blocked,
  ]
}

/** Test seam: forget what this instance learned about the free pool. */
export function resetModelMemory(): void {
  blockedModels.clear()
  modelLatencyMs.clear()
}

export interface ChatMessageIn {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionInput {
  apiKey: string
  fetchImpl: FetchLike
  baseUrl?: string
  model: string
  messages: ChatMessageIn[]
  temperature: number
  maxTokens: number
  /** OpenAI-compatible function schemas. Omit for models without tool support. */
  tools?: ReadonlyArray<Record<string, unknown>>
  timeoutMs?: number
  externalSignal?: AbortSignal
}

/** One tool invocation requested by the model. Arguments are untrusted JSON. */
export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface CompletionResult {
  content: string
  model: string
  toolCalls: ToolCall[]
  finishReason?: string
  usage?: { promptTokens?: number; completionTokens?: number }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Pull a human-readable reason out of an OpenRouter error body. */
function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const body = payload as Record<string, unknown>
  const error = body['error']
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>)['message']
    if (typeof message === 'string') return message
  }
  if (typeof body['message'] === 'string') return body['message']
  return ''
}

/** Run the upstream call under a hard deadline, honouring a caller signal. */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    },
  }
}

/** One attempt against one specific (already verified free) model. */
export async function requestCompletion(input: CompletionInput): Promise<CompletionResult> {
  const baseUrl = (input.baseUrl ?? OPENROUTER_DEFAULT_BASE).replace(/\/+$/, '')
  const { signal, cleanup } = withTimeout(input.externalSignal, input.timeoutMs ?? REQUEST_TIMEOUT_MS)

  try {
    const response = await input.fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Title': BRAND.name,
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
        // Only sent when the caller wants tool use; several free models reject
        // the field outright, so the caller retries without it.
        ...(input.tools && input.tools.length > 0 ? { tools: input.tools, tool_choice: 'auto' } : {}),
      }),
      signal,
    })

    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    if (!response.ok) {
      throw mapUpstreamStatus(response.status, extractErrorMessage(payload))
    }

    const body = (payload ?? {}) as Record<string, unknown>
    const choices = Array.isArray(body['choices']) ? (body['choices'] as unknown[]) : []
    const first = choices[0] as Record<string, unknown> | undefined
    const message = (first?.['message'] ?? {}) as Record<string, unknown>
    const fromMessage = typeof message['content'] === 'string' ? message['content'].trim() : ''
    const fromText = typeof first?.['text'] === 'string' ? (first['text'] as string).trim() : ''
    const content = fromMessage || fromText

    const toolCalls: ToolCall[] = []
    if (Array.isArray(message['tool_calls'])) {
      for (const entry of message['tool_calls'] as unknown[]) {
        if (!entry || typeof entry !== 'object') continue
        const record = entry as Record<string, unknown>
        const fn = record['function']
        if (!fn || typeof fn !== 'object') continue
        const fnRecord = fn as Record<string, unknown>
        const name = fnRecord['name']
        if (typeof name !== 'string' || !name) continue
        toolCalls.push({
          id: typeof record['id'] === 'string' ? record['id'] : name,
          name,
          arguments: typeof fnRecord['arguments'] === 'string' ? fnRecord['arguments'] : '{}',
        })
      }
    }

    if (!content && toolCalls.length === 0) {
      // Reasoning-only or empty replies are retried on another free model, and
      // this model is not nominated again: producing no text at all is a
      // property of the model, not bad luck.
      throw new AiProxyError('model_unavailable', 'That model did not return an answer. Please try again.', {
        retryable: true,
        modelBlocked: true,
      })
    }

    const usage = (body['usage'] ?? {}) as Record<string, unknown>
    return {
      content,
      model: typeof body['model'] === 'string' && body['model'] ? body['model'] : input.model,
      toolCalls,
      ...(typeof first?.['finish_reason'] === 'string' ? { finishReason: first['finish_reason'] } : {}),
      usage: {
        promptTokens: readNumber(usage['prompt_tokens']),
        completionTokens: readNumber(usage['completion_tokens']),
      },
    }
  } catch (error) {
    throw toAiProxyError(error)
  } finally {
    cleanup()
  }
}


export interface PlanningChatInput {
  apiKey: string
  fetchImpl: FetchLike
  baseUrl?: string
  modelCandidates: string[]
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  context?: AiPlanningContext
  systemPrompt?: string
  temperature: number
  maxTokens: number
  /** Set when the requested model is no longer free, for the notice line. */
  rejectedRequest?: string | null
  /** Allow the model to call the tool registry. */
  toolsEnabled?: boolean
  /**
   * The user approved a previously held destructive tool. The arguments are
   * re-validated against the registry before being returned, so a tampered
   * client cannot turn this into an arbitrary action.
   */
  confirm?: { confirmationId: string; tool: string; args: unknown }
  signal?: AbortSignal
}

/** Short, deterministic acknowledgement for an approved tool. */
function appliedReply(tool: string, args: Record<string, unknown>): string {
  const name = typeof args['title'] === 'string' ? args['title'] : typeof args['name'] === 'string' ? args['name'] : ''
  switch (tool) {
    case 'create_task':
      return name ? `Added "${name}" to your tasks.` : 'Added the task.'
    case 'update_task':
      return name ? `Updated "${name}".` : 'Task updated.'
    case 'complete_task':
      return name ? `Marked "${name}" as done.` : 'Marked the task as done.'
    case 'reschedule_task':
      return name ? `Moved "${name}" to ${String(args['date'] ?? 'the new day')}.` : 'Task rescheduled.'
    case 'delete_task':
      return name ? `Deleted "${name}".` : 'Task deleted.'
    case 'create_habit':
      return name ? `Started tracking "${name}".` : 'Habit created.'
    case 'log_habit':
      return args['completed'] === false ? 'Habit mark removed.' : 'Logged the habit.'
    case 'delete_habit':
      return name ? `Stopped tracking "${name}".` : 'Habit deleted.'
    case 'create_goal':
      return name ? `Added the goal "${name}".` : 'Goal created.'
    case 'update_goal':
      return name ? `Updated "${name}".` : 'Goal updated.'
    case 'delete_goal':
      return name ? `Deleted the goal "${name}".` : 'Goal deleted.'
    case 'create_block':
      return name
        ? `Put "${name}" in your schedule on ${String(args['date'] ?? 'that day')}.`
        : 'Added to your schedule.'
    case 'move_block':
      return name ? `Moved "${name}".` : 'Block moved.'
    case 'complete_block':
      return args['completed'] === false ? 'Block reopened.' : 'Block marked done.'
    case 'delete_block':
      return name ? `Removed "${name}" from your schedule.` : 'Block removed.'
    case 'reschedule_day':
      return `Rebuilt the plan for ${String(args['date'] ?? 'that day')}.`
    case 'add_break':
      return 'Added the break.'
    case 'create_category':
      return name ? `Created the category "${name}".` : 'Category created.'
    case 'delete_category':
      return 'Category deleted.'
    default:
      return 'Done.'
  }
}

/**
 * Ask the assistant for a planning reply, falling back across free models.
 *
 * Returns prose plus validated, inert suggestions. It never mutates data.
 */
export async function runPlanningChat(input: PlanningChatInput): Promise<AiChatResponse> {
  if (input.modelCandidates.length === 0) {
    throw new AiProxyError('no_free_model', 'No free model is currently available.')
  }

  // The user approved a held destructive tool. Re-validate and release it
  // without spending another model call.
  if (input.confirm) {
    const validation = validateToolCall(input.confirm.tool, input.confirm.args)
    if (isToolValidationFailure(validation)) {
      throw new AiProxyError('bad_request', `That action is not valid: ${validation.reason}`, {
        retryable: false,
      })
    }
    const proposal = proposalFromToolCall(
      validation.tool,
      validation.args,
      input.confirm.confirmationId,
    )
    if (!proposal) {
      throw new AiProxyError('bad_request', 'That action could not be prepared.', { retryable: false })
    }
    return {
      reply: appliedReply(validation.tool, validation.args),
      model: input.modelCandidates[0] ?? 'local',
      free: true,
      source: 'live',
      proposals: [proposal],
    }
  }

  const systemMessages: ChatMessageIn[] = [
    { role: 'system', content: buildSystemPrompt(input.context, input.systemPrompt) },
  ]
  const history: ChatMessageIn[] = input.history.map((message) => ({
    role: message.role,
    content: message.content,
  }))

  // The plan snapshot travels with the newest user turn rather than as a
  // system message, so it stays cheap and easy to reason about.
  const contextBlock = buildContextBlock(input.context)
  if (contextBlock) {
    const lastUser = [...history].reverse().find((message) => message.role === 'user')
    if (lastUser) lastUser.content = `${lastUser.content}\n\n${contextBlock}`
  }

  const wantsTools = input.toolsEnabled === true
  const toolPayload = wantsTools ? OPENROUTER_TOOL_SCHEMAS : undefined

  let lastError: AiProxyError | null = null
  let attempts = 0
  // Some free models reject the `tools` field. After the first such failure we
  // stop sending it and rely on the JSON-fence fallback instead.
  let toolsUsable = wantsTools
  let droppedToolSupport = false
  /** Why the previous candidate was passed over, for the notice line. */
  let skippedReason: 'busy' | 'withheld' | null = null

  // One deadline for the whole chain, not one per candidate, so a slow free
  // pool costs us a clean timeout rather than a dead function.
  const deadline = Date.now() + TOTAL_REQUEST_BUDGET_MS
  const budget = new AbortController()
  const onCallerAbort = () => budget.abort()
  if (input.signal) {
    if (input.signal.aborted) budget.abort()
    else input.signal.addEventListener('abort', onCallerAbort, { once: true })
  }
  const budgetTimer = setTimeout(() => budget.abort(), TOTAL_REQUEST_BUDGET_MS)

  try {
    // Reorder first, then take the budget: a model this instance already knows
    // is withheld must not consume one of the few real attempts.
    const candidates = orderCandidates(input.modelCandidates).slice(0, MAX_MODEL_CANDIDATES)
    for (const model of candidates) {
      attempts += 1
      const attemptStarted = Date.now()
      try {
        const completion = await requestCompletion({
          apiKey: input.apiKey,
          fetchImpl: input.fetchImpl,
          baseUrl: input.baseUrl,
          model,
          messages: [...systemMessages, ...history],
          temperature: input.temperature,
          maxTokens: input.maxTokens,
          ...(toolsUsable && toolPayload ? { tools: toolPayload } : {}),
          timeoutMs: Math.min(
            PER_MODEL_TIMEOUT_MS,
            Math.max(5_000, deadline - Date.now()),
          ),
          externalSignal: budget.signal,
        })
        modelLatencyMs.set(model, Date.now() - attemptStarted)

        const parsed = parseAssistantReply(completion.content, `p${Date.now().toString(36)}`)

        // Native tool calls take precedence over the JSON fence. Destructive ones
        // are held for explicit approval rather than turned into a button.
        const proposals: AiProposal[] = []
        let confirmation: AiConfirmationRequest | undefined
        const toolPrefix = `t${Date.now().toString(36)}`
        for (const call of completion.toolCalls) {
          const validation = validateToolCall(call.name, call.arguments)
        if (!validation.ok) continue
        if (validation.destructive) {
          // Hold only the first destructive action; queueing several
          // confirmation dialogs at once is hostile.
          const copy = confirmationCopy(validation.tool, validation.args)
          confirmation = {
            confirmationId: `${toolPrefix}c${proposals.length}`,
            tool: validation.tool,
            title: copy.title,
            detail: copy.detail,
            params: validation.args,
          }
          continue
        }
        const proposal = proposalFromToolCall(
          validation.tool,
          validation.args,
          `${toolPrefix}-${proposals.length}`,
        )
        if (proposal) proposals.push(proposal)
      }

      // Free models very often cannot call tools directly, and answer with the
      // JSON fence instead. Without this fallback `parsed.proposals` was
      // computed and thrown away, so the `droppedToolSupport` notice below
      // promised "I proposed the change for your approval" while returning
      // nothing at all.
      //
      // Fenced proposals go through the same destructive gate as native tool
      // calls: a model must not be able to bypass confirmation by choosing a
      // different transport.
      if (proposals.length === 0 && !confirmation) {
        for (const fenced of parsed.proposals) {
          const validation = validateToolCall(fenced.kind, fenced.payload)
          if (!validation.ok) continue
          if (validation.destructive) {
            const copy = confirmationCopy(validation.tool, validation.args)
            confirmation = {
              confirmationId: `${toolPrefix}f${proposals.length}`,
              tool: validation.tool,
              title: copy.title,
              detail: copy.detail,
              params: validation.args,
            }
            continue
          }
          proposals.push(fenced)
        }
      }

      const notices: string[] = []
      if (input.rejectedRequest) {
        notices.push(`${input.rejectedRequest} is no longer a free model, so I used a free one.`)
      }
      if (attempts > 1) {
        notices.push(
          skippedReason === 'withheld'
            ? 'One free model was not available to this app, so I used another one.'
            : 'The first free model was busy, so I used another one.',
        )
      }
      if (droppedToolSupport) {
        notices.push('This model cannot call tools directly, so I proposed the change for your approval instead.')
      }

      const reply =
        parsed.reply ||
        (proposals.length > 0 || confirmation
          ? 'Here is what I suggest.'
          : 'I could not produce a reply just now. Please try again.')

      return {
        reply,
        model: completion.model,
        free: true,
        source: 'live',
        usage: completion.usage,
        proposals,
        ...(confirmation ? { confirmation } : {}),
        ...(notices.length > 0 ? { notice: notices.join(' ') } : {}),
      }
    } catch (error) {
      const proxyError = toAiProxyError(error)
      lastError = proxyError
      if (proxyError.modelBlocked) {
        blockedModels.set(model, Date.now() + BLOCKED_MODEL_TTL_MS)
        skippedReason = 'withheld'
      } else if (proxyError.retryable) {
        skippedReason = 'busy'
      }
      // A free model that refuses the `tools` payload is retried immediately in
      // advisory mode rather than being abandoned.
      if (toolsUsable && !proxyError.retryable && proxyError.code === 'bad_request') {
        toolsUsable = false
        droppedToolSupport = true
        attempts -= 1
        continue
      }
      // Only retryable problems (busy model, withheld model, empty reply,
      // timeout) are worth another free model; a bad request or a rejected key
      // fails everywhere.
      if (!proxyError.retryable) break
    }
    }
  } finally {
    clearTimeout(budgetTimer)
    if (input.signal) input.signal.removeEventListener('abort', onCallerAbort)
  }

  throw lastError ?? new AiProxyError('no_free_model', 'No free model could answer this request.')
}
