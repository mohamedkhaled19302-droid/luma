import { addDays, startOfDay } from 'date-fns'
import type { ScheduleBlock } from '@/types/models'
import {
  planForRange,
  persistPlan,
  type GeneratedPlan,
} from '@/services/scheduling-service'


export type PlanChangeKind = 'added' | 'moved' | 'removed'

export interface PlanChange {
  kind: PlanChangeKind
  title: string
  startAt: string | null
  endAt: string | null
  previousStartAt?: string | null
  blockType: ScheduleBlock['block_type']
  reason?: string
}

export interface DayPlanProposal {
  plan: GeneratedPlan
  changes: PlanChange[]
  summary: {
    scheduledMinutes: number
    tasksScheduled: number
    freeBlocksCount: number
    overloadWarnings: string[]
  }
}

/**
 * Deterministic proposal for a single day. Nothing is written yet - the UI
 * must present the diff and let the user accept, edit or reject.
 */
export async function proposeDayPlan(
  userId: string,
  date: Date,
  horizonDays = 1,
): Promise<DayPlanProposal> {
  const from = startOfDay(date)
  const to = addDays(from, horizonDays)
  const plan = await planForRange(userId, from, to)
  const changes = diffPlans(plan.existing, plan.result.blocks)

  const freeBlocks = plan.result.blocks.filter((b) => b.block_type === 'free')

  return {
    plan,
    changes,
    summary: {
      scheduledMinutes: plan.result.summary.scheduledMinutes,
      tasksScheduled: plan.result.summary.tasksScheduled,
      freeBlocksCount: freeBlocks.length,
      overloadWarnings: plan.result.summary.overloadDays.map(
        (day) => `${formatDayKeyLabel(day)} looks overloaded. That day may be too busy.`,
      ),
    },
  }
}

function formatDayKeyLabel(day: string): string {
  return day
}

/** Apply a previously reviewed proposal. */
export async function applyDayPlanProposal(
  userId: string,
  date: Date,
  plan: GeneratedPlan,
  horizonDays = 1,
) {
  const from = startOfDay(date)
  const to = addDays(from, horizonDays)
  return persistPlan(userId, from, to, plan)
}

/** Simple deterministic diff between the existing and proposed schedules. */
export function diffPlans(
  existing: ScheduleBlock[],
  proposed: Array<{
    title: string
    block_type: ScheduleBlock['block_type']
    start_at: string
    end_at: string
    task_id: string | null
    habit_id: string | null
  }>,
): PlanChange[] {
  const changes: PlanChange[] = []

  const existingTasks = new Map<string, ScheduleBlock>()
  for (const block of existing) {
    if (block.task_id) existingTasks.set(block.task_id, block)
  }
  const existingHabits = new Map<string, ScheduleBlock>()
  for (const block of existing) {
    if (block.habit_id) existingHabits.set(block.habit_id, block)
  }

  const proposedTasks = new Map<string, (typeof proposed)[number]>()
  const proposedHabits = new Map<string, (typeof proposed)[number]>()
  for (const block of proposed) {
    if (block.task_id) proposedTasks.set(block.task_id, block)
    if (block.habit_id) proposedHabits.set(block.habit_id, block)
  }

  for (const [taskId, newBlock] of proposedTasks) {
    const old = existingTasks.get(taskId)
    if (!old) {
      changes.push({
        kind: 'added',
        title: newBlock.title,
        startAt: newBlock.start_at,
        endAt: newBlock.end_at,
        blockType: newBlock.block_type,
      })
    } else if (
      old.start_at !== newBlock.start_at ||
      old.end_at !== newBlock.end_at
    ) {
      changes.push({
        kind: 'moved',
        title: newBlock.title,
        startAt: newBlock.start_at,
        endAt: newBlock.end_at,
        previousStartAt: old.start_at,
        blockType: newBlock.block_type,
      })
    }
  }

  for (const [taskId, old] of existingTasks) {
    if (!proposedTasks.has(taskId) && !old.locked && !old.completed && !old.skipped) {
      changes.push({
        kind: 'removed',
        title: old.title,
        startAt: null,
        endAt: null,
        previousStartAt: old.start_at,
        blockType: old.block_type,
      })
    }
  }

  for (const [habitId, newBlock] of proposedHabits) {
    const old = existingHabits.get(habitId)
    if (!old) {
      changes.push({
        kind: 'added',
        title: newBlock.title,
        startAt: newBlock.start_at,
        endAt: newBlock.end_at,
        blockType: newBlock.block_type,
      })
    }
  }

  for (const [habitId, old] of existingHabits) {
    if (!proposedHabits.has(habitId) && !old.locked && !old.completed && !old.skipped) {
      changes.push({
        kind: 'removed',
        title: old.title,
        startAt: null,
        endAt: null,
        previousStartAt: old.start_at,
        blockType: old.block_type,
      })
    }
  }

  const taskIdsPresent = new Set([...proposedTasks.keys()])
  for (const block of proposed) {
    if (block.block_type === 'break' && !block.task_id && !block.habit_id) {
      changes.push({
        kind: 'added',
        title: block.title,
        startAt: block.start_at,
        endAt: block.end_at,
        blockType: block.block_type,
      })
    }
  }
  void taskIdsPresent

  return changes.sort((a, b) => (a.startAt ?? '').localeCompare(b.startAt ?? ''))
}