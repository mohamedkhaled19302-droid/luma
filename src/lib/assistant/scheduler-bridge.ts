import { format } from 'date-fns'
import { listBlocksBetween } from '@/services/block-service'
import { listEventsBetween } from '@/services/event-service'
import {
  endOfDay,
  formatDayKey,
  startOfDay,
} from '@/scheduler/time'
import { runScheduleAndPersist } from '@/services/scheduling-service'
import type { AssistantTime } from './parser'

export interface WindowConflict {
  title: string
  start: Date
  end: Date
}

export interface AvailabilityResult {
  available: boolean
  conflicts: WindowConflict[]
}

/**
 * Check whether the exact window is free before placing a pinned block.
 * Reads existing blocks + calendar events for the day and intersects them
 * against the requested window so a user-requested from→to time never
 * silently overlaps something already in the planner.
 */
export async function checkWindowAvailability(
  userId: string,
  from: Date,
  to: Date,
): Promise<AvailabilityResult> {
  const dayStart = startOfDay(from)
  const dayEnd = endOfDay(from)

  const [blocks, events] = await Promise.all([
    listBlocksBetween(userId, dayStart.toISOString(), dayEnd.toISOString()),
    listEventsBetween(userId, dayStart.toISOString(), dayEnd.toISOString()),
  ])

  const occupied: WindowConflict[] = [
    ...blocks.map((block) => ({
      title: block.title,
      start: new Date(block.start_at),
      end: new Date(block.end_at),
    })),
    ...events.map((event) => ({
      title: event.title,
      start: new Date(event.start_at),
      end: new Date(event.end_at),
    })),
  ]

  const fromMs = from.getTime()
  const toMs = to.getTime()
  const overlapping = occupied.filter(
    (item) => item.start.getTime() < toMs && item.end.getTime() > fromMs,
  )

  return { available: overlapping.length === 0, conflicts: overlapping }
}

/** Compose a full Date for a day + hour:minute spec (minute seconds zeroed). */
export function composeDateTime(day: Date, time: AssistantTime): Date {
  const date = startOfDay(day)
  date.setHours(time.hour, time.minute, 0, 0)
  return date
}

/** Render a compact, human-friendly window, e.g. "7:00 PM–9:00 PM". */
export function formatWindow(from: Date, to: Date): string {
  return `${format(from, 'h:mm a')}–${format(to, 'h:mm a')}`
}

export interface ScheduledDayResult {
  blocks: number
  scheduledMinutes: number
  day: string
}

/**
 * Run the existing scheduler for a single day and persist the result,
 * matching the planner page's `runScheduleAndPersist` flow. This is how a
 * request without an exact window gets placed into free time with zero
 * overlap (the engine treats locked blocks + events as fixed).
 */
export async function scheduleDay(
  userId: string,
  day: Date,
): Promise<ScheduledDayResult> {
  const from = startOfDay(day)
  const to = endOfDay(day)
  const { result, blocks } = await runScheduleAndPersist(userId, from, to)
  return {
    blocks: blocks.length,
    scheduledMinutes: result.summary.scheduledMinutes,
    day: formatDayKey(from),
  }
}