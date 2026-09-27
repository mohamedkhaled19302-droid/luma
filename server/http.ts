import type { FetchLike, MinimalResponse } from './ai/models.js'

/**
 * Minimal HTTP shapes shared by Vercel serverless functions and the Vite dev
 * middleware. Declaring them locally avoids depending on a platform-specific
 * type package while keeping the handlers fully typed.
 */

export interface ApiRequestLike {
  method?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}

export interface ApiResponseLike {
  statusCode: number
  setHeader(name: string, value: string): void
  end(chunk?: string): void
  writableEnded?: boolean
}

export function sendJson(res: ApiResponseLike, status: number, body: unknown): void {
  // Defensive: a handler must never write twice, which would raise
  // ERR_STREAM_WRITE_AFTER_END and take the process down.
  if (res.writableEnded) return
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  // The AI proxy must never be cached: replies are per-user and per-request.
  res.setHeader('Cache-Control', 'no-store')
  res.end(payload)
}

export function methodNotAllowed(res: ApiResponseLike, allowed: string[]): void {
  res.setHeader('Allow', allowed.join(', '))
  sendJson(res, 405, { error: { code: 'bad_request', message: 'Method not allowed.', retryable: false } })
}

/** Read a JSON body from a platform request (pre-parsed or streamed). */
export async function readJsonBody(req: ApiRequestLike): Promise<unknown> {
  const body: unknown = req.body
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') {
    if (!body.trim()) return undefined
    try {
      return JSON.parse(body)
    } catch {
      return undefined
    }
  }
  if (typeof body === 'object') return body
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8'))
    } catch {
      return undefined
    }
  }
  return undefined
}

/** Adapt the runtime's global fetch to the small surface the AI core needs. */
export const globalFetch: FetchLike = async (url, init) => {
  const response = await fetch(url, init)
  return response as unknown as MinimalResponse
}
