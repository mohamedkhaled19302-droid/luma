import { supabase } from '@/database/client'
import {
  queueMutationAdd,
  queueMutationGetAll,
  queueMutationRemove,
} from '@/storage/indexeddb'

const TABLE_BY_ENTITY: Record<string, string> = {
  task: 'tasks',
  tasksession: 'task_sessions',
  event: 'calendar_events',
  habit: 'habits',
  habitlog: 'habit_logs',
  block: 'schedule_blocks',
  checkin: 'wellbeing_checkins',
  goal: 'goals',
  profile: 'profiles',
  settings: 'settings',
  notification: 'notifications',
}

const listeners = new Set<(online: boolean) => void>()
let online = typeof navigator !== 'undefined' ? navigator.onLine : true

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setOnline(true))
  window.addEventListener('offline', () => setOnline(false))
}

function setOnline(value: boolean) {
  if (online === value) return
  online = value
  for (const listener of listeners) listener(value)
}

export function isOnline(): boolean {
  return online && typeof navigator !== 'undefined' ? navigator.onLine : online
}

export function subscribeOnline(listener: (online: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Queue an upsert that will be replayed when the connection is restored. */
export async function enqueueUpsert(
  entity: keyof typeof TABLE_BY_ENTITY & string,
  record: Record<string, unknown>,
): Promise<void> {
  await queueMutationAdd({
    id: makeId(),
    entity,
    operation: 'upsert',
    record,
    createdAt: new Date().toISOString(),
  })
}

/** Queue a delete that will be replayed when the connection is restored. */
export async function enqueueDelete(entity: string, id: string): Promise<void> {
  await queueMutationAdd({
    id: makeId(),
    entity,
    operation: 'delete',
    record: { id },
    createdAt: new Date().toISOString(),
  })
}

/**
 * Replay all queued offline mutations against Supabase. Returns the number
 * of mutations successfully replayed. Failed ones stay queued.
 */
export async function flushMutationQueue(): Promise<number> {
  if (!isOnline()) return 0
  const queued = await queueMutationGetAll()
  let flushed = 0
  for (const mutation of queued) {
    try {
      const table = TABLE_BY_ENTITY[mutation.entity]
      if (!table) {
        await queueMutationRemove(mutation.id)
        flushed += 1
        continue
      }
      if (mutation.operation === 'delete') {
        const { error } = await supabase.from(table).delete().eq('id', mutation.record?.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from(table).upsert(mutation.record ?? {})
        if (error) throw error
      }
      await queueMutationRemove(mutation.id)
      flushed += 1
    } catch {
      // Keep the mutation queued for the next retry.
    }
  }
  return flushed
}

export async function hasPendingMutations(): Promise<boolean> {
  return (await queueMutationGetAll()).length > 0
}

export function maybeCatchOffline(error: unknown, fallback: () => Promise<void>): Promise<boolean> {
  const message = (
    (error as { message?: string })?.message ??
    (error as string) ??
    ''
  ).toLowerCase()
  const looksOffline =
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('fetch failed') ||
    !isOnline()
  if (!looksOffline) return Promise.resolve(false)
  return fallback().then(() => true)
}