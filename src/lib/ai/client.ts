import { supabase } from '@/database/client'
import type {
  AiChatRequest,
  AiChatResponse,
  AiModelsResponse,
} from './types'

export class AiRequestError extends Error {
  code: string
  retryable: boolean

  constructor(message: string, code = 'upstream_error', retryable = true) {
    super(message)
    this.name = 'AiRequestError'
    this.code = code
    this.retryable = retryable
  }
}

function errorFromPayload(payload: unknown): AiRequestError {
  const fallback = new AiRequestError('The planning assistant is unavailable right now.')
  if (typeof payload !== 'object' || payload === null) return fallback
  const error = (payload as { error?: { message?: string; code?: string; retryable?: boolean } }).error
  if (!error) return fallback
  return new AiRequestError(
    error.message ?? fallback.message,
    error.code ?? 'upstream_error',
    error.retryable ?? true,
  )
}

async function readError(response: Response): Promise<AiRequestError> {
  try {
    return errorFromPayload(await response.json())
  } catch {
    return new AiRequestError(
      `The planning assistant replied with ${response.status}.`,
      'upstream_error',
      response.status >= 500,
    )
  }
}

/**
 * The AI proxy is authenticated and metered per account, so every call carries
 * the caller's Supabase access token. The anon key is deliberately not used as
 * a bearer token here: the session token is what identifies the person, and it
 * is already in memory.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

/** Lists the models the server verified as usable. Never exposes the key. */
export async function fetchAiModels(signal?: AbortSignal): Promise<AiModelsResponse> {
  const response = await fetch('/api/ai/models', {
    signal,
    headers: await authHeaders(),
  })
  if (!response.ok) throw await readError(response)
  return (await response.json()) as AiModelsResponse
}

/** Sends a planning conversation to the server-side proxy. */
export async function sendAiChat(
  request: AiChatRequest,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    signal,
    headers: {
      ...(await authHeaders()),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw await readError(response)
  return (await response.json()) as AiChatResponse
}
