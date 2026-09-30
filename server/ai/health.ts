import { runPlanningChat, type PlanningChatInput } from './openrouter.js'
import type { FetchLike } from './models.js'
import { AiProxyError } from './errors.js'

/**
 * Health guidance from wearable data.
 *
 * The server never reads the health tables. The browser computes the summary and
 * sends the numbers, and this module validates them before they are allowed near
 * a model. That keeps the existing "no database access in the AI proxy" rule
 * intact — the same rule that means a bug here cannot leak one person's medical
 * history into another person's conversation — and it keeps the prompt to a few
 * dozen tokens of aggregates rather than a raw reading stream.
 *
 * What the model is told
 *
 * Trends and a short digest, nothing identifying. It is asked for practical
 * guidance tied to the person's existing planner, and it is explicitly told not
 * to diagnose. Advice about health is easy to give badly, so the prompt draws a
 * hard line: no medical claims, no conditions, refer anything concerning to a
 * clinician.
 */

export interface HealthZoneShare {
  label: string
  minutes: number
  share: number
}

export interface HealthSummary {
  windowDays: number
  heartRate: { average: number | null; min: number | null; max: number | null; count: number }
  restingHeartRate: { average: number | null }
  steps: { total: number | null }
  sleepMinutes: { total: number | null }
  activeMinutes: { total: number | null }
  zones: HealthZoneShare[]
  sampleCount: number
}

const MAX_WINDOW_DAYS = 90

function finite(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function optionalNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(max, Math.max(min, n))
}

/**
 * Coerce whatever the client sent into a summary we are willing to put in a
 * prompt. Unknown shapes become `null` rather than passing through, so a
 * tampered or buggy client cannot inject arbitrary text as "numbers".
 */
export function parseHealthSummary(input: unknown): HealthSummary {
  if (!input || typeof input !== 'object') {
    throw new AiProxyError('bad_request', 'No health summary was supplied.', { retryable: false })
  }
  const raw = input as Record<string, any>
  const hr = raw.heartRate ?? {}
  const zones = Array.isArray(raw.zones) ? raw.zones : []

  return {
    windowDays: Math.round(finite(raw.windowDays, 1, MAX_WINDOW_DAYS, 7)),
    heartRate: {
      average: optionalNumber(hr.average, 25, 240),
      min: optionalNumber(hr.min, 25, 240),
      max: optionalNumber(hr.max, 25, 240),
      count: Math.round(finite(hr.count, 0, 1_000_000, 0)),
    },
    restingHeartRate: { average: optionalNumber(raw.restingHeartRate?.average, 25, 140) },
    steps: { total: optionalNumber(raw.steps?.total, 0, 200_000) },
    sleepMinutes: { total: optionalNumber(raw.sleepMinutes?.total, 0, 1440) },
    activeMinutes: { total: optionalNumber(raw.activeMinutes?.total, 0, 1440) },
    zones: zones.slice(0, 8).map((zone: Record<string, unknown>) => ({
      label: typeof zone?.label === 'string' ? zone.label.slice(0, 24) : 'Unknown',
      minutes: finite(zone?.minutes, 0, 1440, 0),
      share: finite(zone?.share, 0, 100, 0),
    })),
    sampleCount: Math.round(finite(raw.sampleCount, 0, 1_000_000, 0)),
  }
}

const HEALTH_SYSTEM_PROMPT = `You are LUMA's health guide. You are given a short, anonymised summary of readings from the person's own wearable: heart rate, resting heart rate, time in heart-rate zones, steps, sleep and active minutes.

How to answer:
- Lead with the single most useful observation in the data, in one sentence.
- Then give two or three concrete, specific actions they can take in the next day or two. Tie them to their real numbers.
- If the data is thin, say so plainly and suggest what to record next instead of inventing insight.
- Keep it under 200 words. Plain prose or a short list. No headings longer than three words.

Hard limits, and they are not stylistic preferences:
- You are not a clinician. Never name or suggest a condition, diagnosis, or that a reading "means" something medically specific.
- Never tell the person to change medication, and never advise against seeing a doctor.
- If a number is concerning — sustained very high or very low heart rate at rest, or a resting rate far from their own normal — say plainly that it is worth mentioning to a clinician, and stop there. Do not speculate why.
- Do not recommend weight loss or comment on body composition. You have no body data and this is a planner, not a diet.
- Do not invent numbers that were not given to you. If something is missing, say it is missing.

You share the person's planner, so when a suggestion would fit a scheduled day you may propose it with a tool. Propose at most two actions, and never propose anything destructive without asking first.`

/** Render the validated summary as the digest the model actually sees. */
export function renderHealthContext(summary: HealthSummary): string {
  const lines = [`Wearable summary (last ${summary.windowDays} day(s), ${summary.sampleCount} readings):`]
  const hr = summary.heartRate
  if (hr.average != null) {
    lines.push(`- Heart rate: average ${hr.average} bpm, range ${hr.min ?? '?'}-${hr.max ?? '?'} bpm.`)
  }
  if (summary.restingHeartRate.average != null) {
    lines.push(`- Resting heart rate: ${summary.restingHeartRate.average} bpm.`)
  }
  const zones = summary.zones.filter((zone) => zone.minutes > 0)
  if (zones.length > 0) {
    lines.push(`- Time in zones: ${zones.map((zone) => `${zone.label} ${zone.minutes} min`).join(', ')}.`)
  }
  if (summary.steps.total != null) lines.push(`- Steps: ${summary.steps.total}.`)
  if (summary.sleepMinutes.total != null) {
    const hours = (summary.sleepMinutes.total / 60).toFixed(1)
    lines.push(`- Sleep logged: ${hours} h.`)
  }
  if (summary.activeMinutes.total != null) lines.push(`- Active minutes: ${summary.activeMinutes.total}.`)
  if (lines.length === 1) lines.push('- No readings recorded yet.')
  return lines.join('\n')
}

export interface HealthGuidanceInput {
  apiKey: string
  fetchImpl: FetchLike
  baseUrl?: string
  modelCandidates: string[]
  summary: HealthSummary
  question: string
  context?: PlanningChatInput['context']
  temperature: number
  maxTokens: number
  toolsEnabled?: boolean
  signal?: AbortSignal
}

/**
 * Ask a verified-free model for guidance on the person's own readings.
 *
 * Reuses the planning transport rather than a second one, so the free-model
 * re-verification, the model fallback chain and the tool confirmation flow are
 * exactly the ones the assistant already relies on.
 */
export async function runHealthGuidance(
  input: HealthGuidanceInput,
): Promise<Awaited<ReturnType<typeof runPlanningChat>>> {
  if (input.modelCandidates.length === 0) {
    throw new AiProxyError('no_free_model', 'No free model is currently available.')
  }
  const question = input.question.trim().slice(0, 400) || 'How is my training going, and what should I change?'

  return runPlanningChat({
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    baseUrl: input.baseUrl,
    modelCandidates: input.modelCandidates,
    history: [
      {
        role: 'user',
        content: `${renderHealthContext(input.summary)}\n\n${question}`,
      },
    ],
    context: input.context,
    systemPrompt: HEALTH_SYSTEM_PROMPT,
    toolsEnabled: input.toolsEnabled === true,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    signal: input.signal,
  })
}
