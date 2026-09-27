import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BUNDLE_VERSION,
  backupFilename,
  exportAllData,
  importBundle,
  parseBundle,
  validateBundle,
  type BundleData,
  type ExportBundle,
} from '@/services/data-port-service'

type Row = Record<string, unknown>
type Store = Record<string, Row[]>

const USER_ID = 'user-1'

function keyOf(row: Row, keyColumns: string[]): string {
  return keyColumns.map((column) => String(row[column] ?? '')).join('|')
}

function makeFakeClient(store: Store, options: { failOn?: string[] } = {}) {
  const failOn = new Set(options.failOn ?? [])
  const tables: Record<string, Row[]> = {}
  for (const [table, rows] of Object.entries(store)) {
    tables[table] = rows.map((row) => ({ ...row }))
  }

  const from = (table: string) => {
    const builder = {
      select: (_columns: string) => {
        if (failOn.has(table)) {
          return {
            then: (resolve: (value: { data: null; error: { message: string } }) => void) =>
              resolve({ data: null, error: { message: `relation "${table}" does not exist` } }),
          }
        }
        let matched: Row[] = [...(tables[table] ?? [])]
        const chain = {
          eq: (column: string, value: unknown) => {
            matched = matched.filter((row) => row[column] === value)
            return chain
          },
          then: (resolve: (value: { data: Row[]; error: null }) => void) =>
            resolve({ data: matched.map((row) => ({ ...row })), error: null }),
        }
        return chain
      },
      upsert: (rows: Row[], upsertOptions?: { onConflict?: string }) => {
        const keyColumns = (upsertOptions?.onConflict ?? 'id')
          .split(',')
          .map((column) => column.trim())
        const byKey = new Map((tables[table] ?? []).map((row) => [keyOf(row, keyColumns), row]))
        for (const row of rows) byKey.set(keyOf(row, keyColumns), { ...row })
        tables[table] = [...byKey.values()]
        return Promise.resolve({ data: rows, error: null })
      },
    }
    return builder
  }

  return {
    from,
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    },
    getTables: () => tables,
  }
}

function sampleStore(): Store {
  const user = USER_ID
  return {
    profiles: [{ id: user, full_name: 'Ada', created_at: 'c', updated_at: 'u' }],
    categories: [{ id: 'cat-1', user_id: user, name: 'Work', color: '#6366f1', created_at: 'c' }],
    tasks: [
      {
        id: 'task-1',
        user_id: user,
        category_id: 'cat-1',
        title: 'Write the memo',
        description: null,
        priority: 'medium',
        difficulty: 'medium',
        estimated_minutes: 30,
        remaining_minutes: 30,
        deadline: null,
        can_split: true,
        status: 'todo',
        locked: false,
        scheduled_start: null,
        scheduled_end: null,
        completed_at: null,
        parent_task_id: null,
        created_at: 'c',
        updated_at: 'u',
      },
    ],
    calendar_events: [
      {
        id: 'event-1',
        user_id: user,
        title: 'Standup',
        description: null,
        start_at: 's',
        end_at: 'e',
        all_day: false,
        event_type: 'fixed',
        locked: false,
        location: null,
        color: '#8b5cf6',
        created_at: 'c',
      },
    ],
    habits: [
      {
        id: 'habit-1',
        user_id: user,
        name: 'Walk',
        description: null,
        frequency: 'daily',
        target_per_week: 0,
        preferred_time: null,
        estimated_minutes: 20,
        color: '#10b981',
        active: true,
        created_at: 'c',
      },
    ],
    habit_logs: [
      { id: 'log-1', user_id: user, habit_id: 'habit-1', log_date: '2026-09-20', completed: true, created_at: 'c' },
    ],
    goals: [{ id: 'goal-1', user_id: user, title: 'Aim', description: null, target_date: null, status: 'active', created_at: 'c' }],
    daily_plans: [{ id: 'plan-1', user_id: user, plan_date: '2026-09-20', balance_score: 50, generated_at: 'g' }],
    schedule_blocks: [
      {
        id: 'block-1',
        user_id: user,
        plan_date: '2026-09-20',
        block_type: 'task',
        title: 'Focus',
        task_id: 'task-1',
        event_id: null,
        habit_id: null,
        start_at: 's',
        end_at: 'e',
        locked: false,
        completed: false,
        skipped: false,
        note: null,
        color: null,
        created_at: 'c',
      },
    ],
    wellbeing_checkins: [
      { id: 'ck-1', user_id: user, checkin_date: '2026-09-20', energy: 4, stress: 3, sleep_hours: 8, note: null, created_at: 'c' },
    ],
    notifications: [
      { id: 'ntf-1', user_id: user, type: 'task', title: 'T', body: 'B', data: null, read: false, key: 'k', deadline_at: null, created_at: 'c' },
    ],
    settings: [
      {
        user_id: user,
        sleep_target_hours: 8,
        break_every_minutes: 60,
        break_minutes: 10,
        focus_start: '08:00',
        focus_end: '22:00',
        max_session_minutes: 90,
        wake_time: '07:00',
        bed_time: '23:00',
        energy_pref: false,
        notification_prefs: {},
        theme: 'system',
        onboarded: true,
        onboarding_completed_at: null,
        updated_at: 'u',
      },
    ],
    task_sessions: [
      { id: 'sess-1', task_id: 'task-1', user_id: user, start_at: 's', end_at: 'e', duration_minutes: 25, completed: true, created_at: 'c' },
    ],
    templates: [
      {
        id: 'tmpl-1',
        user_id: user,
        name: 'N',
        emoji: '📘',
        description: null,
        category: 'focus',
        tasks: [],
        author_name: 'Ada',
        is_public: false,
        created_at: 'c',
        updated_at: 'u',
      },
    ],
  }
}

function emptyData(): BundleData {
  return {
    profiles: [],
    categories: [],
    tasks: [],
    calendar_events: [],
    habits: [],
    habit_logs: [],
    goals: [],
    daily_plans: [],
    schedule_blocks: [],
    wellbeing_checkins: [],
    notifications: [],
    settings: [],
    task_sessions: [],
    templates: [],
  }
}

function bundle(overrides: Record<string, unknown> = {}): ExportBundle {
  return {
    version: BUNDLE_VERSION,
    exported_at: '2026-09-20T00:00:00.000Z',
    user_id: USER_ID,
    data: { ...emptyData(), ...overrides } as unknown as BundleData,
  }
}

describe('exportAllData', () => {
  it('serializes every table into the bundle', async () => {
    const store = sampleStore()
    const client = makeFakeClient(store)
    const result = await exportAllData(client as unknown as SupabaseClient)

    expect(result.version).toBe(BUNDLE_VERSION)
    expect(result.user_id).toBe(USER_ID)
    expect(typeof result.exported_at).toBe('string')
    const keys = Object.keys(store) as Array<keyof BundleData>
    for (const key of keys) {
      expect(result.data[key]).toEqual(store[key])
    }
  })

  it('surfaces a query error instead of silently returning an empty table', async () => {
    const client = makeFakeClient(sampleStore(), { failOn: ['goals'] })
    await expect(exportAllData(client as unknown as SupabaseClient)).rejects.toThrow()
  })
})

describe('validateBundle / parseBundle', () => {
  it('accepts a well-formed bundle', () => {
    const value = bundle({ tasks: sampleStore().tasks as Row[] })
    expect(() => validateBundle(value)).not.toThrow()
  })

  it('rejects a wrong bundle version', () => {
    const value = { ...bundle(), version: 99 }
    expect(() => validateBundle(value)).toThrow(/version/i)
  })

  it('rejects a wrong data shape', () => {
    const value = { ...bundle(), data: { tasks: 'not-an-array' } }
    expect(() => validateBundle(value)).toThrow(/shape/i)
  })

  it('rejects non-object input', () => {
    expect(() => validateBundle(null)).toThrow(/object/i)
  })

  it('parseBundle throws on invalid JSON', () => {
    expect(() => parseBundle('{ not json')).toThrow(/json/i)
  })
})

describe('importBundle', () => {
  it('inserts rows in a fresh database', async () => {
    const store = sampleStore()
    const client = makeFakeClient({})
    const value = bundle({
      tasks: store.tasks as Row[],
      categories: store.categories as Row[],
      habit_logs: store.habit_logs as Row[],
    })

    const result = await importBundle(client as unknown as SupabaseClient, value)

    expect(result.inserted).toBe(3)
    expect(result.updated).toBe(0)
    expect(result.restored).toBe(3)
    expect(result.errors).toEqual([])
    expect(client.getTables().tasks ?? []).toEqual(store.tasks)
    expect(client.getTables().categories ?? []).toEqual(store.categories)
    expect(client.getTables().tasks?.[0]?.user_id).toBe(USER_ID)
  })

  it('rejects a wrong version', async () => {
    const client = makeFakeClient({})
    const value = { ...bundle(), version: 99 }
    await expect(
      importBundle(client as unknown as SupabaseClient, value as never),
    ).rejects.toThrow(/version/i)
  })

  it('rejects a wrong shape', async () => {
    const client = makeFakeClient({})
    const value = { ...bundle(), data: { tasks: 'not-an-array' } }
    await expect(
      importBundle(client as unknown as SupabaseClient, value as never),
    ).rejects.toThrow(/shape/i)
    expect(Object.keys(client.getTables())).toHaveLength(0)
  })

  it('is idempotent: re-importing the same bundle changes nothing', async () => {
    const client = makeFakeClient({})
    const store = sampleStore()
    const value = bundle({ tasks: store.tasks as Row[] })

    const first = await importBundle(client as unknown as SupabaseClient, value)
    expect(first.inserted).toBe(1)
    expect(first.updated).toBe(0)

    const before = client.getTables().tasks ?? []
    const second = await importBundle(client as unknown as SupabaseClient, value)
    expect(second.inserted).toBe(0)
    expect(second.updated).toBe(1)
    expect(client.getTables().tasks ?? []).toEqual(before)
    expect(client.getTables().tasks ?? []).toHaveLength(1)
  })

  it('overwrites drifted rows rather than skipping them', async () => {
    const existing = { ...(sampleStore().tasks?.[0] ?? {}), title: 'Old title' }
    const freshRow = { ...(sampleStore().tasks?.[0] ?? {}), id: 'task-2', title: 'New task' }
    const client = makeFakeClient({ tasks: [existing] })
    const value = bundle({ tasks: [existing, freshRow] })

    const result = await importBundle(client as unknown as SupabaseClient, value)

    expect(result.inserted).toBe(1)
    expect(result.updated).toBe(1)
    expect(result.errors).toEqual([])
    const tasks = client.getTables().tasks ?? []
    expect(tasks.map((row) => row.title)).toEqual(['Old title', 'New task'])
  })

  it('collapses duplicate keys inside one bundle', async () => {
    const row = sampleStore().tasks?.[0] ?? {}
    const client = makeFakeClient({})
    const value = bundle({ tasks: [row, { ...row, title: 'Later wins' }] })

    const result = await importBundle(client as unknown as SupabaseClient, value)

    expect(result.inserted).toBe(1)
    expect(result.restored).toBe(1)
    expect(client.getTables().tasks ?? []).toHaveLength(1)
    expect(client.getTables().tasks?.[0]?.title).toBe('Later wins')
  })

  it('records per-table errors without failing the whole import', async () => {
    const client = makeFakeClient({}, { failOn: ['goals'] })
    const store = sampleStore()
    const value = bundle({
      tasks: store.tasks as Row[],
      goals: store.goals as Row[],
    })

    const result = await importBundle(client as unknown as SupabaseClient, value)

    expect(result.inserted).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('goals')
  })
})

describe('backupFilename', () => {
  it('uses the morrow-backup-YYYY-MM-DD.json pattern', () => {
    expect(backupFilename(new Date(2026, 8, 20))).toBe('morrow-backup-2026-09-20.json')
  })
})
