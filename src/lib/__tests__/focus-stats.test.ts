import { describe, expect, it } from 'vitest'
import { computeFocusStats, type FocusSession } from '../focus-stats'

function session(day: string, minutes: number, completed = true): FocusSession {
  const start = new Date(`${day}T08:00:00.000Z`)
  const end = new Date(start.getTime() + minutes * 60_000)
  return {
    startedAt: start.toISOString(),
    endedAt: end.toISOString(),
    durationMinutes: minutes,
    completed,
  }
}

function at(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`)
}

function statsOf(days: Array<[string, number, boolean?]>, now: string) {
  return computeFocusStats(
    days.map(([date, minutes, completed]) => session(date, minutes, completed)),
    at(now),
    'UTC',
  )
}

describe('computeFocusStats streaks', () => {
  it('counts a contiguous streak ending today', () => {
    const stats = statsOf(
      [
        ['2026-09-18', 25],
        ['2026-09-19', 50],
        ['2026-09-20', 25],
      ],
      '2026-09-20',
    )
    expect(stats.currentStreak).toBe(3)
    expect(stats.longestStreak).toBe(3)
  })

  it('does not break the streak when today has zero minutes', () => {
    const stats = statsOf(
      [
        ['2026-09-18', 25],
        ['2026-09-19', 50],
      ],
      '2026-09-20',
    )
    expect(stats.currentStreak).toBe(2)
    expect(stats.longestStreak).toBe(2)
  })

  it('breaks the streak on a gap day', () => {
    const stats = statsOf(
      [
        ['2026-09-18', 25],
        ['2026-09-20', 50],
      ],
      '2026-09-20',
    )
    expect(stats.currentStreak).toBe(1)
    expect(stats.longestStreak).toBe(1)
  })

  it('returns zero current streak when the last completed day is beyond yesterday', () => {
    const stats = statsOf(
      [
        ['2026-09-16', 25],
        ['2026-09-17', 50],
      ],
      '2026-09-20',
    )
    expect(stats.currentStreak).toBe(0)
    expect(stats.longestStreak).toBe(2)
  })

  it('counts a single-day streak', () => {
    const stats = statsOf([['2026-09-20', 25]], '2026-09-20')
    expect(stats.currentStreak).toBe(1)
    expect(stats.longestStreak).toBe(1)
  })

  it('keeps longest and current streaks distinct', () => {
    const days: Array<[string, number]> = [
      ['2026-09-10', 25],
      ['2026-09-11', 25],
      ['2026-09-12', 25],
      ['2026-09-13', 25],
      ['2026-09-14', 25],
    ]
    days.push(['2026-09-18', 25], ['2026-09-19', 25], ['2026-09-20', 25])
    const stats = statsOf(days, '2026-09-20')
    expect(stats.currentStreak).toBe(3)
    expect(stats.longestStreak).toBe(5)
  })
})

describe('computeFocusStats rolling window', () => {
  it('fills the last seven days ending today with minutes and session counts', () => {
    const days: Array<[string, number]> = [
      ['2026-09-14', 10],
      ['2026-09-15', 20],
      ['2026-09-16', 30],
      ['2026-09-17', 40],
      ['2026-09-18', 50],
      ['2026-09-19', 60],
      ['2026-09-20', 70],
    ]
    const stats = statsOf(days, '2026-09-20')
    expect(stats.lastSeven.map((day) => day.date)).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ])
    expect(stats.lastSeven.map((day) => day.minutes)).toEqual([10, 20, 30, 40, 50, 60, 70])
    expect(stats.lastSeven.map((day) => day.sessions)).toEqual([1, 1, 1, 1, 1, 1, 1])
    expect(stats.weekMinutes).toBe(280)
    expect(stats.dailyAverage).toBe(40)
  })

  it('excludes sessions outside the rolling window from this week', () => {
    const stats = statsOf(
      [
        ['2026-09-12', 999],
        ['2026-09-19', 90],
      ],
      '2026-09-20',
    )
    expect(stats.totalMinutes).toBe(1089)
    expect(stats.weekMinutes).toBe(90)
    expect(stats.lastSeven[0]?.date).toBe('2026-09-14')
    expect(stats.lastSeven.some((day) => day.date === '2026-09-12')).toBe(false)
    expect(stats.lastSeven.find((day) => day.date === '2026-09-19')?.minutes).toBe(90)
  })

  it('aggregates multiple sessions on one day', () => {
    const stats = statsOf(
      [
        ['2026-09-20', 25],
        ['2026-09-20', 25],
      ],
      '2026-09-20',
    )
    expect(stats.lastSeven.find((day) => day.date === '2026-09-20')).toEqual({
      date: '2026-09-20',
      minutes: 50,
      sessions: 2,
    })
    expect(stats.totalSessions).toBe(2)
  })
})

describe('computeFocusStats best day', () => {
  it('picks the day with the most minutes', () => {
    const stats = statsOf(
      [
        ['2026-09-19', 45],
        ['2026-09-20', 90],
      ],
      '2026-09-20',
    )
    expect(stats.bestDay).toEqual({ date: '2026-09-20', minutes: 90, sessions: 1 })
  })

  it('prefers the later day on a tie', () => {
    const stats = statsOf(
      [
        ['2026-09-13', 120],
        ['2026-09-20', 120],
      ],
      '2026-09-20',
    )
    expect(stats.bestDay?.date).toBe('2026-09-20')
  })
})

describe('computeFocusStats totals and completion rate', () => {
  it('counts total and completed sessions separately', () => {
    const stats = statsOf(
      [
        ['2026-09-20', 25],
        ['2026-09-19', 50, false],
      ],
      '2026-09-20',
    )
    expect(stats.totalSessions).toBe(2)
    expect(stats.completedSessions).toBe(1)
    expect(stats.totalMinutes).toBe(25)
    expect(stats.completionRate).toBe(0.5)
  })

  it('returns a full completion rate when every session is completed', () => {
    const stats = statsOf(
      [
        ['2026-09-20', 25],
        ['2026-09-19', 50],
      ],
      '2026-09-20',
    )
    expect(stats.completionRate).toBe(1)
  })

  it('is null-safe and all-zeros for an empty list', () => {
    const stats = computeFocusStats([], at('2026-09-20'), 'UTC')
    expect(stats.totalMinutes).toBe(0)
    expect(stats.totalSessions).toBe(0)
    expect(stats.completedSessions).toBe(0)
    expect(stats.currentStreak).toBe(0)
    expect(stats.longestStreak).toBe(0)
    expect(stats.bestDay).toBeNull()
    expect(stats.weekMinutes).toBe(0)
    expect(stats.dailyAverage).toBe(0)
    expect(stats.completionRate).toBe(0)
    expect(stats.lastSeven).toHaveLength(7)
    expect(stats.lastSeven.every((day) => day.minutes === 0 && day.sessions === 0)).toBe(true)
    expect(stats.lastSeven[6]?.date).toBe('2026-09-20')
  })

  it('ignores malformed rows instead of throwing', () => {
    const rows = [null as unknown as FocusSession, session('2026-09-20', 25)]
    const stats = computeFocusStats(rows, at('2026-09-20'), 'UTC')
    expect(stats.totalSessions).toBe(1)
    expect(stats.totalMinutes).toBe(25)
    expect(stats.currentStreak).toBe(1)
  })
})