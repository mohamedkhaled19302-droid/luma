export type TimerPhase = 'focus' | 'shortBreak' | 'longBreak'
export type TimerStatus = 'idle' | 'running' | 'paused' | 'done'

export interface FocusPreset {
  id: string
  label: string
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  /** Focus sessions before a long break */
  rounds: number
}

export const FOCUS_PRESETS: FocusPreset[] = [
  { id: 'classic', label: 'Classic 25/5', focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, rounds: 4 },
  { id: 'deep', label: 'Deep dive 50/10', focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 30, rounds: 3 },
  { id: 'sprint', label: 'Quick sprint 15/3', focusMinutes: 15, shortBreakMinutes: 3, longBreakMinutes: 10, rounds: 4 },
]

export const DEFAULT_PRESET: FocusPreset = FOCUS_PRESETS[0] as FocusPreset

/** Custom presets are stored on this device; their ids always start with this prefix. */
export const CUSTOM_PRESET_PREFIX = 'custom:'

export function isCustomPresetId(id: string): boolean {
  return id.startsWith(CUSTOM_PRESET_PREFIX)
}

export function getPreset(presetId: string): FocusPreset {
  return FOCUS_PRESETS.find((p) => p.id === presetId) ?? DEFAULT_PRESET
}

/** Resolve a preset, preferring a per-user custom preset when one matches. */
export function resolvePreset(presetId: string, custom: FocusPreset[] = []): FocusPreset {
  const match = (custom ?? []).find((p) => p.id === presetId)
  if (match) return match
  return getPreset(presetId)
}

export interface TimerSnapshot {
  status: TimerStatus
  phase: TimerPhase
  /** ms remaining when running/paused */
  remainingMs: number
  /** timestamp (ms epoch) when running ends; null unless running */
  endsAt: number | null
  completedFocusSessions: number
  presetId: string
  /** Embedded definition so a deleted custom preset never breaks a running timer */
  preset?: FocusPreset | null
  /** when the snapshot was saved, for stale-state validation */
  savedAt: number
}

/** The preset a snapshot actually runs on (embedded custom preset wins). */
export function snapshotPreset(snapshot: TimerSnapshot, custom: FocusPreset[] = []): FocusPreset {
  if (snapshot.preset) return snapshot.preset
  return resolvePreset(snapshot.presetId, custom)
}

export function phaseDurationMs(preset: FocusPreset, phase: TimerPhase): number {
  const minutes =
    phase === 'focus'
      ? preset.focusMinutes
      : phase === 'shortBreak'
        ? preset.shortBreakMinutes
        : preset.longBreakMinutes
  return minutes * 60_000
}

/** Decide which phase follows the one that just finished. */
export function nextPhase(preset: FocusPreset, phase: TimerPhase, completedFocusSessions: number): TimerPhase {
  if (phase === 'focus') {
    return completedFocusSessions > 0 && completedFocusSessions % preset.rounds === 0
      ? 'longBreak'
      : 'shortBreak'
  }
  return 'focus'
}

/** Compute remaining time from a snapshot — robust against background throttling. */
export function remainingMsAt(snapshot: TimerSnapshot, now: number): number {
  if (snapshot.status === 'running' && snapshot.endsAt !== null) {
    return Math.max(0, snapshot.endsAt - now)
  }
  return snapshot.remainingMs
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function isSnapshotUsable(snapshot: unknown, _validPresetIds?: string[]): snapshot is TimerSnapshot {
  if (typeof snapshot !== 'object' || snapshot === null) return false
  const s = snapshot as Record<string, unknown>
  if (typeof s.remainingMs !== 'number' || s.remainingMs < 0) return false
  if (typeof s.completedFocusSessions !== 'number' || s.completedFocusSessions < 0) return false
  if (typeof s.savedAt !== 'number') return false
  if (typeof s.presetId !== 'string') return false
  if (!['idle', 'running', 'paused', 'done'].includes(s.status as string)) return false
  if (!['focus', 'shortBreak', 'longBreak'].includes(s.phase as string)) return false
  if (!isKnownPresetId(s.presetId, s.preset, _validPresetIds)) return false
  return true
}

function isKnownPresetId(presetId: string, preset: unknown, validPresetIds?: string[]): boolean {
  if (validPresetIds) {
    if (validPresetIds.includes(presetId)) return true
    if (isCustomPresetId(presetId) && isEmbeddedPresetValid(preset, presetId)) return true
    return false
  }
  if (FOCUS_PRESETS.some((p) => p.id === presetId)) return true
  if (isCustomPresetId(presetId) && isEmbeddedPresetValid(preset, presetId)) return true
  return false
}

function isEmbeddedPresetValid(preset: unknown, presetId: string): boolean {
  return (
    !!preset &&
    typeof preset === 'object' &&
    (preset as Record<string, unknown>).id === presetId &&
    typeof (preset as Record<string, unknown>).focusMinutes === 'number' &&
    typeof (preset as Record<string, unknown>).shortBreakMinutes === 'number' &&
    typeof (preset as Record<string, unknown>).longBreakMinutes === 'number' &&
    typeof (preset as Record<string, unknown>).rounds === 'number'
  )
}

import { STORAGE_KEYS } from '@/lib/brand'

const STORAGE_PREFIX = STORAGE_KEYS.focusTimerPrefix

export function loadTimerState(userId: string): TimerSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + userId)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isSnapshotUsable(parsed)) return null
    // A running timer from more than its own duration ago has long finished —
    // treat it as done so the UI can celebrate instead of resuming nonsense.
    if (parsed.status === 'running' && parsed.endsAt !== null && parsed.endsAt < Date.now() - 60_000) {
      return { ...parsed, status: 'done', remainingMs: 0, endsAt: null }
    }
    return parsed
  } catch {
    return null
  }
}

export function saveTimerState(userId: string, snapshot: TimerSnapshot): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(snapshot))
  } catch {
    /* storage full/blocked — the timer keeps working in memory */
  }
}