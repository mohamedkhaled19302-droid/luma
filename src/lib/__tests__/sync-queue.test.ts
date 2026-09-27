import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncFilterChain, SyncFlushClient, SyncOpInput } from '../sync-queue'

type QueueModule = typeof import('../sync-queue')

function installFakeStorage(): Map<string, string> {
  const store = new Map<string, string>()
  const shim = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true })
  return store
}

function opInput(overrides: Partial<SyncOpInput> = {}): SyncOpInput {
  return {
    userId: 'u1',
    kind: 'test',
    table: 'tasks',
    ops: 'insert',
    payload: { title: 'x' },
    maxAttempts: 5,
    ...overrides,
  }
}

function createEmitter() {
  const handlers: Record<string, Array<() => void | Promise<void>>> = {}
  return {
    on(event: string, handler: () => void | Promise<void>) {
      let list = handlers[event]
      if (!list) {
        list = []
        handlers[event] = list
      }
      list.push(handler)
    },
    async emit(event: string) {
      for (const handler of handlers[event] ?? []) await handler()
    },
  }
}

type RecordedCall = {
  table: string
  ops: 'insert' | 'update' | 'delete' | 'upsert'
  payload: unknown
  filters: Array<[string, unknown]>
  onConflict?: string
}

function createClient(fail?: (call: RecordedCall) => boolean) {
  const calls: RecordedCall[] = []
  const record = (
    table: string,
    ops: RecordedCall['ops'],
    payload: unknown,
    filters: Array<[string, unknown]> = [],
    onConflict?: string,
  ) => {
    const call = { table, ops, payload, filters, onConflict }
    calls.push(call)
    return fail?.(call) ? { error: { message: 'boom' } } : { error: null }
  }
  const makeChain = (table: string, ops: 'update' | 'delete', payload: unknown) => {
    const filters: Array<[string, unknown]> = []
    const chain = {
      eq: (column: string, value: unknown) => {
        filters.push([column, value])
        return chain
      },
      then: (
        onfulfilled: ((value: unknown) => unknown) | null,
        onrejected: ((reason?: unknown) => unknown) | null,
      ) => Promise.resolve(record(table, ops, payload, filters)).then(onfulfilled, onrejected),
    }
    return chain as unknown as SyncFilterChain & PromiseLike<unknown>
  }
  const client: SyncFlushClient = {
    from: (table: string) => ({
      insert: async (payload) => record(table, 'insert', payload),
      upsert: async (payload, options) => record(table, 'upsert', payload, [], options?.onConflict),
      update: (fields) => makeChain(table, 'update', fields),
      delete: () => makeChain(table, 'delete', undefined),
    }),
  }
  return { client, calls }
}

async function freshQueue(): Promise<QueueModule> {
  vi.resetModules()
  return import('../sync-queue')
}

describe('sync queue', () => {
  let q: QueueModule

  beforeEach(async () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    q = await freshQueue()
  })

  it('enqueues ops in order and exposes list/isDirty/pendingCount/dequeue/clear', async () => {
    const a = q.enqueue(opInput({ table: 'tasks', ops: 'insert', payload: { title: 'first' } }))
    const b = q.enqueue(opInput({ table: 'tasks', ops: 'update', payload: { id: 't1', fields: { priority: 'high' } } }))
    const c = q.enqueue(opInput({ table: 'events', ops: 'delete', payload: { id: 'e1' } }))

    expect(q.list().map((op) => op.id)).toEqual([a.id, b.id, c.id])
    expect(q.isDirty()).toBe(true)
    expect(q.pendingCount()).toBe(3)

    expect(q.dequeue('missing')).toBeUndefined()
    expect(q.dequeue(a.id)?.id).toBe(a.id)
    expect(q.list().map((op) => op.id)).toEqual([b.id, c.id])

    q.clear()
    expect(q.list()).toEqual([])
    expect(q.isDirty()).toBe(false)
  })

  it('persists queued ops across restarts', async () => {
    const store = installFakeStorage()

    const first = await freshQueue()
    const a = first.enqueue(opInput({ table: 'tasks', ops: 'insert', payload: { title: 'persist' } }))
    const b = first.enqueue(opInput({ table: 'goals', ops: 'delete', payload: { id: 'g1' } }))

    const second = await freshQueue()
    expect(second.list().map((op) => op.id)).toEqual([a.id, b.id])
    expect(second.list()[0]?.payload).toEqual({ title: 'persist' })
    expect(store.get('morrow:sync-queue')).toBeDefined()

    second.dequeue(a.id)
    const third = await freshQueue()
    expect(third.list().map((op) => op.id)).toEqual([b.id])
  })

  it('flushes ops in order and maps ops onto perceived supabase calls', async () => {
    const { client, calls } = createClient()
    q.enqueue(opInput({ table: 'tasks', ops: 'insert', payload: { title: 'first' } }))
    q.enqueue(opInput({ table: 'tasks', ops: 'update', payload: { id: 't1', fields: { priority: 'high' } } }))
    q.enqueue(opInput({ table: 'events', ops: 'delete', payload: { id: 'e1' } }))
    q.enqueue(opInput({ table: 'settings', ops: 'upsert', payload: { user_id: 'u1', theme: 'dark' } }))

    const result = await q.flushPending(client)

    expect(result).toEqual({ flushed: 4, failed: 0 })
    expect(q.list()).toEqual([])
    expect(calls).toEqual([
      { table: 'tasks', ops: 'insert', payload: { title: 'first' }, filters: [], onConflict: undefined },
      { table: 'tasks', ops: 'update', payload: { priority: 'high' }, filters: [['id', 't1']], onConflict: undefined },
      { table: 'events', ops: 'delete', payload: undefined, filters: [['id', 'e1']], onConflict: undefined },
      { table: 'settings', ops: 'upsert', payload: { user_id: 'u1', theme: 'dark' }, filters: [], onConflict: 'user_id' },
    ])
  })

  it('increments attempts and drops ops at maxAttempts', async () => {
    const { client } = createClient(() => true)
    q.enqueue(opInput({ maxAttempts: 2 }))

    const first = await q.flushPending(client)
    expect(first).toEqual({ flushed: 0, failed: 1 })
    expect(q.list()).toHaveLength(1)
    expect(q.list()[0]?.attempts).toBe(1)

    const second = await q.flushPending(client)
    expect(second).toEqual({ flushed: 0, failed: 1 })
    expect(q.list()).toEqual([])
  })

  it('keeps a failed op queued and retries it once the transport recovers', async () => {
    let failing = true
    const { client, calls } = createClient((call) => call.table === 'tasks' && failing)
    q.enqueue(opInput({ table: 'tasks', ops: 'insert', payload: { title: 'y' } }))
    q.enqueue(opInput({ table: 'goals', ops: 'insert', payload: { title: 'z' } }))

    const first = await q.flushPending(client)
    expect(first).toEqual({ flushed: 1, failed: 1 })
    expect(q.pendingCount()).toBe(1)

    failing = false
    const second = await q.flushPending(client)
    expect(second).toEqual({ flushed: 1, failed: 0 })
    expect(q.pendingCount()).toBe(0)
    expect(calls.filter((call) => call.table === 'tasks')).toHaveLength(2)
  })

  it('flushes queued ops when connectivity returns', async () => {
    const { client, calls } = createClient()
    const events = createEmitter()
    events.on('online', async () => {
      if (q.pendingCount() > 0) await q.flushPending(client)
    })

    q.enqueue(opInput({ table: 'habits', ops: 'insert', payload: { name: 'read' } }))
    expect(calls).toHaveLength(0)

    await events.emit('online')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.table).toBe('habits')
    expect(q.pendingCount()).toBe(0)
  })

  it('is idempotent — flushing twice applies queued ops once', async () => {
    const { client, calls } = createClient()
    q.enqueue(opInput({ table: 'tasks', ops: 'delete', payload: { id: 't9' } }))

    expect(await q.flushPending(client)).toEqual({ flushed: 1, failed: 0 })
    expect(await q.flushPending(client)).toEqual({ flushed: 0, failed: 0 })
    expect(calls).toHaveLength(1)
  })

  it('notifies subscribers on enqueue, dequeue and clear', async () => {
    let notified = 0
    const unsubscribe = q.subscribePending(() => {
      notified += 1
    })
    q.enqueue(opInput())
    q.enqueue(opInput())
    expect(notified).toBe(2)
    q.clear()
    expect(notified).toBe(3)
    unsubscribe()
    q.enqueue(opInput())
    expect(notified).toBe(3)
  })
})