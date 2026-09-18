import { describe, expect, it } from 'vitest'
import { computeDayBalance } from '../balance'
import type { ScheduleBlock } from '@/types/models'

function block(
  block_type: ScheduleBlock['block_type'],
  start: string,
  end: string,
): ScheduleBlock {
  return {
    id: `${block_type}-${start}`,
    user_id: 'u1',
    plan_date: '2026-09-18',
    block_type,
    title: block_type,
    task_id: null,
    event_id: null,
    habit_id: null,
    start_at: `2026-09-18T${start}:00.000Z`,
    end_at: `2026-09-18T${end}:00.000Z`,
    locked: false,
    completed: false,
    skipped: false,
    note: null,
    color: null,
    created_at: '2026-09-18T00:00:00.000Z',
  }
}

const base = {
  sleepTargetHours: 8,
  preferredStart: '08:00',
  preferredEnd: '20:00',
  deadlinePressureOverloaded: false,
  childrenHabitsPresent: 0,
  habitsTotal: 0,
}

describe('computeDayBalance', () => {
  it('returns a neutral score for an empty day', () => {
    expect(computeDayBalance({ ...base, blocks: [] })).toBe(50)
  })

  it('scores a healthy, balanced day highly', () => {
    const blocks = [
      block('school', '08:00', '10:00'),
      block('task', '10:30', '12:00'),
      block('break', '12:00', '12:30'),
      block('free', '12:30', '14:00'),
      block('study', '14:30', '16:00'),
      block('break', '16:00', '16:15'),
      block('free', '16:15', '18:00'),
    ]
    const score = computeDayBalance({ ...base, blocks })
    expect(score).toBeGreaterThanOrEqual(60)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('penalizes an overloaded day with no free time', () => {
    const blocks = [
      block('school', '08:00', '12:00'),
      block('task', '12:30', '17:00'),
      block('study', '17:30', '22:00'),
    ]
    const score = computeDayBalance({ ...base, blocks, deadlinePressureOverloaded: true })
    const healthy = computeDayBalance({ ...base, blocks })
    expect(score).toBeLessThan(healthy)
  })

  it('always stays within 0-100', () => {
    const blocks = [
      block('task', '06:00', '23:00'),
      block('task', '06:00', '23:00'),
      block('task', '06:00', '23:00'),
    ]
    const score = computeDayBalance({ ...base, blocks })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})