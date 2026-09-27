import type { AiChatResponse, AiModelsResponse, AiErrorResponse } from '../../src/lib/ai/types.js'
import { AiProxyError, toAiProxyError } from './errors.js'
import {
  FREE_ROUTER_MODEL,
  FREE_LIST_TTL_MS,
  getFreeModels,
  resolveModelCandidates,
  type FetchLike,
} from './models.js'
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, runPlanningChat } from './openrouter.js'
import { isKnownTool } from './tools.js'
import {
  MAX_SYSTEM_PROMPT_CHARS,
  clampMaxTokens,
  clampTemperature,
  parseMessages,
  sanitizeContext,
} from './validate.js'

/**
 * Transport-agnostic request handling for `/api/ai/*`.
 *
 * Both the Vercel serverless functions and the Vite dev middleware call into
 * this module, so development and production run identical logic. The API key
 * is read from the environment here and is never returned to a caller.
 */

export interface AiServerConfig {
  apiKey: string | null
  baseUrl?: string
  /** Developer-configured default model (optional, still free-verified). */
  defaultModel?: string
  maxTokens: number
  temperature: number
  systemPrompt?: string
}

export interface HandlerDeps {
  fetchImpl: FetchLike
  now?: () => number
}

export interface HandlerResult<T> {
  status: number
  body: T
}

/** Read server-only configuration. Never called from the browser bundle. */
export function readServerConfig(env: Record<string, string | undefined>): AiServerConfig {
  const apiKey = env['OPENROUTER_API_KEY']?.trim() || null
  return {
    apiKey,
    baseUrl: env['OPENROUTER_BASE_URL']?.trim() || undefined,
    defaultModel: env['OPENROUTER_MODEL']?.trim() || undefined,
    maxTokens: clampMaxTokens(env['OPENROUTER_MAX_TOKENS'], DEFAULT_MAX_TOKENS),
    temperature: clampTemperature(env['OPENROUTER_TEMPERATURE'], DEFAULT_TEMPERATURE),
    systemPrompt: env['OPENROUTER_SYSTEM_PROMPT']?.trim().slice(0, MAX_SYSTEM_PROMPT_CHARS) || undefined,
  }
}

function errorResult(error: AiProxyError): HandlerResult<AiErrorResponse> {
  return {
    status: error.status,
    body: { error: { code: error.code, message: error.message, retryable: error.retryable } },
  }
}

/**
 * GET /api/ai/models — the verified free-model list.
 *
 * Doubles as a health check: `hasKey` tells the UI whether the assistant can
 * run at all, without ever exposing the key itself.
 */
export async function handleModels(
  config: AiServerConfig,
  deps: HandlerDeps,
): Promise<HandlerResult<AiModelsResponse>> {
  const list = await getFreeModels({
    apiKey: config.apiKey ?? undefined,
    baseUrl: config.baseUrl,
    fetchImpl: deps.fetchImpl,
    now: deps.now,
  })

  const defaultModel =
    list.models.find((model) => model.id === config.defaultModel)?.id ??
    list.models.find((model) => model.id === FREE_ROUTER_MODEL)?.id ??
    list.models[0]?.id ??
    null

  const body: AiModelsResponse = {
    hasKey: Boolean(config.apiKey),
    source: list.source,
    verifiedAt: list.verifiedAt,
    models: list.models,
    defaultModel,
    ...(list.message ? { message: list.message } : {}),
    ...(list.source !== 'unavailable'
      ? {}
      : {
          message:
            list.message ??
            'Free models could not be verified right now. The free router will still be used.',
        }),
  }

  return { status: 200, body }
}

/**
 * POST /api/ai/chat — one planning reply.
 *
 * Every request re-verifies free availability, so a model that starts charging
 * (or disappears) can never be used.
 */
export async function handleChat(
  payload: unknown,
  config: AiServerConfig,
  deps: HandlerDeps,
): Promise<HandlerResult<AiChatResponse | AiErrorResponse>> {
  try {
    if (!config.apiKey) {
      throw new AiProxyError(
        'missing_key',
        'The planning assistant is not configured yet. Add OPENROUTER_API_KEY on the server to enable it.',
      )
    }
    if (!payload || typeof payload !== 'object') {
      throw new AiProxyError('bad_request', 'A JSON body is required.', { status: 400 })
    }

    const raw = payload as Record<string, unknown>
    const messages = parseMessages(raw['messages'])
    const temperature = clampTemperature(raw['temperature'], config.temperature)
    const maxTokens = clampMaxTokens(raw['maxTokens'], config.maxTokens)
    const context = sanitizeContext(raw['context'])
    const customPrompt = typeof raw['systemPrompt'] === 'string' ? raw['systemPrompt'].trim() : ''

    const list = await getFreeModels({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      fetchImpl: deps.fetchImpl,
      now: deps.now,
    })

    const requested =
      (typeof raw['model'] === 'string' ? raw['model'].trim() : '') || config.defaultModel || undefined
    const resolution = resolveModelCandidates(requested, list)

    // When verification is impossible we must not guess: the free router is the
    // only option that is free by construction.
    const candidates =
      resolution.candidates.length > 0 ? resolution.candidates : [FREE_ROUTER_MODEL]

    // A confirmed destructive tool is validated inside runPlanningChat against
    // the same allowlist, so a tampered client cannot smuggle anything through.
    const confirm = readConfirmation(raw['confirm'])

    const response = await runPlanningChat({
      apiKey: config.apiKey,
      fetchImpl: deps.fetchImpl,
      baseUrl: config.baseUrl,
      modelCandidates: candidates,
      history: messages,
      context,
      systemPrompt: customPrompt || config.systemPrompt,
      temperature,
      maxTokens,
      rejectedRequest: resolution.rejectedRequest,
      toolsEnabled: raw['toolsEnabled'] === true && confirm === undefined,
      ...(confirm ? { confirm } : {}),
    })

    return { status: 200, body: response }
  } catch (error) {
    return errorResult(toAiProxyError(error))
  }
}

/** Read the `confirm` envelope without trusting any of its contents. */
function readConfirmation(value: unknown): { confirmationId: string; tool: string; args: unknown } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const confirmationId = record['confirmationId']
  const tool = record['tool']
  if (typeof confirmationId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(confirmationId)) return undefined
  if (typeof tool !== 'string' || !isKnownTool(tool)) return undefined
  return { confirmationId, tool, args: record['args'] }
}

export { FREE_LIST_TTL_MS, FREE_ROUTER_MODEL }
