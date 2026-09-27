import { describe, expect, it } from 'vitest'
import { addDays, setHours } from 'date-fns'
import { runScheduler } from '../engine'
import type { SchedulerInput, SchedulerTask } from '../types'

function makeInput(overrides: Partial<SchedulerInput> = {}): SchedulerInput {
  const day = setHours(new Date(2026, 8, 18, 0, 0, 0), 0)
  return {
    startAt: day,
    endAt: addDays(day, 1),
    tasks: [],
    habits: [],
    fixed: [],
    settings: {
      awakeStart: '07:00',
      awakeEnd: '23:00',
      preferredStart: '09:00',
      preferredEnd: '20:00',
      breakEveryMinutes: 90,
      breakMinutes: 15,
      maxSessionMinutes: 90,
  sleepTargetHours: 8,
      energyPref: true,
    },
    energyByDay: new Map(),
    typicalEnergy: null,
    today: '2026-09-18',
    now: setHours(day, 6),
    ...overrides,
  }
}

const task = (overrides: Partial<SchedulerTask> = {}): SchedulerTask => ({
  id: 't1',
  category_id: null,
  title: 'Write essay',
  priority: 'high',
  difficulty: 'medium',
  remaining_minutes: 60,
  deadline: null,
  can_split: false,
  ...overrides,
})

describe('runScheduler', () => {
  it('plans nothing but free time for an empty day', () => {
    const result = runScheduler(makeInput())
    expect(result.summary.tasksScheduled).toBe(0)
    expect(result.blocks.filter((b) => b.task_id !== null)).toHaveLength(0)
  })

  it('places an open task within the awake window', () => {
    const result = runScheduler(makeInput({ tasks: [task()] }))
    const taskBlocks = result.blocks.filter((b) => b.task_id === 't1')
    expect(taskBlocks.length).toBeGreaterThan(0)
    const placed = taskBlocks[0]!
    const startMin = new Date(placed.start_at).getHours() * 60 + new Date(placed.start_at).getMinutes()
    const endMin = new Date(placed.end_at).getHours() * 60 + new Date(placed.end_at).getMinutes()
    expect(startMin).toBeGreaterThanOrEqual(7 * 60)
    expect(endMin).toBeLessThanOrEqual(23 * 60)
  })

  it('plans two tasks in separate sessions', () => {
    const result = runScheduler(
      makeInput({
        tasks: [
          task({ id: 'a', title: 'Task A', remaining_minutes: 45 }),
          task({ id: 'b', title: 'Task B', remaining_minutes: 45 }),
        ],
      }),
    )
    const taskIds = result.blocks.filter((b) => b.task_id).map((b) => b.task_id)
    expect(taskIds).toContain('a')
    expect(taskIds).toContain('b')
    expect(result.summary.tasksScheduled).toBe(2)
  })

  it('reports overload when work exceeds capacity', () => {
    const result = runScheduler(
      makeInput({
        tasks: [task({ remaining_minutes: 60 * 12, can_split: true })],
      }),
    )
    expect(result.summary.tasksScheduled).toBeGreaterThanOrEqual(1)
    expect(result.summary.scheduledMinutes).toBeGreaterThan(0)
  })

  it('ignores a task with no remaining work', () => {
    const result = runScheduler(makeInput({ tasks: [task({ remaining_minutes: 0 })] }))
    expect(result.blocks.filter((b) => b.task_id === 't1')).toHaveLength(0)
  })
})