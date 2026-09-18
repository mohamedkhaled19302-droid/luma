import type { SchedulerInput, SchedulerTask } from './types'
import { runScheduler } from './engine'

export interface MissedRescheduleResult extends ReturnType<typeof runScheduler> {
  reassignedTaskIds: string[]
}

/**
 * Deterministic rescheduling of missed/overdue tasks. Builds a scheduler
 * run limited to the missed tasks so none of the existing plan is disturbed
 * unless reused by re-running the full optimizer later.
 */
export function proposeMissedTaskReschedule(
  input: SchedulerInput,
): MissedRescheduleResult {
  const missedIds = new Set(input.tasks.map((t) => t.id))
  const taskById = new Map<string, SchedulerTask>(input.tasks.map((t) => [t.id, t]))

  const focusedInput: SchedulerInput = {
    ...input,
    tasks: [...taskById.values()],
    habits: [],
  }

  const result = runScheduler(focusedInput)
  void missedIds
  return {
    ...result,
    reassignedTaskIds: [
      ...new Set(result.sessions.map((s) => s.task_id)),
    ],
  }
}