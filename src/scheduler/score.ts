import {
  DIFFICULTY_WEIGHT,
  PRIORITY_WEIGHT,
  type SchedulerTask,
  type SchedulingRationale,
} from './types'
import { timeStringToMinutes } from './time'

const DAY_MS = 24 * 60 * 60 * 1000

function logRemainingWeight(minutes: number): number {
  return Math.log2(1 + minutes / 30) * 10
}

/** How urgent a task is based on its deadline (0..200). */
export function deadlineUrgency(task: SchedulerTask, now: Date): number {
  if (!task.deadline) return 15
  const daysLeft = (new Date(task.deadline).getTime() - now.getTime()) / DAY_MS
  if (daysLeft <= 0) return 200
  return 15 + 185 * Math.exp(-daysLeft / 4)
}

/**
 * Base score for a task independent of a specific slot.
 * Higher = more important to schedule first.
 */
export function taskScore(task: SchedulerTask, now: Date): number {
  const priority = PRIORITY_WEIGHT[task.priority]
  const difficulty = DIFFICULTY_WEIGHT[task.difficulty]
  const urgency = deadlineUrgency(task, now)
  const remaining = logRemainingWeight(task.remaining_minutes)
  const flexibility = task.can_split ? 8 : 0
  return priority + difficulty + urgency + remaining - flexibility
}

/** How well a difficulty matches the day's energy level (energy 1..5). */
export function energyMatch(difficulty: SchedulerTask['difficulty'], energy: number | null): number {
  if (energy == null) return 20
  const wanted: Record<string, number> = { easy: 1.5, medium: 3, hard: 4.5 }
  const gap = Math.abs(energy - (wanted[difficulty] ?? 3))
  if (gap <= 1) return 40
  if (gap <= 2) return 20
  return 5
}

/** Preferred study-time match for a slot start (minutes of day). */
export function preferredTimeMatch(
  startMinutesOfDay: number,
  preferredStart: string,
  preferredEnd: string,
): number {
  const start = timeStringToMinutes(preferredStart)
  const end = timeStringToMinutes(preferredEnd)
  if (startMinutesOfDay >= start && startMinutesOfDay <= end) return 50
  const distanceFromEdge = Math.min(
    Math.abs(startMinutesOfDay - start),
    Math.abs(startMinutesOfDay - end),
  )
  return Math.max(0, 50 - distanceFromEdge / 3)
}

export interface SlotScoringContext {
  now: Date
  preferredStart: string
  preferredEnd: string
  energy: number | null
  prevSameTaskId: string | null
  prevSameSubjectId: string | null
  dayStudyMinutes: number
  dailyTargetMinutes: number
  continuousStudyMinutes: number
  breaksNeeded: number
  fatigueFromRun: number
}

/**
 * Score a (task, slot) combination. This mirrors the spec's conceptual
 * `slotScore = taskScore + energyMatch + preferredTimeMatch + continuityBonus
 * - fatiguePenalty - overloadPenalty`.
 */
export function slotScore(
  task: SchedulerTask,
  slotStart: Date,
  durationMinutes: number,
  ctx: SlotScoringContext,
  includeTaskScore: boolean,
): number {
  const base = includeTaskScore ? taskScore(task, ctx.now) : 0
  const energy = energyMatch(task.difficulty, ctx.energy)
  const preferred = preferredTimeMatch(
    slotStart.getHours() * 60 + slotStart.getMinutes(),
    ctx.preferredStart,
    ctx.preferredEnd,
  )

  let continuity = 0
  if (ctx.prevSameTaskId === task.id) continuity = 25
  else if (task.subject_id && ctx.prevSameSubjectId === task.subject_id) continuity = 10

  let fatigue = 0
  if (ctx.continuousStudyMinutes > 0) {
    fatigue = Math.min(60, ctx.continuousStudyMinutes / 10)
  }

  let overload = 0
  if (ctx.dayStudyMinutes + durationMinutes > ctx.dailyTargetMinutes) {
    overload = Math.min(80, (ctx.dayStudyMinutes + durationMinutes - ctx.dailyTargetMinutes) / 5)
  }

  const nearDeadlineBonus = task.deadline && preferred < 25 ? 15 : 0

  return base + energy + preferred + continuity + nearDeadlineBonus - fatigue - overload
}

/** Helper to build a rationale object (used by "explain schedule"). */
export function buildRationale(
  task: SchedulerTask,
  placementStart: Date,
  placementEnd: Date,
  calculatedScore: number,
): SchedulingRationale {
  return {
    taskId: task.id,
    taskTitle: task.title,
    placedStart: placementStart,
    placedEnd: placementEnd,
    slotScore: calculatedScore,
    factors: {
      priority: PRIORITY_WEIGHT[task.priority],
      difficulty: DIFFICULTY_WEIGHT[task.difficulty],
      urgency: Math.round(deadlineUrgency(task, new Date())),
      remaining: Math.round(logRemainingWeight(task.remaining_minutes)),
    },
  }
}