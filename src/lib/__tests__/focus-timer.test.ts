import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FOCUS_PRESETS,
  formatClock,
  isSnapshotUsable,
  loadTimerState,
  nextPhase,
  phaseDurationMs,
  remainingMsAt,
  saveTimerState,
  type TimerSnapshot,
} from '../focus-timer'

const classic = FOCUS_PRESETS.find((p) => p.id === 'classic') as (typeof FOCUS_PRESETS)[number]

function baseSnapshot(overrides: Partial<TimerSnapshot> = {}): TimerSnapshot {
  return {
    status: 'idle',
    phase: 'focus',
    remainingMs: phaseDurationMs(classic, 'focus'),
    endsAt: null,
    completedFocusSessions: 0,
    presetId: 'classic',
    savedAt: Date.now(),
    ...overrides,
  }
}

describe('focus timer helpers', () => {
  it('computes phase durations from the preset', () => {
    expect(phaseDurationMs(classic, 'focus')).toBe(25 * 60_000)
    expect(phaseDurationMs(classic, 'shortBreak')).toBe(5 * 60_000)
    expect(phaseDurationMs(classic, 'longBreak')).toBe(15 * 60_000)
  })

  it('cycles focus -> short break, and every Nth focus -> long break', () => {
    expect(nextPhase(classic, 'focus', 1)).toBe('shortBreak')
    expect(nextPhase(classic, 'focus', 3)).toBe('shortBreak')
    expect(nextPhase(classic, 'focus', 4)).toBe('longBreak') // preset.rounds === 4
    expect(nextPhase(classic, 'shortBreak', 1)).toBe('focus')
    expect(nextPhase(classic, 'longBreak', 4)).toBe('focus')
  })

  it('derives remaining time from wall clock so throttled tabs stay accurate', () => {
    const now = 1_000_000
    const snap = baseSnapshot({ status: 'running', endsAt: now + 30_000 })
    expect(remainingMsAt(snap, now)).toBe(30_000)
    expect(remainingMsAt(snap, now + 60_000)).toBe(0) // clamps at zero
    const paused = baseSnapshot({ status: 'paused', remainingMs: 12_000 })
    expect(remainingMsAt(paused, now + 999_999)).toBe(12_000) // paused ignores clock
  })

  it('formats the clock readout', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00')
    expect(formatClock(61_000)).toBe('1:01')
    expect(formatClock(0)).toBe('0:00')
  })

  it('validates persisted snapshots strictly', () => {
    expect(isSnapshotUsable(baseSnapshot(), ['classic'])).toBe(true)
    expect(isSnapshotUsable(null, ['classic'])).toBe(false)
    expect(isSnapshotUsable('nope', ['classic'])).toBe(false)
    expect(isSnapshotUsable(baseSnapshot({ remainingMs: -5 }), ['classic'])).toBe(false)
    expect(isSnapshotUsable(baseSnapshot({ presetId: 'unknown' }), ['classic'])).toBe(false)
    expect(isSnapshotUsable(baseSnapshot({ status: 'running' as never }), [])).toBe(false)
    expect(isSnapshotUsable(baseSnapshot({ phase: 'sideways' as never }), ['classic'])).toBe(false)
  })
})

describe('focus timer persistence', () => {
  let store: Record<string, string>
  let originalWindow: unknown

  beforeEach(() => {
    store = {}
    originalWindow = (globalThis as Record<string, unknown>).window
    ;(globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v
        },
        removeItem: (k: string) => {
          delete store[k]
        },
        clear: () => {
          store = {}
        },
      },
    }
  })

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window
    } else {
      (globalThis as Record<string, unknown>).window = originalWindow
    }
  })

  it('round-trips a snapshot per user', () => {
    const snap = baseSnapshot({ status: 'paused', remainingMs: 42_000 })
    saveTimerState('user-1', snap)
    const loaded = loadTimerState('user-1')
    expect(loaded?.remainingMs).toBe(42_000)
    expect(loadTimerState('user-2')).toBeNull()
  })

  it('marks a long-expired running timer as done instead of resuming garbage', () => {
    const expired = baseSnapshot({
      status: 'running',
      endsAt: Date.now() - 10 * 60_000,
    })
    saveTimerState('user-1', expired)
    const loaded = loadTimerState('user-1')
    expect(loaded?.status).toBe('done')
    expect(loaded?.remainingMs).toBe(0)
  })

  it('returns null for corrupted storage', () => {
    store['morrow:focus-timer:user-1'] = '{not json'
    expect(loadTimerState('user-1')).toBeNull()
  })

  it('returns null when window is unavailable (SSR)', () => {
    delete (globalThis as Record<string, unknown>).window
    expect(loadTimerState('user-1')).toBeNull()
  })
})