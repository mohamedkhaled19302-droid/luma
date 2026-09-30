import { describe, expect, it } from 'vitest'
import {
  METRIC_BOUNDS,
  buildOverview,
  describeOverview,
  heartRateZone,
  isPlausible,
  summarise,
  unitFor,
  zoneMinutes,
} from '../health-metrics'
import type { HealthMetric, HealthSample } from '@/types/models'

/**
 * The maths behind the health page and the AI digest.
 *
 * These assertions exist because the numbers are the product here: a wrong
 * average silently misleads both the person looking at the chart and the model
 * reading the summary, and neither would ever say so.
 */

let seq = 0

function sample(metric: HealthMetric, value: number, iso: string): HealthSample {
  seq += 1
  return {
    id: `s${seq}`,
    user_id: 'u1',
    metric,
    value,
    unit: unitFor(metric),
    recorded_at: iso,
    received_at: iso,
    source: 'bluetooth',
    device_name: 'H10',
    session_id: null,
    note: null,
    created_at: iso,
  }
}

describe('isPlausible', () => {
  it('rejects readings outside the physiological bounds', () => {
    expect(isPlausible('heart_rate', 60)).toBe(true)
    expect(isPlausible('heart_rate', 900)).toBe(false)
    expect(isPlausible('heart_rate', Number.NaN)).toBe(false)
    expect(isPlausible('steps', -1)).toBe(false)
  })

  it('accepts both ends of every declared range', () => {
    for (const [metric, bounds] of Object.entries(METRIC_BOUNDS)) {
      expect(isPlausible(metric as HealthMetric, bounds.min)).toBe(true)
      expect(isPlausible(metric as HealthMetric, bounds.max)).toBe(true)
    }
  })

  it('rejects values one step outside the range', () => {
    for (const [metric, bounds] of Object.entries(METRIC_BOUNDS)) {
      expect(isPlausible(metric as HealthMetric, bounds.min - 1)).toBe(false)
      expect(isPlausible(metric as HealthMetric, bounds.max + 1)).toBe(false)
    }
  })
})

describe('summarise', () => {
  it('returns nulls rather than zeroes for an empty series', () => {
    const result = summarise([], 'heart_rate')
    expect(result).toEqual({
      count: 0,
      spanMinutes: 0,
      average: null,
      min: null,
      max: null,
      total: null,
    })
  })

  it('handles a single reading without dividing by zero', () => {
    const result = summarise([sample('heart_rate', 62, '2026-03-01T08:00:00.000Z')], 'heart_rate')
    expect(result.count).toBe(1)
    expect(result.average).toBe(62)
  })

  it('weights by time, so a dense session does not dominate a sparse one', () => {
    // One minute at 100 bpm, then five minutes ramping to 140 bpm. Time
    // weighting gives 116.7; a flat mean of the three rows would give 113.3.
    const result = summarise(
      [
        sample('heart_rate', 100, '2026-03-01T08:00:00.000Z'),
        sample('heart_rate', 100, '2026-03-01T08:01:00.000Z'),
        sample('heart_rate', 140, '2026-03-01T08:06:00.000Z'),
      ],
      'heart_rate',
    )
    expect(result.average).toBeCloseTo(116.7, 1)
    expect(result.average).not.toBeCloseTo(113.3, 1)
  })

  it('falls back to a flat mean when every sample shares a timestamp', () => {
    const result = summarise(
      [
        sample('steps', 1000, '2026-03-01T08:00:00.000Z'),
        sample('steps', 2000, '2026-03-01T08:00:00.000Z'),
      ],
      'steps',
    )
    expect(result.average).toBe(1500)
  })

  it('totals additive metrics and leaves totals null for gauges', () => {
    const samples = [
      sample('steps', 1200, '2026-03-01T08:00:00.000Z'),
      sample('steps', 800, '2026-03-01T09:00:00.000Z'),
      sample('heart_rate', 70, '2026-03-01T08:00:00.000Z'),
    ]
    expect(summarise(samples, 'steps').total).toBe(2000)
    expect(summarise(samples, 'heart_rate').total).toBeNull()
  })

  it('ignores samples of other metrics and unreadable timestamps', () => {
    const samples = [
      sample('heart_rate', 70, '2026-03-01T08:00:00.000Z'),
      sample('heart_rate', 90, 'not-a-date'),
      sample('steps', 5000, '2026-03-01T08:00:00.000Z'),
    ]
    expect(summarise(samples, 'heart_rate').count).toBe(1)
  })
})

describe('heartRateZone', () => {
  it('puts a resting rate in the rest band', () => {
    expect(heartRateZone(58, 58)).toBe('rest')
  })

  it('classifies by heart-rate reserve, not % of max', () => {
    // With resting 55 and max 205 the ceiling is 55 + 150*0.85 = 182.5, so the
    // bands fall at roughly 131, 144, 157 and 170 bpm. 120 bpm is only 51% of
    // reserve, which is still rest even though it is 59% of max.
    expect(heartRateZone(120, 55)).toBe('rest')
    expect(heartRateZone(140, 55)).toBe('light')
    expect(heartRateZone(150, 55)).toBe('moderate')
    expect(heartRateZone(165, 55)).toBe('vigorous')
    expect(heartRateZone(180, 55)).toBe('peak')
  })

  it('moves the band edges when the resting rate changes', () => {
    // 128 bpm is 57% of reserve against a resting 55 (rest) but 61% against a
    // resting 45 (light), which is the point of using reserve at all.
    expect(heartRateZone(128, 55)).toBe('rest')
    expect(heartRateZone(128, 45)).toBe('light')
  })

  it('works without a known resting rate by falling back to a fraction of max', () => {
    expect(heartRateZone(70, null)).toBe('rest')
    expect(heartRateZone(190, null)).toBe('peak')
  })

  it('never throws for a zero or nonsense resting rate', () => {
    expect(heartRateZone(100, 0)).toMatch(/rest|light|moderate|vigorous|peak/)
  })
})

describe('zoneMinutes', () => {
  it('counts time between close samples and ignores gaps over five minutes', () => {
    // Each interval is credited to the earlier sample's zone. Against a resting
    // 60, 150 bpm is the moderate band (146-159) and 160 would be vigorous.
    // So rest gets 4 + 1 minutes and moderate gets 2. The 53 minute jump at the
    // end is the strap being off and must be dropped.
    const samples = [
      sample('heart_rate', 60, '2026-03-01T08:00:00.000Z'),
      sample('heart_rate', 60, '2026-03-01T08:04:00.000Z'),
      sample('heart_rate', 150, '2026-03-01T08:05:00.000Z'),
      sample('heart_rate', 150, '2026-03-01T08:07:00.000Z'),
      sample('heart_rate', 150, '2026-03-01T09:00:00.000Z'),
    ]
    const zones = zoneMinutes(samples, 60)
    expect(zones.find((z) => z.zone === 'rest')?.minutes).toBe(5)
    expect(zones.find((z) => z.zone === 'moderate')?.minutes).toBe(2)
    const total = zones.reduce((sum, zone) => sum + zone.minutes, 0)
    expect(total).toBe(7)
  })

  it('drops an implausible reading rather than letting it create zone time', () => {
    const samples = [
      sample('heart_rate', 60, '2026-03-01T08:00:00.000Z'),
      sample('heart_rate', 900, '2026-03-01T08:02:00.000Z'),
    ]
    expect(zoneMinutes(samples, 60).every((zone) => zone.minutes === 0)).toBe(true)
  })

  it('produces shares that add up to about 100 when there is data', () => {
    const samples = [
      sample('heart_rate', 60, '2026-03-01T08:00:00.000Z'),
      sample('heart_rate', 150, '2026-03-01T08:02:00.000Z'),
      sample('heart_rate', 60, '2026-03-01T08:04:00.000Z'),
    ]
    const total = zoneMinutes(samples, 60).reduce((sum, zone) => sum + zone.share, 0)
    expect(total).toBeGreaterThanOrEqual(95)
    expect(total).toBeLessThanOrEqual(100)
  })

  it('is all zeroes with no readings rather than NaN', () => {
    const zones = zoneMinutes([], 60)
    expect(zones.every((z) => z.minutes === 0 && z.share === 0)).toBe(true)
  })
})

describe('buildOverview and describeOverview', () => {
  it('reports zero samples and a null last reading when empty', () => {
    const overview = buildOverview([], { windowDays: 7, hasDevice: false })
    expect(overview.totalSamples).toBe(0)
    expect(overview.lastSampleAt).toBeNull()
    expect(describeOverview(overview)).toContain('No health readings')
  })

  it('threads the resting rate into the zone maths', () => {
    const samples = [
      sample('resting_heart_rate', 58, '2026-03-01T07:00:00.000Z'),
      sample('heart_rate', 60, '2026-03-01T08:00:00.000Z'),
      sample('heart_rate', 60, '2026-03-01T08:05:00.000Z'),
    ]
    const overview = buildOverview(samples, { windowDays: 7, hasDevice: true })
    expect(overview.restingHeartRate.average).toBe(58)
    expect(overview.hasDevice).toBe(true)
    expect(overview.lastSampleAt).toBe('2026-03-01T08:05:00.000Z')
  })

  it('produces a digest containing the numbers the model needs', () => {
    const samples = [
      sample('heart_rate', 120, '2026-03-01T08:00:00.000Z'),
      sample('steps', 4000, '2026-03-01T09:00:00.000Z'),
      sample('sleep_minutes', 420, '2026-03-01T10:00:00.000Z'),
    ]
    const text = describeOverview(buildOverview(samples, { windowDays: 7, hasDevice: true }))
    expect(text).toContain('7 day')
    expect(text).toContain('Heart rate')
    expect(text).toContain('Steps: 4000')
    expect(text).toContain('Sleep logged: 420 min total')
  })
})
