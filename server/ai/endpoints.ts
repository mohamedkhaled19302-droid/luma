import {
  handleChat,
  handleHealth,
  handleModels,
  readServerConfig,
  type AiServerConfig,
  type HandlerDeps,
} from './handler.js'
import { guardRequest, type GuardKind } from './guard.js'
import { toAiProxyError } from './errors.js'
import { globalFetch, methodNotAllowed, readJsonBody, sendJson, type ApiRequestLike, type ApiResponseLike } from '../http.js'

/**
 * The two HTTP endpoints the assistant needs.
 *
 * `runtimeEnv` is injected so the same handlers work under Vercel, the Vite dev
 * server, and unit tests without touching `process.env` implicitly.
 *
 * Both endpoints are authenticated and rate limited before any OpenRouter call
 * is attempted, so the project's key is never an open relay.
 */

export interface EndpointOptions {
  env: Record<string, string | undefined>
  fetchImpl?: HandlerDeps['fetchImpl']
  now?: () => number
  /**
   * Require a valid Supabase token. Defaults to true in production and to false
   * in development so the app is still usable before a project is connected.
   */
  requireAuth?: boolean
}

function deps(options: EndpointOptions): HandlerDeps {
  return { fetchImpl: options.fetchImpl ?? globalFetch, now: options.now }
}

function config(options: EndpointOptions): AiServerConfig {
  return readServerConfig(options.env)
}

/**
 * The anon key is publishable by design, so reading the `VITE_` value on the
 * server is safe and keeps one source of truth for the project URL.
 */
function guardConfig(options: EndpointOptions) {
  return {
    auth: {
      url: options.env.SUPABASE_URL ?? options.env.VITE_SUPABASE_URL,
      anonKey: options.env.SUPABASE_ANON_KEY ?? options.env.VITE_SUPABASE_ANON_KEY,
    },
    requireAuth: options.requireAuth,
  }
}

async function authorise(
  req: ApiRequestLike,
  res: ApiResponseLike,
  kind: GuardKind,
  options: EndpointOptions,
): Promise<boolean> {
  try {
    await guardRequest(req, kind, guardConfig(options), {
      fetchImpl: options.fetchImpl ?? globalFetch,
      now: options.now,
    })
    return true
  } catch (error) {
    const proxyError = toAiProxyError(error)
    sendJson(res, proxyError.status, {
      error: { code: proxyError.code, message: proxyError.message, retryable: proxyError.retryable },
    })
    return false
  }
}

/** GET /api/ai/models */
export async function modelsEndpoint(
  req: ApiRequestLike,
  res: ApiResponseLike,
  options: EndpointOptions,
): Promise<void> {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    methodNotAllowed(res, ['GET'])
    return
  }
  if (!(await authorise(req, res, 'models', options))) return
  const result = await handleModels(config(options), deps(options))
  sendJson(res, result.status, result.body)
}

/** POST /api/ai/chat */
export async function chatEndpoint(
  req: ApiRequestLike,
  res: ApiResponseLike,
  options: EndpointOptions,
): Promise<void> {
  if (req.method && req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }
  if (!(await authorise(req, res, 'chat', options))) return
  const payload = await readJsonBody(req)
  const result = await handleChat(payload, config(options), deps(options))
  sendJson(res, result.status, result.body)
}

/** POST /api/ai/health */
export async function healthEndpoint(
  req: ApiRequestLike,
  res: ApiResponseLike,
  options: EndpointOptions,
): Promise<void> {
  if (req.method && req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return
  }
  if (!(await authorise(req, res, 'chat', options))) return
  const payload = await readJsonBody(req)
  const result = await handleHealth(payload, config(options), deps(options))
  sendJson(res, result.status, result.body)
}

export { handleChat, handleHealth, handleModels, readServerConfig }
