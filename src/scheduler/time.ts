import { MIN_SESSION_MINUTES } from './types'

export const DAY_MS = 24 * 60 * 60 * 1000

export interface Interval {
  start: number
  end: number
}

export function toMinutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

export function timeStringToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function formatMinutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Default awake window (07:00-23:00). */
export function defaultAwakeWindow() {
  return { awakeStart: '07:00', awakeEnd: '23:00' }
}

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export function formatDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start
}

/** Merge overlapping intervals. Input need not be sorted. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end)
    } else {
      merged.push({ ...interval })
    }
  }
  return merged
}

/**
 * Compute free intervals within [windowStart, windowEnd] by subtracting
 * occupied intervals. Occupied intervals may extend beyond the window.
 * Intervals shorter than minGapMinutes are excluded.
 */
export function computeFreeIntervals(
  occupied: Interval[],
  windowStart: number,
  windowEnd: number,
  minGapMinutes = MIN_SESSION_MINUTES,
): Interval[] {
  const merged = mergeIntervals(occupied)
  const free: Interval[] = []
  let cursor = windowStart

  for (const block of merged) {
    if (block.end <= cursor) continue
    if (block.start > cursor) {
      const gap = { start: cursor, end: Math.min(block.start, windowEnd) }
      if (gap.start < gap.end && gap.end - gap.start >= minGapMinutes * 60 * 1000) {
        free.push(gap)
      }
    }
    cursor = Math.max(cursor, block.end)
    if (cursor >= windowEnd) break
  }

  if (cursor < windowEnd) {
    const gap = { start: cursor, end: windowEnd }
    if (gap.end - gap.start >= minGapMinutes * 60 * 1000) {
      free.push(gap)
    }
  }
  return free.filter((gap) => gap.start >= windowStart && gap.end <= windowEnd)
}

/** Split an interval after placing a chunk, returning remaining sub-intervals. */
export function splitIntervals(
  intervals: Interval[],
  chunkStart: number,
  chunkEnd: number,
): Interval[] {
  const result: Interval[] = []
  for (const interval of intervals) {
    if (chunkEnd <= interval.start || chunkStart >= interval.end) {
      result.push(interval)
      continue
    }
    if (chunkStart > interval.start) {
      const left: Interval = { start: interval.start, end: chunkStart }
      if (left.end - left.start >= MIN_SESSION_MINUTES * 60 * 1000) result.push(left)
    }
    if (chunkEnd < interval.end) {
      const right: Interval = { start: chunkEnd, end: interval.end }
      if (right.end - right.start >= MIN_SESSION_MINUTES * 60 * 1000) result.push(right)
    }
  }
  return result
}