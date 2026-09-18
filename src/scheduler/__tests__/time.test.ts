import { describe, expect, it } from 'vitest'
import { formatDayKey, intervalsOverlap, timeStringToMinutes } from '../time'

describe('time helpers', () => {
  it('parses HH:MM into minutes of day', () => {
    expect(timeStringToMinutes('07:30')).toBe(450)
    expect(timeStringToMinutes('23:59')).toBe(1439)
    expect(timeStringToMinutes('00:00')).toBe(0)
  })

  it('formats a Date into a YYYY-MM-DD key', () => {
    const date = new Date(2026, 8, 18, 9, 0, 0)
    expect(formatDayKey(date)).toBe('2026-09-18')
  })

  it('detects overlapping intervals', () => {
    const a = { start: 60, end: 120 }
    const b = { start: 100, end: 180 }
    const c = { start: 180, end: 200 }
    expect(intervalsOverlap(a, b)).toBe(true)
    expect(intervalsOverlap(a, c)).toBe(false)
  })
})