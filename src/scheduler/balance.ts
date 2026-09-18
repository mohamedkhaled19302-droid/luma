import type { ScheduleBlock } from '@/types/models'

export interface BalanceInput {
  blocks: ScheduleBlock[]
  sleepTargetHours: number
  preferredStart: string
  preferredEnd: string
  deadlinePressureOverloaded: boolean
  childrenHabitsPresent: number
  habitsTotal: number
}

/**
 * Compute a 0-100 "day balance" score from the day's blocks.
 * Higher is better. Pure and deterministic.
 */
export function computeDayBalance(input: BalanceInput): number {
  const { blocks, habitsTotal } = input

  if (blocks.length === 0) return 50

  let totalStudyMin = 0
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
      case 'study':
      case 'school':
        totalStudyMin += len
        break
      case 'habit':
        totalStudyMin += len
        plannedHabits += 1
        break
      case 'break':
        totalBreakMin += len
        break
      case 'free':
        totalFreeMin += len
        break
      default:
        break
    }

    if (block.block_type !== 'sleep') {
      awakeMin += len
    }
  }

  // Study load: comfortable capacity is ~60% of awake time. Cap at 100.
  const safeStudyMin = Math.max(180, awakeMin * 0.5)
  const loadScore = Math.max(0, Math.min(40, 40 * (1 - Math.max(0, totalStudyMin - safeStudyMin) / 240)))

  // Free time score: want meaningful free time (>= 2h).
  const freeScore = Math.min(20, Math.round((totalFreeMin / 120) * 20))

  // Break coverage: a break every ~2h of study is healthy.
  const breakScore = totalStudyMin > 120
    ? Math.min(15, Math.round((totalBreakMin / (totalStudyMin / 120)) * 15))
    : 15

  // Habit coverage.
  const habitScore = habitsTotal > 0
    ? Math.round((plannedHabits / habitsTotal) * 15)
    : 15

  // Deadline pressure relief.
  const pressureScore = input.deadlinePressureOverloaded ? 2 : 10

  return Math.max(0, Math.min(100, loadScore + freeScore + breakScore + habitScore + pressureScore))
}