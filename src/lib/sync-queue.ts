export type SyncOpKind = 'insert' | 'update' | 'delete' | 'upsert'

export interface SyncOp {
  id: string
  userId: string
  kind: string
  table: string
  ops: SyncOpKind
  payload: Record<string, unknown>
  ts: string
  attempts: number
  maxAttempts: number
}

export interface SyncOpInput {
  userId: string
  kind?: string
  table: string
  ops: SyncOpKind
  payload: Record<string, unknown>
  maxAttempts?: number
}

export interface SyncFlushClient {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => PromiseLike<unknown>
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict?: string },
    ) => PromiseLike<unknown>
    update: (fields: Record<string, unknown>) => SyncFilterChain & PromiseLike<unknown>
    delete: () => SyncFilterChain & PromiseLike<unknown>
  }
}

export interface SyncFilterChain {
  eq: (column: string, value: unknown) => SyncFilterChain & PromiseLike<unknown>
}

export interface FlushResult {
  flushed: number
  failed: number
}

import { STORAGE_KEYS } from '@/lib/brand'

const STORAGE_KEY = STORAGE_KEYS.syncQueue
const DEFAULT_MAX_ATTEMPTS = 5

const CONFLICT_BY_TABLE: Record<string, string> = {
  categories: 'id',
  daily_plans: 'user_id,plan_date',
  habit_logs: 'user_id,habit_id,log_date',
  settings: 'user_id',
  wellbeing_checkins: 'user_id,checkin_date',
}

let pendingOps: SyncOp[] | null = null
const listeners = new Set<() => void>()
const onlineListeners = new Set<(online: boolean) => void>()
let flushing = false
let online = typeof navigator !== 'undefined' ? navigator.onLine : true

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setOnline(true))
  window.addEventListener('offline', () => setOnline(false))
}

function storage(): Storage | null {
  try {
    return ((globalThis as { localStorage?: Storage }).localStorage ?? null) as Storage | null
  } catch {
    return null
  }
}

function isSyncOp(value: unknown): value is SyncOp {
  if (!value || typeof value !== 'object') return false
  const op = value as Record<string, unknown>
  return (
    typeof op.id === 'string' &&
    typeof op.userId === 'string' &&
    typeof op.kind === 'string' &&
    typeof op.table === 'string' &&
    (op.ops === 'insert' || op.ops === 'update' || op.ops === 'delete' || op.ops === 'upsert') &&
    typeof op.payload === 'object' &&
    op.payload !== null &&
    typeof op.ts === 'string' &&
    typeof op.attempts === 'number' &&
    typeof op.maxAttempts === 'number'
  )
}

function loadPending(): SyncOp[] | null {
  const store = storage()
  if (!store) return null
  const raw = store.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter(isSyncOp)
  } catch {
    return null
  }
}

function save(): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(pendingOps ?? []))
  } catch {
    // Storage unavailable or full — keep the in-memory queue.
  }
}

function notifyPending(): void {
  for (const listener of listeners) listener()
}

function ops(): SyncOp[] {
  if (pendingOps === null) pendingOps = loadPending() ?? []
  return pendingOps
}

function makeId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function enqueue(input: SyncOpInput): SyncOp {
  const op: SyncOp = {
    id: makeId(),
    userId: input.userId,
    kind: input.kind ?? input.table,
    table: input.table,
    ops: input.ops,
    payload: { ...input.payload },
    ts: new Date().toISOString(),
    attempts: 0,
    maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
  }
  ops().push(op)
  save()
  notifyPending()
  return op
}

export function dequeue(id: string): SyncOp | undefined {
  const queue = ops()
  const index = queue.findIndex((op) => op.id === id)
  if (index === -1) return undefined
  const removed = queue[index]
  queue.splice(index, 1)
  save()
  notifyPending()
  return removed
}

export function list(): SyncOp[] {
  return ops().map((op) => ({ ...op, payload: { ...op.payload } }))
}

export function clear(): void {
  if (pendingOps === null || pendingOps.length === 0) return
  pendingOps = []
  save()
  notifyPending()
}

export function isDirty(): boolean {
  return ops().length > 0
}

export function pendingCount(): number {
  return ops().length
}

export function subscribePending(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isOnlineNow(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false && online
}

export function setOnline(value: boolean): void {
  if (online === value) return
  online = value
  for (const listener of onlineListeners) listener(value)
}

export function subscribeOnline(listener: (online: boolean) => void): () => void {
  onlineListeners.add(listener)
  return () => {
    onlineListeners.delete(listener)
  }
}

function incrementAttempts(id: string): void {
  const queue = ops()
  const index = queue.findIndex((op) => op.id === id)
  if (index === -1) return
  const op = queue[index]
  if (!op) return
  op.attempts += 1
  if (op.attempts >= op.maxAttempts) {
    queue.splice(index, 1)
  } else {
    op.ts = new Date().toISOString()
  }
  save()
  notifyPending()
}

async function invariant(result: unknown): Promise<void> {
  const error = (result as { error?: unknown } | null)?.error
  if (!error) return
  throw error instanceof Error ? error : new Error(String(error))
}

async function apply(client: SyncFlushClient, op: SyncOp): Promise<void> {
  const table = client.from(op.table)
  if (op.ops === 'insert') {
    await invariant(await table.insert(op.payload))
    return
  }
  if (op.ops === 'upsert') {
    const onConflict = CONFLICT_BY_TABLE[op.table]
    const result = onConflict
      ? await table.upsert(op.payload, { onConflict })
      : await table.upsert(op.payload)
    await invariant(result)
    return
  }
  if (op.ops === 'update') {
    let chain = table.update((op.payload.fields as Record<string, unknown> | undefined) ?? {})
    const id = typeof op.payload.id === 'string' ? op.payload.id : null
    const userId = typeof op.payload.user_id === 'string' ? op.payload.user_id : null
    if (id) chain = chain.eq('id', id)
    if (userId) chain = chain.eq('user_id', userId)
    await invariant(await chain)
    return
  }
  let chain = table.delete()
  const id = typeof op.payload.id === 'string' ? op.payload.id : null
  const userId = typeof op.payload.user_id === 'string' ? op.payload.user_id : null
  if (id) chain = chain.eq('id', id)
  if (userId) chain = chain.eq('user_id', userId)
  for (const [column, value] of Object.entries(op.payload)) {
    if (column === 'id' || column === 'user_id' || value === undefined) continue
    chain = chain.eq(column, value)
  }
  await invariant(await chain)
}

export async function flushPending(client: SyncFlushClient): Promise<FlushResult> {
  if (flushing) return { flushed: 0, failed: 0 }
  flushing = true
  try {
    let flushed = 0
    let failed = 0
    for (const op of list()) {
      try {
        await apply(client, op)
        dequeue(op.id)
        flushed += 1
      } catch {
        incrementAttempts(op.id)
        failed += 1
      }
    }
    return { flushed, failed }
  } finally {
    flushing = false
  }
}