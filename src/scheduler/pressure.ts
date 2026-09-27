import type { SchedulerTask } from './types'

export interface CapacityProvider {
  /** Estimated free planning minutes in the inclusive window [start, end]. */
  freeMinutesBetween(start: Date, end: Date): number
}

export interface DeadlinePressureItem {
  taskId: string
  title: string
  deadline: Date
  remainingMinutes: number
  availableCapacity: number
  ratio: number
  overloaded: boolean
}

export interface DeadlinePressureResult {
  overallOverloaded: boolean
  overloading: DeadlinePressureItem[]
  items: DeadlinePressureItem[]
}

export interface DeadlinePressureInput {
  tasks: SchedulerTask[]
  capacity: CapacityProvider
  now: Date
}

/**
 * Compare remaining work against available free capacity before each
 * deadline. Does NOT diagnose health conditions - it only reports on
 * scheduling capacity.
 */
export function calculateDeadlinePressure(input: DeadlinePressureInput): DeadlinePressureResult {
  const { tasks, capacity, now } = input
  const items: DeadlinePressureItem[] = []

  for (const task of tasks) {
    if (task.deadline == null || task.remaining_minutes <= 0) continue
    const deadline = new Date(task.deadline)
    if (deadline.getTime() <= now.getTime()) continue

    const availableCapacity = capacity.freeMinutesBetween(now, deadline)
    const ratio = availableCapacity > 0 ? task.remaining_minutes / availableCapacity : Infinity
    items.push({
      taskId: task.id,
      title: task.title,
      deadline,
      remainingMinutes: task.remaining_minutes,
      availableCapacity,
      ratio: Math.round(ratio * 100) / 100,
      overloaded: ratio > 1,
    })
  }

  items.sort((a, b) => {
    if (a.overloaded !== b.overloaded) return a.overloaded ? -1 : 1
    return a.deadline.getTime() - b.deadline.getTime()
  })

  const overloading = items.filter((item) => item.overloaded)
  return {
    overallOverloaded: overloading.some((item) => item.ratio > 1.15),
    overloading,
    items,
  }
}