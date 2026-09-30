import { beforeEach, describe, expect, it } from 'vitest'
import {
  FREE_ROUTER_MODEL,
  getFreeModels,
  outputsText,
  priceIsZero,
  resetFreeModelCache,
  resolveModelCandidates,
  usableFreeModels,
  type FetchLike,
} from '../models'

/** A catalogue shaped like the real OpenRouter `/models` response. */
function catalogue(data: unknown[]): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return { ok: true, status: 200, json: async () => ({ data }) }
}

function chatModel(id: string, prompt: string, completion: string, context = 1000) {
  return {
    id,
    name: id,
    context_length: context,
    pricing: { prompt, completion },
    architecture: { output_modalities: ['text'] },
  }
}

beforeEach(() => {
  resetFreeModelCache()
})

describe('priceIsZero', () => {
  it('accepts only an exact zero price', () => {
    expect(priceIsZero('0')).toBe(true)
    expect(priceIsZero(0)).toBe(true)
    expect(priceIsZero('0.0')).toBe(true)
  })

  it('rejects dynamic (-1), paid and unparseable prices', () => {
    // OpenRouter uses -1 for "dynamic pricing" on router models — never free.
    expect(priceIsZero('-1')).toBe(false)
    expect(priceIsZero('0.0001')).toBe(false)
    expect(priceIsZero(undefined)).toBe(false)
    expect(priceIsZero('free')).toBe(false)
  })
})

describe('outputsText', () => {
  it('reads output_modalities when present', () => {
    expect(outputsText({ architecture: { output_modalities: ['text'] } })).toBe(true)
    expect(outputsText({ architecture: { output_modalities: ['audio'] } })).toBe(false)
  })

  it('falls back to the modality string', () => {
    expect(outputsText({ architecture: { modality: 'text+image->text' } })).toBe(true)
    expect(outputsText({ architecture: { modality: 'text->audio' } })).toBe(false)
    // A music/audio generator (e.g. a Lyria preview) must not look chat-capable.
    expect(outputsText({ architecture: { modality: 'text+image->text+audio' } })).toBe(false)
  })

  it('assumes chat-capable when the catalogue omits architecture', () => {
    expect(outputsText({})).toBe(true)
  })
})

describe('usableFreeModels', () => {
  it('keeps only fully-free, text-output, conversational models', () => {
    const models = usableFreeModels({
      data: [
        chatModel('a/free-model:free', '0', '0'),
        chatModel('b/paid-model', '0.5', '1.5'),
        chatModel('c/dynamic-router', '-1', '-1'),
        chatModel('nvidia/nemotron-content-safety:free', '0', '0'),
        {
          id: 'd/audio-out:free',
          pricing: { prompt: '0', completion: '0' },
          architecture: { output_modalities: ['audio'] },
          context_length: 10,
        },
      ],
    })
    expect(models.map((model) => model.id)).toEqual(['a/free-model:free'])
  })

  it('always puts the free router first, then the largest context window', () => {
    const models = usableFreeModels({
      data: [
        chatModel('small/model:free', '0', '0', 1_000),
        chatModel('big/model:free', '0', '0', 900_000),
        chatModel(FREE_ROUTER_MODEL, '0', '0', 200_000),
      ],
    })
    expect(models.map((model) => model.id)).toEqual([
      FREE_ROUTER_MODEL,
      'big/model:free',
      'small/model:free',
    ])
    expect(models[0]?.isRouter).toBe(true)
  })

  it('ignores malformed entries instead of throwing', () => {
    expect(usableFreeModels({ data: [null, 'nope', { id: 42 }, {}] })).toEqual([])
    expect(usableFreeModels(undefined)).toEqual([])
    expect(usableFreeModels('not-json')).toEqual([])
  })
})

describe('getFreeModels', () => {
  const payload = { data: [chatModel('one:free', '0', '0'), chatModel('two:free', '0', '0')] }

  it('verifies live, then serves from cache inside the TTL', async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls += 1
      return { ok: true, status: 200, json: async () => payload }
    }

    const now = () => 1_000
    const first = await getFreeModels({ apiKey: 'k', fetchImpl, now })
    expect(first.source).toBe('live')
    expect(first.models).toHaveLength(2)

    const second = await getFreeModels({ apiKey: 'k', fetchImpl, now })
    expect(second.source).toBe('cache')
    expect(calls).toBe(1)
  })

  it('re-verifies once the TTL expires', async () => {
    let calls = 0
    const fetchImpl: FetchLike = async () => {
      calls += 1
      return { ok: true, status: 200, json: async () => payload }
    }
    let clock = 1_000
    await getFreeModels({ apiKey: 'k', fetchImpl, now: () => clock })
    clock += 11 * 60 * 1000
    const result = await getFreeModels({ apiKey: 'k', fetchImpl, now: () => clock })
    expect(result.source).toBe('live')
    expect(calls).toBe(2)
  })

  it('falls back to the last good list when verification fails', async () => {
    const ok: FetchLike = async () => ({ ok: true, status: 200, json: async () => payload })
    let clock = 1_000
    await getFreeModels({ apiKey: 'k', fetchImpl: ok, now: () => clock })

    clock += 11 * 60 * 1000
    const failing: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}) })
    const result = await getFreeModels({ apiKey: 'k', fetchImpl: failing, now: () => clock })
    expect(result.source).toBe('cache')
    expect(result.models).toHaveLength(2)
    expect(result.message).toMatch(/verified at/)
  })

  it('reports unavailable (never silently paid) when it has never verified', async () => {
    const failing: FetchLike = async () => {
      throw new Error('network down')
    }
    const result = await getFreeModels({ apiKey: 'k', fetchImpl: failing })
    expect(result.source).toBe('unavailable')
    expect(result.models).toEqual([])
  })

  it('excludes every non-free price from a mixed catalogue', async () => {
    const fetchImpl: FetchLike = async () =>
      catalogue([
        chatModel('free-a:free', '0', '0'),
        chatModel('half-free', '0', '0.001'),
        chatModel('free-b:free', '0', '0'),

describe('resolveModelCandidates', () => {
  const list = {
    models: usableFreeModels({
      data: [chatModel(FREE_ROUTER_MODEL, '0', '0'), chatModel('plain:free', '0', '0', 5000)],
    }),
    source: 'live' as const,
    verifiedAt: '2026-01-01T00:00:00.000Z',
  }

  it('honours a requested model that is still 100% free', () => {
    const result = resolveModelCandidates('plain:free', list)
    expect(result.candidates[0]).toBe('plain:free')
    expect(result.rejectedRequest).toBeNull()
  })

  it('drops a requested model that is no longer free and reports it', () => {
    const result = resolveModelCandidates('paid/model', list)
    expect(result.candidates).not.toContain('paid/model')
    expect(result.rejectedRequest).toBe('paid/model')
  })

  it('always allows the free router and keeps a bounded chain', () => {
    const result = resolveModelCandidates(undefined, list)
    expect(result.candidates).toEqual(['plain:free', FREE_ROUTER_MODEL])
    expect(result.candidates.length).toBeLessThanOrEqual(3)
  })

  it('tries a named conversational model before the router', () => {
    // Regression: the router was tried first and once answered a health
    // question with "User Safety: safe" from a content-safety classifier.
    const result = resolveModelCandidates(undefined, list)
    expect(result.candidates.indexOf('plain:free')).toBeLessThan(
      result.candidates.indexOf(FREE_ROUTER_MODEL),
    )
  })

  it('still offers the free router when verification is unavailable', () => {
    const empty = { models: [], source: 'unavailable' as const, verifiedAt: null }
    expect(resolveModelCandidates(undefined, empty).candidates).toEqual([FREE_ROUTER_MODEL])
  })

  it('never falls back to a paid or unknown model', () => {
    const result = resolveModelCandidates('gpt-paid', list)
    for (const candidate of result.candidates) {
      const known = list.models.some((model) => model.id === candidate)
      expect(known || candidate === FREE_ROUTER_MODEL).toBe(true)
    }
  })
})

      ])
    const list = await getFreeModels({ fetchImpl })
    expect(list.models.map((model) => model.id)).toEqual(['free-a:free', 'free-b:free'])
  })
})
