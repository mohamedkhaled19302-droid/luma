import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearLocalData } from '@/data/local-db'
import { localData } from '@/data/query-shim'

/**
 * Behavioural tests for the local data layer.
 *
 * The planner used to run on PostgREST, where `await supabase.from(..)` resolves
 * to `{ data, error }` and never rejects. These tests pin that contract down
 * against Dexie, because a silent divergence here would surface as empty lists
 * or unhandled rejections across the whole app rather than as a clear failure.
 */

const USER = 'user-1'
const OTHER = 'user-2'

type Row = Record<string, unknown>

function makeTask(overrides: Row = {}): Row {
  return {
    user_id: USER,
    title: 'Write report',
    priority: 'high',
    estimated_minutes: 60,
    ...overrides,
  }
}

async function seedTasks(count: number, userId = USER): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await localData.from('tasks').insert(
      makeTask({ user_id: userId, title: `Task ${i}`, status: 'todo' }),
    )
  }
}

beforeEach(async () => {
  // The database is deliberately not closed between tests: a closed Dexie
  // instance cannot be reopened, which would cascade failures.
  await clearLocalData()
})

describe('insert', () => {
  it('applies Postgres column defaults so partial inserts are complete', async () => {
    const { data, error } = await localData
      .from('tasks')
      .insert({ user_id: USER, title: 'Minimal' })
      .select()
      .single()

    expect(error).toBeNull()
    const row = data as unknown as Row
    expect(row['priority']).toBe('medium')
    expect(row['difficulty']).toBe('medium')
    expect(row['status']).toBe('todo')
    expect(row['can_split']).toBe(true)
    expect(row['locked']).toBe(false)
    expect(row['estimated_minutes']).toBe(60)
    expect(typeof row['id']).toBe('string')
    expect(String(row['id']).length).toBeGreaterThan(0)
    expect(typeof row['created_at']).toBe('string')
  })

  it('stores an explicit null rather than a missing key', async () => {
    const { data } = await localData
      .from('tasks')
      .insert(makeTask())
      .select()
      .single()
    const row = data as unknown as Row
    expect(row['deadline']).toBeNull()
    expect(row['description']).toBeNull()
    expect('deadline' in row).toBe(true)
  })

  it('seeds a full settings row, including assistant preferences', async () => {
    const { data, error } = await localData.from('settings').insert({ user_id: USER }).select().single()
    expect(error).toBeNull()
    const row = data as unknown as Row
    expect(row['focus_start']).toBe('08:00')
    expect(row['theme']).toBe('system')
    const prefs = row['assistant_prefs'] as Row
    expect(prefs['enabled']).toBe(false)
    expect(prefs['wake_word']).toBe(false)
  })

  it('returns an error instead of rejecting on a duplicate id', async () => {
    await localData.from('tasks').insert(makeTask({ id: 'fixed-1' }))
    // PostgREST resolves with an error; it never rejects. A rejection here would
    // become an unhandled promise rejection in callers that only destructure.
    const result = await localData.from('tasks').insert(makeTask({ id: 'fixed-1' }))
    expect(result.error).not.toBeNull()
    expect(result.error?.code).toBe('23505')
    expect(result.data).toBeNull()
  })
})

describe('select and filters', () => {
  it('scopes rows to the user', async () => {
    await seedTasks(2, USER)
    await seedTasks(3, OTHER)
    const { data } = await localData.from('tasks').select().eq('user_id', USER)
    expect(data).toHaveLength(2)
  })

  it('supports in() membership', async () => {
    await localData.from('tasks').insert(makeTask({ title: 'A', status: 'todo' }))
    await localData.from('tasks').insert(makeTask({ title: 'B', status: 'done' }))
    const { data } = await localData.from('tasks').select().in('status', ['todo'])
    expect(data).toHaveLength(1)
    expect((data as Row[])[0]?.['title']).toBe('A')
  })

  it('excludes nulls from ordering comparisons, like Postgres', async () => {
    await localData
      .from('tasks')
      .insert(makeTask({ title: 'dated', deadline: '2026-09-20' }))
    await localData.from('tasks').insert(makeTask({ title: 'undated' }))
    const { data } = await localData.from('tasks').select().gte('deadline', '2026-09-01')
    expect(data).toHaveLength(1)
    expect((data as Row[])[0]?.['title']).toBe('dated')
  })

  it('supports not(column, is, null)', async () => {
    await localData
      .from('tasks')
      .insert(makeTask({ title: 'has deadline', deadline: '2026-09-20' }))
    await localData.from('tasks').insert(makeTask({ title: 'no deadline' }))
    const { data } = await localData.from('tasks').select().not('deadline', 'is', null)
    expect(data).toHaveLength(1)
    expect((data as Row[])[0]?.['title']).toBe('has deadline')
  })

  it('supports case-insensitive contains via ilike', async () => {
    await localData.from('tasks').insert(makeTask({ title: 'Renew Passport' }))
    const { data } = await localData.from('tasks').select().ilike('title', '%passport%')
    expect(data).toHaveLength(1)
  })

  it('orders ascending and descending', async () => {
    await localData.from('tasks').insert(makeTask({ title: 'B', priority: 'low' }))
    await localData.from('tasks').insert(makeTask({ title: 'A', priority: 'critical' }))
    const asc = await localData.from('tasks').select().order('title', { ascending: true })
    expect((asc.data as Row[]).map((row) => row['title'])).toEqual(['A', 'B'])
    const desc = await localData.from('tasks').select().order('title', { ascending: false })
    expect((desc.data as Row[]).map((row) => row['title'])).toEqual(['B', 'A'])
  })

  it('honours limit', async () => {
    await seedTasks(5)
    const { data } = await localData.from('tasks').select().limit(2)
    expect(data).toHaveLength(2)
  })

  it('projects only the requested columns', async () => {
    await localData.from('tasks').insert(makeTask())
    const { data } = await localData.from('tasks').select('id, title')
    expect(data).toHaveLength(1)
    expect(Object.keys((data as Row[])[0] as Row).sort()).toEqual(['id', 'title'])
  })
})

describe('single and maybeSingle', () => {
  it('single returns the row when exactly one matches', async () => {
    await localData.from('tasks').insert(makeTask())
    const { data, error } = await localData.from('tasks').select().eq('user_id', USER).single()
    expect(error).toBeNull()
    expect((data as unknown as Row)['title']).toBe('Write report')
  })

  it('single errors with PGRST116 when nothing matches', async () => {
    const { data, error } = await localData.from('tasks').select().eq('user_id', 'nobody').single()
    expect(data).toBeNull()
    expect(error?.code).toBe('PGRST116')
  })

  it('single errors when more than one matches', async () => {
    await seedTasks(2)
    const { error } = await localData.from('tasks').select().eq('user_id', USER).single()
    expect(error?.code).toBe('PGRST116')
  })

  it('maybeSingle returns null with no error when nothing matches', async () => {
    const { data, error } = await localData
      .from('tasks')
      .select()
      .eq('user_id', 'nobody')
      .maybeSingle()
    expect(error).toBeNull()
    expect(data).toBeNull()
  })
})

describe('update and delete', () => {
  it('updates only matching rows and returns them', async () => {
    await localData.from('tasks').insert(makeTask({ id: 'u1', status: 'todo' }))
    await localData.from('tasks').insert(makeTask({ id: 'u2', status: 'todo' }))
    const { data } = await localData
      .from('tasks')
      .update({ status: 'done' })
      .eq('id', 'u1')
      .select()
    expect(data).toHaveLength(1)
    expect((data as Row[])[0]?.['status']).toBe('done')
    const other = await localData.from('tasks').select().eq('id', 'u2').maybeSingle()
    expect((other.data as unknown as Row)['status']).toBe('todo')
  })

  it('bumps updated_at on touched tables', async () => {
    const { data: inserted } = await localData.from('tasks').insert(makeTask()).select().single()
    const before = (inserted as unknown as Row)['updated_at'] as string
    await new Promise((resolve) => setTimeout(resolve, 5))
    await localData.from('tasks').update({ title: 'Renamed' }).eq('user_id', USER)
    const { data: after } = await localData.from('tasks').select().eq('user_id', USER).single()
    expect((after as unknown as Row)['updated_at'] as string > before).toBe(true)
  })

  it('deletes only matching rows', async () => {
    await localData.from('tasks').insert(makeTask({ id: 'd1' }))
    await localData.from('tasks').insert(makeTask({ id: 'd2' }))
    await localData.from('tasks').delete().eq('id', 'd1')
    const { data } = await localData.from('tasks').select()
    expect(data).toHaveLength(1)
    expect((data as Row[])[0]?.['id']).toBe('d2')
  })
})

describe('upsert', () => {
  it('inserts when the conflict key is absent', async () => {
    await localData.from('tasks').upsert(makeTask({ id: 'k1', title: 'First' }))
    const { data } = await localData.from('tasks').select().eq('id', 'k1')
    expect(data).toHaveLength(1)
  })

  it('updates in place on a single-column conflict key', async () => {
    await localData.from('tasks').upsert(makeTask({ id: 'k1', title: 'First' }))
    await localData.from('tasks').upsert(makeTask({ id: 'k1', title: 'Second' }))
    const { data } = await localData.from('tasks').select().eq('id', 'k1')
    expect(data).toHaveLength(1)
    expect((data as Row[])[0]?.['title']).toBe('Second')
  })

  it('matches on a compound conflict key, not the primary key', async () => {
    // daily_plans is keyed [user_id, plan_date] while its primary key is `id`,
    // so an upsert must resolve through the compound index.
    await localData
      .from('daily_plans')
      .upsert({ id: 'p1', user_id: USER, plan_date: '2026-09-24', balance_score: 40 })
    await localData
      .from('daily_plans')
      .upsert({ id: 'p2', user_id: USER, plan_date: '2026-09-24', balance_score: 90 })

    const { data } = await localData
      .from('daily_plans')
      .select()
      .eq('user_id', USER)
      .eq('plan_date', '2026-09-24')
    expect(data).toHaveLength(1)
    expect((data as Row[])[0]?.['balance_score']).toBe(90)
  })
})

describe('wearable tables', () => {
  function makeSample(overrides: Row = {}): Row {
    return {
      user_id: USER,
      metric: 'heart_rate',
      value: 128,
      recorded_at: '2026-09-20T07:30:00.000Z',
      source: 'bluetooth',
      ...overrides,
    }
  }

  // Regression: the health tables were missing from the Dexie schema, so every
  // read resolved to "Local data layer has no table" and the health page showed
  // an error instead of the user's readings.
  it('resolves the health tables instead of reporting them missing', async () => {
    const { data, error } = await localData.from('health_samples').select()
    expect(error).toBeNull()
    expect(data).toEqual([])

    const connections = await localData.from('health_connections').select()
    expect(connections.error).toBeNull()
  })

  it('stamps id, unit and received_at on a partial sample insert', async () => {
    const { data, error } = await localData.from('health_samples').insert(makeSample()).select()
    expect(error).toBeNull()
    const row = (data as Row[])[0]!
    expect(typeof row['id']).toBe('string')
    // received_at is when the app took the reading, not when it was worn, so it
    // defaults to now rather than mirroring recorded_at.
    expect(Number.isNaN(Date.parse(String(row['received_at'])))).toBe(false)
    expect(String(row['received_at'])).not.toBe(row['recorded_at'])
    expect(row['session_id']).toBeNull()
    expect(row['note']).toBeNull()
  })

  it('keeps one account\'s readings invisible to the other', async () => {
    await localData.from('health_samples').insert(makeSample({ value: 90 }))
    await localData.from('health_samples').insert(makeSample({ user_id: OTHER, value: 190 }))

    const mine = await localData.from('health_samples').select().eq('user_id', USER)
    const theirs = await localData.from('health_samples').select().eq('user_id', OTHER)
    expect(mine.data).toHaveLength(1)
    expect((mine.data as Row[])[0]?.['value']).toBe(90)
    expect(theirs.data).toHaveLength(1)
    expect((theirs.data as Row[])[0]?.['value']).toBe(190)
  })

  it('reads a time window the way the health page asks for it', async () => {
    await localData.from('health_samples').insert(makeSample({ recorded_at: '2026-09-19T07:00:00.000Z' }))
    await localData
      .from('health_samples')
      .insert(makeSample({ recorded_at: '2026-09-20T07:00:00.000Z' }))
    await localData.from('health_samples').insert(makeSample({ recorded_at: '2026-09-18T07:00:00.000Z' }))

    const window = await localData
      .from('health_samples')
      .select()
      .eq('user_id', USER)
      .gte('recorded_at', '2026-09-19T00:00:00.000Z')
      .order('recorded_at', { ascending: true })

    expect(window.error).toBeNull()
    expect(window.data).toHaveLength(2)
  })

  it('reconnects to the same strap rather than logging it twice', async () => {
    const row = { user_id: USER, source: 'bluetooth', device_name: 'H10', status: 'connected' }
    await localData.from('health_connections').upsert(row, { onConflict: 'user_id,device_name' })
    await localData
      .from('health_connections')
      .upsert({ ...row, status: 'disconnected' }, { onConflict: 'user_id,device_name' })

    const { data } = await localData.from('health_connections').select()
    expect(data).toHaveLength(1)
    expect((data as Row[])[0]?.['status']).toBe('disconnected')
  })
})

describe('account isolation on a shared device', () => {
  it('keeps two accounts on one device separate', async () => {
    await seedTasks(1, USER)
    await seedTasks(2, OTHER)
    const mine = await localData.from('tasks').select().eq('user_id', USER)
    const theirs = await localData.from('tasks').select().eq('user_id', OTHER)
    expect(mine.data).toHaveLength(1)
    expect(theirs.data).toHaveLength(2)
  })
})

describe('failures', () => {
  it('reports an unknown table rather than throwing', async () => {
    const { error } = await localData.from('no_such_table').select()
    expect(error).not.toBeNull()
    expect(String(error?.message)).toContain('no_such_table')
  })
})
