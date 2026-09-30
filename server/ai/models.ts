import type { AiModelsSource, FreeModelInfo } from '../../src/lib/ai/types.js'

/**
 * Free-model discovery and verification.
 *
 * Product rule: the assistant may ONLY ever be routed to a model that is
 * completely free. A model in OpenRouter's catalogue can change price or
 * disappear at any time, so we re-check the live catalogue instead of trusting
 * a hardcoded list, and we never fall back to something paid — the worst case
 * is `openrouter/free`, the alias that by definition only routes to free
 * models.
 */

export const OPENROUTER_DEFAULT_BASE = 'https://openrouter.ai/api/v1'
/** Auto-router that only ever selects free models. */
export const FREE_ROUTER_MODEL = 'openrouter/free'
/** How long a verified free-model list stays fresh. */
export const FREE_LIST_TTL_MS = 10 * 60 * 1000
/** Max automatic fallbacks per request (keeps latency and request count sane). */
export const MAX_MODEL_CANDIDATES = 3

/** The tiny slice of `fetch` we depend on — keeps this module easy to test. */
export interface MinimalResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

export type FetchLike = (
  url: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
  },
) => Promise<MinimalResponse>

export interface FreeModelList {
  models: FreeModelInfo[]
  source: AiModelsSource
  verifiedAt: string | null
  message?: string
}

interface CacheEntry {
  models: FreeModelInfo[]
  verifiedAt: string
  freshUntil: number
}

let cache: CacheEntry | null = null

/** Test seam: drop the cached verification. */
export function resetFreeModelCache(): void {
  cache = null
}

/** True only when both prompt and completion pricing are exactly zero. */
export function priceIsZero(value: unknown): boolean {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(numeric) && numeric === 0
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Does this model reply in text *only*?
 *
 * Text-only is the correct test for a chat assistant: a music/audio generator
 * such as a Lyria preview advertises `text+image->text+audio`, which would
 * otherwise look chat-capable.
 */
export function outputsText(model: Record<string, unknown>): boolean {
  const architecture = (model['architecture'] ?? {}) as Record<string, unknown>
  const outputModalities = architecture['output_modalities']
  if (Array.isArray(outputModalities) && outputModalities.length > 0) {
    return outputModalities.every((entry) => String(entry).toLowerCase() === 'text')
  }
  const modality = readString(architecture['modality'])
  if (modality && modality.includes('->')) {
    const outputs = (modality.split('->')[1] ?? '')
      .split('+')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
    return outputs.length > 0 && outputs.every((part) => part === 'text')
  }
  // Older catalogue entries omit modality entirely; assume chat-capable.
  return true
}

/** Models that are not conversational and would produce useless replies. */
const NON_CONVERSATIONAL = ['content-safety', 'embed', 'moderation', 'rerank', 'guard', 'lyria']

function isConversational(id: string): boolean {
  const lower = id.toLowerCase()
  return !NON_CONVERSATIONAL.some((needle) => lower.includes(needle))
}

/**
 * Reduce a raw `/models` payload to verified, fully-free, chat-capable models.
 * Deterministic ordering: the free router first (most robust default), then by
 * context window, then by id — so results never shuffle between requests.
 */
export function usableFreeModels(payload: unknown): FreeModelInfo[] {
  const data =
    payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data as unknown[])
      : []

  const seen = new Set<string>()
  const models: FreeModelInfo[] = []

  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const id = readString(raw['id'])
    if (!id || seen.has(id) || !isConversational(id)) continue

    const pricing = (raw['pricing'] ?? {}) as Record<string, unknown>
    if (!priceIsZero(pricing['prompt']) || !priceIsZero(pricing['completion'])) continue
    if (!outputsText(raw)) continue

    const contextLength =
      typeof raw['context_length'] === 'number' && Number.isFinite(raw['context_length'])
        ? (raw['context_length'] as number)
        : 0

    seen.add(id)
    models.push({
      id,
      name: readString(raw['name']) ?? id,
      contextLength,
      isRouter: id === FREE_ROUTER_MODEL,
    })
  }

  return models.sort((a, b) => {
    if (Boolean(a.isRouter) !== Boolean(b.isRouter)) return a.isRouter ? -1 : 1
    if (a.contextLength !== b.contextLength) return b.contextLength - a.contextLength
    return a.id.localeCompare(b.id)
  })
}

export interface GetFreeModelsOptions {
  apiKey?: string
  baseUrl?: string
  fetchImpl: FetchLike
  now?: () => number
  /** Skip the cache and re-verify (used when a model turns out to be stale). */
  force?: boolean
}

/**
 * Return the currently verified free models, re-checking the live catalogue at
 * most once per TTL. Never throws: a verification failure degrades to the last
 * known-good list, or to "unavailable" (which still leaves the free router).
 */
export async function getFreeModels(options: GetFreeModelsOptions): Promise<FreeModelList> {
  const nowMs = (options.now ?? Date.now)()
  if (!options.force && cache && nowMs < cache.freshUntil) {
    return { models: cache.models, source: 'cache', verifiedAt: cache.verifiedAt }
  }

  const baseUrl = (options.baseUrl ?? OPENROUTER_DEFAULT_BASE).replace(/\/+$/, '')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.apiKey) headers['Authorization'] = `Bearer ${options.apiKey}`

  try {
    const response = await options.fetchImpl(`${baseUrl}/models`, { method: 'GET', headers })
    if (!response.ok) {
      return staleOrUnavailable(`OpenRouter rejected the model list request (${response.status}).`)
    }
    const models = usableFreeModels(await response.json())
    if (models.length === 0) {
      return staleOrUnavailable('No 100% free chat models were found in the catalogue.')
    }
    const verifiedAt = new Date(nowMs).toISOString()
    cache = { models, verifiedAt, freshUntil: nowMs + FREE_LIST_TTL_MS }
    return { models, source: 'live', verifiedAt }
  } catch {
    return staleOrUnavailable('Could not reach OpenRouter to verify free models.')
  }
}

function staleOrUnavailable(message: string): FreeModelList {
  if (cache) {
    return {
      models: cache.models,
      source: 'cache',
      verifiedAt: cache.verifiedAt,
      message: `${message} Using the list verified at ${cache.verifiedAt}.`,
    }
  }
  return { models: [], source: 'unavailable', verifiedAt: null, message }
}

export interface ModelResolution {
  /** Ordered models to try, best first. Always 100% free or the free router. */
  candidates: string[]
  /** Set when the caller asked for a model that is no longer free. */
  rejectedRequest: string | null
  list: FreeModelList
}

/**
 * Decide which models may serve this request.
 *
 * A requested model is honoured only if the live catalogue still reports it as
 * fully free; otherwise it is dropped (never silently paid) and the caller is
 * told, so the UI can explain the switch.
 *
 * Concrete models are tried before the free router. `openrouter/free` picks
 * whatever free model is cheapest at that moment, and its pool includes
 * classifiers and guard models: asked for training guidance it once answered
 * "User Safety: safe" from `nemotron-3.5-content-safety`. Naming a model we have
 * already verified as conversational keeps the reply on-topic, and the router
 * stays last as a fallback for when every named model is rate limited.
 */
export function resolveModelCandidates(
  requested: string | undefined,
  list: FreeModelList,
): ModelResolution {
  const freeIds = new Set(list.models.map((model) => model.id))
  const ordered: string[] = []
  let rejectedRequest: string | null = null

  const trimmed = requested?.trim()
  if (trimmed) {
    const allowed = freeIds.has(trimmed) || trimmed === FREE_ROUTER_MODEL
    if (allowed) ordered.push(trimmed)
    else rejectedRequest = trimmed
  }

  for (const model of list.models) {
    if (ordered.length >= MAX_MODEL_CANDIDATES) break
    if (model.isRouter) continue
    if (!ordered.includes(model.id)) ordered.push(model.id)
  }
  if (!ordered.includes(FREE_ROUTER_MODEL)) ordered.push(FREE_ROUTER_MODEL)

  return { candidates: ordered.slice(0, MAX_MODEL_CANDIDATES), rejectedRequest, list }
}

/* ------------------------------------------------------------------ *
 * Vision-capable free models
 *
 * Screen awareness is optional, and OpenRouter's free tier rarely includes an
 * image-capable model. Rather than quietly falling back to a paid one, we track
 * the free vision models separately and report clearly when there are none.
 * ------------------------------------------------------------------ */

/** Does this model accept image input? */
export function acceptsImage(model: Record<string, unknown>): boolean {
  const architecture = (model['architecture'] ?? {}) as Record<string, unknown>
  const inputModalities = architecture['input_modalities']
  if (Array.isArray(inputModalities) && inputModalities.length > 0) {
    return inputModalities.some((entry) => String(entry).toLowerCase() === 'image')
  }
  const modality = readString(architecture['modality'])
  if (modality && modality.includes('->')) {
    const inputs = (modality.split('->')[0] ?? '')
      .split('+')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
    return inputs.includes('image')
  }
  return false
}

/**
 * Free, conversational, text-output models that also accept images.
 *
 * The free router is excluded: it does not advertise a fixed modality, so
 * routing a screenshot through it would risk landing on a paid vision model.
 */
export function visionFreeModels(payload: unknown): FreeModelInfo[] {
  return usableFreeModels(payload).filter((model) => {
    if (model.isRouter) return false
    const data =
      payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
        ? ((payload as { data: unknown[] }).data as unknown[])
        : []
    const entry = data.find(
      (item) => item && typeof item === 'object' && (item as Record<string, unknown>)['id'] === model.id,
    ) as Record<string, unknown> | undefined
    return entry ? acceptsImage(entry) : false
  })
}

let visionCache: CacheEntry | null = null

/** Test seam: drop the cached vision verification. */
export function resetVisionModelCache(): void {
  visionCache = null
}

/**
 * Return verified free vision models. Never throws. Returns an empty list with
 * a message when none exist, which is the honest answer rather than a paid one.
 */
export async function getFreeVisionModels(
  options: GetFreeModelsOptions,
): Promise<FreeModelList> {
  const nowMs = (options.now ?? Date.now)()
  if (!options.force && visionCache && nowMs < visionCache.freshUntil) {
    return { models: visionCache.models, source: 'cache', verifiedAt: visionCache.verifiedAt }
  }

  const baseUrl = (options.baseUrl ?? OPENROUTER_DEFAULT_BASE).replace(/\/+$/, '')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.apiKey) headers['Authorization'] = `Bearer ${options.apiKey}`

  try {
    const response = await options.fetchImpl(`${baseUrl}/models`, { method: 'GET', headers })
    if (!response.ok) {
      return visionStale('OpenRouter rejected the model list request.')
    }
    const models = visionFreeModels(await response.json())
    if (models.length === 0) {
      return visionStale('No free model can currently read images.')
    }
    const verifiedAt = new Date(nowMs).toISOString()
    visionCache = { models, verifiedAt, freshUntil: nowMs + FREE_LIST_TTL_MS }
    return { models, source: 'live', verifiedAt }
  } catch {
    return visionStale('Could not reach OpenRouter to verify free image models.')
  }
}

function visionStale(message: string): FreeModelList {
  if (visionCache) {
    return {
      models: visionCache.models,
      source: 'cache',
      verifiedAt: visionCache.verifiedAt,
      message,
    }
  }
  return { models: [], source: 'unavailable', verifiedAt: null, message }
}
