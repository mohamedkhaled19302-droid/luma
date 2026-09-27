// Server code uses relative imports on purpose: the Vercel function bundler
// resolves them without needing the `@/` TS path alias.
import type { FetchLike } from './models.js'
import { AiProxyError } from './errors.js'
import type { ApiRequestLike } from '../http.js'

/**
 * Access control for the AI proxy.
 *
 * Without this, `/api/ai/*` is an open relay: anybody who can reach the
 * deployment can spend the project's OpenRouter allowance, and anybody can make
 * it echo the conversation of whoever calls it. So every AI request must carry
 * a real Supabase access token, and each account gets its own budget.
 *
 * What is deliberately NOT here:
 *  - no database access, so this cannot be confused with RLS. RLS still governs
 *    the data itself when the browser writes it;
 *  - no request logging of message content, only a counter per account.
 */

export interface SupabaseAuthConfig {
  /** Project URL. Falls back to the public `VITE_` value, which is not a secret. */
  url: string | undefined
  /** Publishable anon key. Safe to hold server-side; it grants no data access. */
  anonKey: string | undefined
}

export interface GuardDeps {
  fetchImpl?: FetchLike
  now?: () => number
}

/** Read the bearer token from the `Authorization` header, case-insensitively. */
export function readBearerToken(req: ApiRequestLike): string | null {
  const raw = req.headers?.['authorization'] ?? req.headers?.['Authorization']
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null
  const match = /^Bearer\s+(.+)$/i.exec(value.trim())
  const token = match?.[1]?.trim()
  return token ? token : null
}

/**
 * Ask Supabase who the caller is.
 *
 * `/auth/v1/user` validates the token server-side; we never decode the JWT
 * ourselves, because a self-decoded token proves nothing.
 */
async function resolveUser(
  token: string,
  config: SupabaseAuthConfig,
  fetchImpl: FetchLike,
): Promise<string | null> {
  if (!config.url || !config.anonKey) return null
  const response = await fetchImpl(`${config.url.replace(/\/$/, '')}/auth/v1/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: config.anonKey,
    },
  })
  if (!response.ok) return null
  const body = await response.json()
  const id = (body as { id?: unknown } | null)?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

/* ------------------------------------------------------------------ *
 * Rate limiting
 *
 * A fixed window in memory. This is intentionally simple: it exists to stop a
 * runaway client and casual abuse of a shared free allowance, not to be a
 * distributed quota. A multi-instance deployment would move this to the
 * platform's own limiter or a KV store.
 * ------------------------------------------------------------------ */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Keeps the map from growing without bound across a long-lived process. */
function sweep(now: number): void {
  if (buckets.size < 512) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  /** Seconds until the window resets. */
  retryAfterSeconds: number
}

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): RateLimitResult {
  sweep(now)
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    }
  }
  existing.count += 1
  const allowed = existing.count <= limit
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

/** Test seam: forget every bucket. */
export function resetRateLimits(): void {
  buckets.clear()
}

/* ------------------------------------------------------------------ *
 * The guard itself
 * ------------------------------------------------------------------ */

export interface GuardLimits {
  /** Requests per window, per account. */
  max: number
  windowMs: number
}

export const DEFAULT_LIMITS: Record<'chat' | 'vision' | 'models', GuardLimits> = {
  // Text generation is the expensive one, so it gets the tightest budget.
  chat: { max: 20, windowMs: 60_000 },
  // Vision burns a lot of free quota per call.
  vision: { max: 6, windowMs: 60_000 },
  // Cached server-side and cheap, but still not open.
  models: { max: 30, windowMs: 60_000 },
}

export type GuardKind = keyof typeof DEFAULT_LIMITS

export interface GuardConfig {
  auth: SupabaseAuthConfig
  limits?: Record<GuardKind, GuardLimits>
  /** Set false only for local development without a Supabase project. */
  requireAuth?: boolean
}

export interface Caller {
  /** Account id, or `anon:<hash>` when running unauthenticated in dev. */
  id: string
  authenticated: boolean
}

/**
 * Authorise and budget one AI request.
 *
 * Throws `AiProxyError` so the existing handler plumbing renders it with the
 * same shape as every other AI error.
 */
export async function guardRequest(
  req: ApiRequestLike,
  kind: GuardKind,
  config: GuardConfig,
  deps: GuardDeps = {},
): Promise<Caller> {
  const now = deps.now?.() ?? Date.now()
  const limits = config.limits?.[kind] ?? DEFAULT_LIMITS[kind]
  const fetchImpl = deps.fetchImpl ?? (globalThis.fetch as unknown as FetchLike)

  const token = readBearerToken(req)
  const requireAuth = config.requireAuth !== false

  let id: string | null = null
  if (token) {
    try {
      id = await resolveUser(token, config.auth, fetchImpl)
    } catch {
      // A Supabase outage must not read as "authenticated".
      id = null
    }
  }

  if (!id) {
    if (requireAuth) {
      throw new AiProxyError('unauthorized', 'Sign in to use the assistant.')
    }
    // Dev without a project: still rate limit, just bucket everyone together.
    id = 'anon:dev'
  }

  const result = consumeRateLimit(`${kind}:${id}`, limits.max, limits.windowMs, now)
  if (!result.allowed) {
    throw new AiProxyError(
      'rate_limited',
      'You are using the assistant too quickly. Give it a moment and try again.',
      { status: 429 },
    )
  }

  return { id, authenticated: id !== 'anon:dev' }
}
