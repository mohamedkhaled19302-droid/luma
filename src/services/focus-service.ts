import { STORAGE_KEYS } from '@/lib/brand'
import type { FocusSession } from '@/lib/focus-stats'

export interface FocusSessionRecord extends FocusSession {
  id: string
  userId: string
  presetId: string
  /** Optional display name for user-built focus sessions. */
  name?: string
  createdAt: string
}

const STORAGE_PREFIX = STORAGE_KEYS.focusSessionsPrefix
const MAX_SESSIONS = 2000

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isRecord(value: unknown): value is FocusSessionRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string') return false
  if (typeof record.userId !== 'string') return false
  if (typeof record.presetId !== 'string') return false
  if (typeof record.startedAt !== 'string' || Number.isNaN(new Date(record.startedAt).getTime())) {
    return false
  }
  if (typeof record.endedAt !== 'string' || Number.isNaN(new Date(record.endedAt).getTime())) {
    return false
  }
  if (typeof record.durationMinutes !== 'number' || record.durationMinutes <= 0) return false
  if (typeof record.completed !== 'boolean') return false
  if (typeof record.createdAt !== 'string') return false
  if (record.name !== undefined && typeof record.name !== 'string') return false
  return true
}

export function listFocusSessions(userId: string): FocusSessionRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + userId)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((row): row is FocusSessionRecord => isRecord(row))
      .sort((a, b) => (a.endedAt < b.endedAt ? 1 : a.endedAt > b.endedAt ? -1 : 0))
  } catch {
    return []
  }
}

export function logFocusSession(
  userId: string,
  input: { presetId: string; durationMinutes: number; completedAt: number; name?: string },
): FocusSessionRecord | null {
  if (typeof window === 'undefined') return null
  if (!input || input.durationMinutes <= 0) return null
  const record: FocusSessionRecord = {
    id: makeId(),
    userId,
    presetId: input.presetId,
    startedAt: new Date(input.completedAt - input.durationMinutes * 60_000).toISOString(),
    endedAt: new Date(input.completedAt).toISOString(),
    durationMinutes: input.durationMinutes,
    completed: true,
    name: input.name || undefined,
    createdAt: new Date(input.completedAt).toISOString(),
  }
  try {
    const rows = listFocusSessions(userId)
    rows.push(record)
    const trimmed = rows
      .sort((a, b) => (a.endedAt < b.endedAt ? 1 : a.endedAt > b.endedAt ? -1 : 0))
      .slice(0, MAX_SESSIONS)
    window.localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(trimmed))
    return record
  } catch {
    return null
  }
}