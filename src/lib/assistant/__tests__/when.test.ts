import { describe, expect, it } from 'vitest'
import { addDays, startOfDay, startOfWeek } from 'date-fns'
import { parseWhenSpec, rangeDayCount, type WhenSpec } from '../when'

// Monday, 19 January 2026 — deterministic anchor so every date resolution is stable.
const NOW = new Date(2026, 0, 19, 12, 0, 0)
const TODAY = startOfDay(NOW)

describe('parseWhenSpec windows', () => {
  it('parses the same-day window format the wizard teaches', () => {
    const spec = parseWhenSpec('7:00 PM to 8:00 PM', NOW)
    expect(spec).not.toBeNull()
    expect(spec?.kind).toBe('window')
    if (spec?.kind === 'window') {
      expect(spec.day.getTime()).toBe(TODAY.getTime())
      expect(spec.from).toEqual({ hour: 19, minute: 0 })
      expect(spec.to).toEqual({ hour: 20, minute: 0 })
    }
  })

  it('handles bare hour windows, defaulting to the evening', () => {
    const spec = parseWhenSpec('from 7 to 9', NOW)
    expect(spec?.kind).toBe('window')
    if (spec?.kind === 'window') {
      expect(spec.from).toEqual({ hour: 19, minute: 0 })
      expect(spec.to).toEqual({ hour: 21, minute: 0 })
    }
  })

  it('uses an explicit day label with a window', () => {
    const spec = parseWhenSpec('tomorrow from 4 to 5', NOW)
    expect(spec?.kind).toBe('window')
    if (spec?.kind === 'window') {
      expect(spec.day.getTime()).toBe(addDays(TODAY, 1).getTime())
      expect(spec.from).toEqual({ hour: 16, minute: 0 })
      expect(spec.to).toEqual({ hour: 17, minute: 0 })
    }
  })

  it('honors explicit meridiem for 12-hour edge cases', () => {
    const spec = parseWhenSpec('12pm to 1pm', NOW)
    expect(spec?.kind).toBe('window')
    if (spec?.kind === 'window') {
      expect(spec.from).toEqual({ hour: 12, minute: 0 })
      expect(spec.to).toEqual({ hour: 13, minute: 0 })
    }
  })

  it('parses 24-hour clock times', () => {
    const spec = parseWhenSpec('19:00 to 21:00', NOW)
    expect(spec?.kind).toBe('window')
    if (spec?.kind === 'window') {
      expect(spec.from).toEqual({ hour: 19, minute: 0 })
      expect(spec.to).toEqual({ hour: 21, minute: 0 })
    }
  })

  it('treats a single time as a one-hour window', () => {
    const spec = parseWhenSpec('at 8pm', NOW)
    expect(spec?.kind).toBe('window')
    if (spec?.kind === 'window') {
      expect(spec.from).toEqual({ hour: 20, minute: 0 })
      expect(spec.to).toEqual({ hour: 21, minute: 0 })
    }
  })
})

describe('parseWhenSpec single days', () => {
  it('resolves "tomorrow"', () => {
    const spec = parseWhenSpec('tomorrow', NOW)
    expect(spec).toEqual({ kind: 'day', day: addDays(TODAY, 1) })
  })

  it('resolves "today" and "tonight"', () => {
    expect(parseWhenSpec('today', NOW)).toEqual({ kind: 'day', day: TODAY })
    expect(parseWhenSpec('tonight', NOW)).toEqual({ kind: 'day', day: TODAY })
  })

  it('resolves "anytime" / "whenever" to today', () => {
    expect(parseWhenSpec('anytime', NOW)).toEqual({ kind: 'day', day: TODAY })
    expect(parseWhenSpec('whenever works', NOW)).toEqual({ kind: 'day', day: TODAY })
  })

  it('resolves a weekday to its next occurrence', () => {
    const spec = parseWhenSpec('next friday', NOW)
    expect(spec?.kind).toBe('day')
    if (spec?.kind === 'day') expect(spec.day.getDay()).toBe(5)
  })

  it('resolves "next week" to next week Monday (per app convention)', () => {
    const spec = parseWhenSpec('next week', NOW)
    expect(spec?.kind).toBe('day')
    if (spec?.kind === 'day') {
      expect(spec.day.getTime()).toBe(addDays(startOfWeek(TODAY, { weekStartsOn: 0 }), 7).getTime())
    }
  })
})

describe('parseWhenSpec explicit dates', () => {
  it('parses "12 Dec" day-first', () => {
    const spec = parseWhenSpec('from 12 Dec', NOW)
    expect(spec).toEqual({ kind: 'day', day: startOfDay(new Date(2026, 11, 12)) })
  })

  it('parses "Dec 12" month-first', () => {
    const spec = parseWhenSpec('on Dec 12', NOW)
    expect(spec).toEqual({ kind: 'day', day: startOfDay(new Date(2026, 11, 12)) })
  })

  it('rolls past dates into next year', () => {
    const spec = parseWhenSpec('on 5 jan', NOW)
    expect(spec).toEqual({ kind: 'day', day: startOfDay(new Date(2027, 0, 5)) })
  })

  it('parses numeric dates and swaps day-first order', () => {
    expect(parseWhenSpec('25/12', NOW)).toEqual({ kind: 'day', day: startOfDay(new Date(2026, 11, 25)) })
    expect(parseWhenSpec('12/25', NOW)).toEqual({ kind: 'day', day: startOfDay(new Date(2026, 11, 25)) })
  })
})

describe('parseWhenSpec ranges', () => {
  it('parses the date-range format the wizard teaches', () => {
    const spec = parseWhenSpec('from 12 Dec to 18 Dec', NOW)
    expect(spec).not.toBeNull()
    expect(spec?.kind).toBe('range')
    if (spec?.kind === 'range') {
      expect(spec.start.getTime()).toBe(startOfDay(new Date(2026, 11, 12)).getTime())
      expect(spec.end.getTime()).toBe(startOfDay(new Date(2026, 11, 18)).getTime())
    }
  })

  it('orders ranges that are given in reverse', () => {
    const spec = parseWhenSpec('from 18 Dec to 12 Dec', NOW)
    expect(spec?.kind).toBe('range')
    if (spec?.kind === 'range') {
      expect(spec.start.getTime()).toBe(startOfDay(new Date(2026, 11, 12)).getTime())
      expect(spec.end.getTime()).toBe(startOfDay(new Date(2026, 11, 18)).getTime())
    }
  })

  it('parses a bare "A to B" date range', () => {
    const spec = parseWhenSpec('12 Dec until 18 Dec', NOW)
    expect(spec?.kind).toBe('range')
  })

  it('does not treat a time window as a date range', () => {
    const spec = parseWhenSpec('from 7 to 8', NOW)
    expect(spec?.kind).toBe('window')
  })

  it('counts inclusive days across a range', () => {
    const spec = parseWhenSpec('from 12 Dec to 18 Dec', NOW) as Extract<WhenSpec, { kind: 'range' }>
    expect(rangeDayCount(spec)).toBe(7)
    expect(rangeDayCount({ kind: 'range', start: TODAY, end: TODAY })).toBe(1)
  })
})

describe('parseWhenSpec rejects unparsable input', () => {
  it('returns null for gibberish', () => {
    expect(parseWhenSpec('blorp the floomp of flarp', NOW)).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(parseWhenSpec('', NOW)).toBeNull()
    expect(parseWhenSpec('   ', NOW)).toBeNull()
  })
})