// Server code uses relative imports on purpose: the Vercel function bundler
// resolves them without needing the `@/` TS path alias.
import type { AiErrorCode } from '../../src/lib/ai/types.js'

/**
 * Error type shared by the server-side AI proxy and its callers.
 *
 * `code` lets the UI react precisely (e.g. offer a model picker on
 * `rate_limited`, or show setup instructions on `missing_key`) without
 * string-matching upstream messages. Messages never contain the API key.
 */
export class AiProxyError extends Error {
  readonly code: AiErrorCode
  readonly status: number
  readonly retryable: boolean
  /**
   * Set when this specific model is withheld from us but the key is fine, so
   * the caller can stop nominating it on later requests.
   */
  readonly modelBlocked: boolean

  constructor(
    code: AiErrorCode,
    message: string,
    options: { status?: number; retryable?: boolean; modelBlocked?: boolean } = {},
  ) {
    super(message)
    this.name = 'AiProxyError'
    this.code = code
    this.status = options.status ?? statusForCode(code)
    this.retryable = options.retryable ?? isRetryable(code)
    this.modelBlocked = options.modelBlocked ?? false
  }
}

function statusForCode(code: AiErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401
    case 'missing_key':
    case 'not_configured':
      return 503
    case 'invalid_key':
      return 502
    case 'bad_request':
      return 400
    case 'rate_limited':
    case 'free_daily_limit':
      return 429
    case 'no_free_model':
    case 'model_unavailable':
      return 424
    case 'timeout':
      return 504
    case 'network':
    case 'upstream_error':
    default:
      return 502
  }
}

function isRetryable(code: AiErrorCode): boolean {
  // A 401 is not worth retrying: the token has to be refreshed by signing in.
  if (code === 'unauthorized') return false
  return (
    code === 'rate_limited' ||
    code === 'free_daily_limit' ||
    code === 'timeout' ||
    code === 'upstream_error' ||
    code === 'network'
  )
}

/** Map an HTTP status from OpenRouter onto a typed, user-safe error. */
export function mapUpstreamStatus(status: number, upstreamMessage: string): AiProxyError {
  const detail = sanitizeUpstreamMessage(upstreamMessage)
  if (status === 401) {
    return new AiProxyError('invalid_key', 'The OpenRouter API key was rejected.', { status: 502 })
  }
  if (status === 403) {
    // A 403 is about the model, not the key. Free models can be reserved for
    // agentic harnesses, or withheld from this account, and either way the next
    // candidate may well work — so this must not abort the whole chain. The
    // upstream wording ("only available on agentic harnesses…") is an OpenRouter
    // implementation detail, so it is not shown to the user.
    return new AiProxyError('model_unavailable', 'No free model is available to this app right now.', {
      status: 502,
      retryable: true,
      modelBlocked: true,
    })
  }
  if (status === 402) {
    return new AiProxyError(
      'free_daily_limit',
      `The OpenRouter free-model allowance for today is used up. ${detail}`.trim(),
    )
  }
  if (status === 429) {
    // The free tier exposes a shared per-day cap; surface it as its own code so
    // the UI can say "try again later" instead of "something broke".
    const looksLikeDailyCap = /free|daily|quota|allowance/i.test(upstreamMessage)
    return new AiProxyError(
      looksLikeDailyCap ? 'free_daily_limit' : 'rate_limited',
      looksLikeDailyCap
        ? `The free-model daily allowance for today is used up. ${detail}`.trim()
        : `The model is busy right now. ${detail}`.trim(),
    )
  }
  if (status === 404) {
    return new AiProxyError('model_unavailable', `That model is not available. ${detail}`.trim(), {
      retryable: true,
      modelBlocked: true,
    })
  }
  if (status === 400 || status === 422) {
    return new AiProxyError('bad_request', `The request was rejected by the model. ${detail}`.trim(), {
      status: 400,
    })
  }
  if (status >= 500) {
    return new AiProxyError('upstream_error', `The AI provider had a problem. ${detail}`.trim())
  }
  return new AiProxyError('upstream_error', `Unexpected AI provider response (${status}). ${detail}`.trim())
}

/** Trim noisy upstream text and drop anything that looks like a credential. */
export function sanitizeUpstreamMessage(message: string): string {
  const cleaned = String(message ?? '')
    .replace(/sk-or-[A-Za-z0-9-]+/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  return cleaned.length > 240 ? `${cleaned.slice(0, 237)}...` : cleaned
}

export function isAiProxyError(error: unknown): error is AiProxyError {
  return error instanceof AiProxyError
}

/** Normalise any thrown value into an AiProxyError so handlers never leak. */
export function toAiProxyError(error: unknown, fallback: AiErrorCode = 'upstream_error'): AiProxyError {
  if (isAiProxyError(error)) return error
  if (error instanceof Error) {
    if (error.name === 'AbortError' || /timeout/i.test(error.message)) {
      return new AiProxyError('timeout', 'The AI took too long to respond. Please try again.', {
        retryable: true,
      })
    }
    return new AiProxyError(fallback, sanitizeUpstreamMessage(error.message) || 'The AI request failed.')
  }
  return new AiProxyError(fallback, 'The AI request failed.')
}
