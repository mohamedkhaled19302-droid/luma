import type { ScheduleBlock } from '@/types/models'

/** Minutes from one `HH:MM` boundary to another, wrapping past midnight. */
function minutesBetween(start: string, end: string): number {
  const toMinutes = (value: string): number => {
    const [hours, minutes] = value.split(':').map(Number)
    return (hours || 0) * 60 + (minutes || 0)
  }
  const raw = toMinutes(end) - toMinutes(start)
  return raw > 0 ? raw : raw + 24 * 60
}

export interface BalanceInput {
  blocks: ScheduleBlock[]
  sleepTargetHours: number
  preferredStart: string
  preferredEnd: string
  deadlinePressureOverloaded: boolean
  habitsTotal: number
}

/**
 * Compute a 0-100 "day balance" score from the day's blocks.
 * Higher is better. Pure and deterministic.
 */
export function computeDayBalance(input: BalanceInput): number {
  const { blocks, habitsTotal } = input

  if (blocks.length === 0) return 50

  let totalFocusMin = 0
  let totalFreeMin = 0
  let totalBreakMin = 0
  let awakeMin = 0
  let plannedHabits = 0

  for (const block of blocks) {
    const startMin = new Date(block.start_at).getHours() * 60 + new Date(block.start_at).getMinutes()
    const endMin =
      new Date(block.end_at).getHours() * 60 + new Date(block.end_at).getMinutes()
    const len = endMin - startMin
    if (len <= 0) continue

    switch (block.block_type) {
      case 'task':
      case 'focus':
        totalFocusMin += len
        break
      case 'habit':
        totalFocusMin += len
        plannedHabits += 1
        break
      case 'break':
        totalBreakMin += len
        break
      default:
        break
    }

    if (block.block_type !== 'sleep') {
      awakeMin += len
    }
  }

  // Focus load: comfortable capacity is ~50% of awake time. Cap at 100.
  const safeFocusMin = Math.max(180, awakeMin * 0.5)
  const loadScore = Math.max(0, Math.min(40, 40 * (1 - Math.max(0, totalFocusMin - safeFocusMin) / 240)))

  // Unscheduled time is whatever the waking window has left once every planned
  // block is subtracted. Measured from the gaps rather than from "free" blocks,
  // so an empty afternoon still counts as breathing room without the plan
  // having to invent a placeholder for it.
  const windowMin = minutesBetween(input.preferredStart, input.preferredEnd)
  totalFreeMin = Math.max(0, windowMin - awakeMin)

  // Free time score: want meaningful free time (>= 2h).
  const freeScore = Math.min(20, Math.round((totalFreeMin / 120) * 20))

  // Break coverage: a break every ~2h of focused work is healthy.
  const breakScore = totalFocusMin > 120
    ? Math.min(15, Math.round((totalBreakMin / (totalFocusMin / 120)) * 15))
    : 15

  // Habit coverage.
  const habitScore = habitsTotal > 0
    ? Math.round((plannedHabits / habitsTotal) * 15)
    : 15

  // Deadline pressure relief.
  const pressureScore = input.deadlinePressureOverloaded ? 2 : 10

  return Math.max(0, Math.min(100, loadScore + freeScore + breakScore + habitScore + pressureScore))
}