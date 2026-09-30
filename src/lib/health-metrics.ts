import { HEALTH_METRIC_UNITS, type HealthMetric, type HealthSample } from '@/types/models'

/**
 * Health maths, kept pure and separate from the device plumbing.
 *
 * Everything here is deterministic and side-effect free so the numbers shown on
 * the health page, the numbers sent to the AI, and the numbers asserted in
 * tests all come from one implementation.
 */

/**
 * Physiological plausibility, not a diagnosis.
 *
 * A strap that reports 900 bpm is broken or misreading, and storing that would
 * poison every average downstream. These bounds are deliberately wide: the goal
 * is to reject garbage, not to second-guess a genuine reading.
 */
export const METRIC_BOUNDS: Record<HealthMetric, { min: number; max: number }> = {
  heart_rate: { min: 25, max: 240 },
  resting_heart_rate: { min: 25, max: 140 },
  hrv: { min: 1, max: 400 },
  steps: { min: 0, max: 200_000 },
  sleep_minutes: { min: 0, max: 24 * 60 },
  calories: { min: 0, max: 30_000 },
  distance_m: { min: 0, max: 500_000 },
  spo2: { min: 70, max: 100 },
  active_minutes: { min: 0, max: 24 * 60 },
}

/** True when the reading is inside the plausible range for its metric. */
export function isPlausible(metric: HealthMetric, value: number): boolean {
  if (!Number.isFinite(value)) return false
  const bounds = METRIC_BOUNDS[metric]
  if (!bounds) return false
  return value >= bounds.min && value <= bounds.max
}

/** The unit a metric is recorded in. Falls back to an empty unit for unknowns. */
export function unitFor(metric: HealthMetric): string {
  return HEALTH_METRIC_UNITS[metric] ?? ''
}

/* ------------------------------------------------------------------ *
 * Heart-rate zones
 * ------------------------------------------------------------------ */

export type HeartRateZone = 'rest' | 'light' | 'moderate' | 'vigorous' | 'peak'

export const HEART_RATE_ZONES: Array<{ zone: HeartRateZone; label: string; from: number; to: number }> = [
  { zone: 'rest', label: 'Rest', from: 0, to: 0.6 },
  { zone: 'light', label: 'Light', from: 0.6, to: 0.7 },
  { zone: 'moderate', label: 'Moderate', from: 0.7, to: 0.8 },
  { zone: 'vigorous', label: 'Vigorous', from: 0.8, to: 0.9 },
  { zone: 'peak', label: 'Peak', from: 0.9, to: 1.01 },
]

/**
 * Classify a heart rate against a reserve range.
 *
 * Uses heart-rate *reserve* (% of `max - resting` above resting) rather than
 * % of max, because reserve tracks effort far better at the low end — the
 * difference between "easy run" and "threshold" at 150 bpm is not visible in a
 * flat percentage-of-max scale.
 *
 * Falls back to fractions of max when no resting rate is known yet, which is the
 * case on a brand-new account.
 */
export function heartRateZone(
  bpm: number,
  restingBpm: number | null,
  maxBpm = 205,
): HeartRateZone {
  const ceiling = restingBpm != null && restingBpm > 0 ? restingBpm + (maxBpm - restingBpm) * 0.85 : maxBpm * 0.85
  const floor = restingBpm != null && restingBpm > 0 ? restingBpm : 0
  const span = ceiling - floor
  if (span <= 0) return 'rest'
  const fraction = (bpm - floor) / span
  for (const band of HEART_RATE_ZONES) {
    if (fraction >= band.from && fraction < band.to) return band.zone
  }
  return fraction >= 0.9 ? 'peak' : 'rest'
}

export function heartRateZoneLabel(zone: HeartRateZone): string {
  return HEART_RATE_ZONES.find((band) => band.zone === zone)?.label ?? 'Rest'
}

/* ------------------------------------------------------------------ *
 * Aggregates
 * ------------------------------------------------------------------ */

export interface SeriesSummary {
  /** Number of readings considered. */
  count: number
  /** Wall-clock span of the readings, in minutes. */
  spanMinutes: number
  average: number | null
  min: number | null
  max: number | null
  /** Total for additive metrics (steps, calories, sleep), null otherwise. */
  total: number | null
}

const ADDITIVE_METRICS: HealthMetric[] = ['steps', 'calories', 'sleep_minutes', 'distance_m', 'active_minutes']

export function isAdditive(metric: HealthMetric): boolean {
  return ADDITIVE_METRICS.includes(metric)
}

function round(value: number, places = 0): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/**
 * Reduce the samples of one metric to the numbers the UI and the AI need.
 *
 * Averages are time-weighted when the samples carry timestamps, because a
 * heart-rate monitor that transmits twice a second and one that transmits once
 * a minute should not produce the same "average" from the same number of rows.
 */
export function summarise(samples: HealthSample[], metric: HealthMetric): SeriesSummary {
  const rows = samples
    .filter((sample) => sample.metric === metric)
    .map((sample) => ({ at: new Date(sample.recorded_at).getTime(), value: sample.value }))
    .filter((row) => Number.isFinite(row.at) && Number.isFinite(row.value))
    .sort((a, b) => a.at - b.at)

  if (rows.length === 0) {
    return { count: 0, spanMinutes: 0, average: null, min: null, max: null, total: null }
  }

  const first = rows[0]!
  const last = rows[rows.length - 1]!
  const values = rows.map((row) => row.value)
  const total = values.reduce((sum, value) => sum + value, 0)
  const spanMinutes = round((last.at - first.at) / 60000, 1)

  let average: number
  if (rows.length === 1) {
    average = values[0]!
  } else {
    // Trapezoidal time weighting, falling back to a flat mean when every sample
    // shares a timestamp (a bulk import, for instance).
    let weighted = 0
    let weight = 0
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1]!
      const current = rows[i]!
      const minutes = (current.at - previous.at) / 60000
      if (minutes <= 0) continue
      weighted += ((current.value + previous.value) / 2) * minutes
      weight += minutes
    }
    average = weight > 0 ? weighted / weight : total / values.length
  }

  return {
    count: rows.length,
    spanMinutes,
    average: round(average, 1),
    min: Math.min(...values),
    max: Math.max(...values),
    total: isAdditive(metric) ? round(total) : null,
  }
}

export interface ZoneSummary {
  zone: HeartRateZone
  label: string
  minutes: number
  share: number
}

/** Minutes spent in each heart-rate zone, using gaps between samples. */
export function zoneMinutes(samples: HealthSample[], restingBpm: number | null): ZoneSummary[] {
  const rows = samples
    .filter((sample) => sample.metric === 'heart_rate')
    .map((sample) => ({ at: new Date(sample.recorded_at).getTime(), value: sample.value }))
    .filter((row) => Number.isFinite(row.at) && isPlausible('heart_rate', row.value))
    .sort((a, b) => a.at - b.at)

  const totals = new Map<HeartRateZone, number>(HEART_RATE_ZONES.map((band) => [band.zone, 0]))
  for (let i = 1; i < rows.length; i += 1) {
    const previous = rows[i - 1]!
    const current = rows[i]!
    const minutes = (current.at - previous.at) / 60000
    if (minutes <= 0) continue
    // A gap longer than five minutes is the strap being off, not a zone.
    if (minutes > 5) continue
    const zone = heartRateZone(previous.value, restingBpm)
    totals.set(zone, (totals.get(zone) ?? 0) + minutes)
  }

  const sum = [...totals.values()].reduce((acc, value) => acc + value, 0)
  return HEART_RATE_ZONES.map((band) => {
    const minutes = round(totals.get(band.zone) ?? 0, 1)
    return { zone: band.zone, label: band.label, minutes, share: sum > 0 ? Math.round((minutes / sum) * 100) : 0 }
  })
}

export interface HealthOverview {
  windowDays: number
  heartRate: SeriesSummary
  restingHeartRate: SeriesSummary
  steps: SeriesSummary
  sleep: SeriesSummary
  activeMinutes: SeriesSummary
  zones: ZoneSummary[]
  totalSamples: number
  hasDevice: boolean
  lastSampleAt: string | null
}

/**
 * The single object the health page renders and the AI is given.
 *
 * Kept to a handful of numbers on purpose: the assistant is told trends, not a
 * raw dump of every reading, so the prompt stays small and nothing identifiable
 * beyond "how you have been training" has to leave the device.
 */
export function buildOverview(samples: HealthSample[], options: { windowDays: number; hasDevice: boolean }): HealthOverview {
  const restingSummary = summarise(samples, 'resting_heart_rate')
  const restingBpm = restingSummary.average
  return {
    windowDays: options.windowDays,
    heartRate: summarise(samples, 'heart_rate'),
    restingHeartRate: restingSummary,
    steps: summarise(samples, 'steps'),
    sleep: summarise(samples, 'sleep_minutes'),
    activeMinutes: summarise(samples, 'active_minutes'),
    zones: zoneMinutes(samples, restingBpm),
    totalSamples: samples.length,
    hasDevice: options.hasDevice,
    lastSampleAt: samples[samples.length - 1]?.recorded_at ?? null,
  }
}

/** A compact, human-readable digest handed to the model. */
export function describeOverview(overview: HealthOverview): string {
  if (overview.totalSamples === 0) {
    return `No health readings recorded in the last ${overview.windowDays} day(s). No wearable is connected.`
  }
  const parts: string[] = [`Health readings from the last ${overview.windowDays} day(s):`]
  const hr = overview.heartRate
  if (hr.count > 0) {
    parts.push(
      `- Heart rate: avg ${hr.average} bpm, range ${hr.min}-${hr.max} bpm, ${hr.count} readings over ${hr.spanMinutes} min.`,
    )
  }
  if (overview.restingHeartRate.count > 0) {
    parts.push(`- Resting heart rate: avg ${overview.restingHeartRate.average} bpm.`)
  }
  const zones = overview.zones.filter((zone) => zone.minutes > 0)
  if (zones.length > 0) {
    parts.push(
      `- Time in zones: ${zones.map((zone) => `${zone.label} ${zone.minutes} min`).join(', ')}.`,
    )
  }
  if (overview.steps.total != null) {
    parts.push(`- Steps: ${overview.steps.total} total, avg ${overview.steps.average} per reading.`)
  }
  if (overview.sleep.total != null) {
    parts.push(`- Sleep logged: ${overview.sleep.total} min total.`)
  }
  if (overview.activeMinutes.total != null) {
    parts.push(`- Active minutes: ${overview.activeMinutes.total}.`)
  }
  return parts.join('\n')
}
