import { STORAGE_KEYS } from '@/lib/brand'
import {
  CUSTOM_PRESET_PREFIX,
  type FocusPreset,
} from '@/lib/focus-timer'

const STORAGE_KEY = STORAGE_KEYS.customPresets
const MAX_PRESETS = 12

function isPreset(value: unknown): value is FocusPreset {
  if (typeof value !== 'object' || value === null) return false
  const preset = value as Record<string, unknown>
  return (
    typeof preset.id === 'string' &&
    preset.id.startsWith(CUSTOM_PRESET_PREFIX) &&
    typeof preset.label === 'string' &&
    typeof preset.focusMinutes === 'number' &&
    preset.focusMinutes > 0 &&
    typeof preset.shortBreakMinutes === 'number' &&
    preset.shortBreakMinutes >= 0 &&
    typeof preset.longBreakMinutes === 'number' &&
    preset.longBreakMinutes >= 0 &&
    typeof preset.rounds === 'number' &&
    preset.rounds >= 1
  )
}

export function makeCustomPresetId(): string {
  return `${CUSTOM_PRESET_PREFIX}${Date.now().toString(36)}`
}

export function loadCustomPresets(): FocusPreset[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is FocusPreset => isPreset(p))
  } catch {
    return []
  }
}

export function saveCustomPresets(presets: FocusPreset[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)))
  } catch {
    /* storage full/blocked — custom presets just won't persist */
  }
}

export function addCustomPreset(draft: Omit<FocusPreset, 'id'>): FocusPreset | null {
  const preset: FocusPreset = { ...draft, id: makeCustomPresetId() }
  const presets = loadCustomPresets()
  presets.push(preset)
  saveCustomPresets(presets)
  return preset
}

export function removeCustomPreset(id: string): void {
  saveCustomPresets(loadCustomPresets().filter((p) => p.id !== id))
}