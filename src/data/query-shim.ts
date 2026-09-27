import type { SupabaseClient } from '@supabase/supabase-js'
import { CONFLICT_KEYS, localDb, newId, nowIso, type TemplateRecord } from '@/data/local-db'
import { DEFAULT_ASSISTANT_PREFS } from '@/data/assistant-defaults'

/**
 * A minimal, faithful stand-in for the slice of the Supabase PostgREST client
 * this codebase actually uses.
 *
 * Why this exists: planner data now lives in IndexedDB, but 18 services were
 * written against `client.from(...).select().eq(...)`. Rather than rewrite all
 * of them (and risk subtle behavioural drift across ~330 call sites), the
 * planner queries are served from Dexie through this builder. The real Supabase
 * client is still used for authentication.
 *
 * Supported surface, chosen by auditing the call sites:
 *   from, select, insert, update, upsert, delete
 *   eq, gt, gte, lt, lte, in, ilike, not('is', null)
 *   order, limit, single, maybeSingle
 *
 * Deliberately NOT supported, and not used anywhere: nested selects, `or`,
 * `range`, `neq`, `is`, `rpc`, `contains`, joins. A new call site needing one
 * of those should be added here deliberately rather than silently returning
 * wrong rows.
 */

type Row = Record<string, unknown>

export interface PostgrestError {
  message: string
  code: string
  details: string | null
  hint: null
}

export type QueryResult<T> = { data: T; error: null } | { data: null; error: PostgrestError }

function ok<T>(data: T): QueryResult<T> {
  return { data, error: null }
}

function fail<T>(message: string, code: string): QueryResult<T> {
  return { data: null, error: { message, code, details: null, hint: null } }
}

/** Postgres column defaults, mirrored so inserts that omit columns still match. */
const TABLE_DEFAULTS: Record<string, () => Row> = {
  profiles: () => ({ full_name: '', created_at: nowIso(), updated_at: nowIso() }),
  settings: () => ({
    sleep_target_hours: 8,
    break_every_minutes: 60,
    break_minutes: 10,
    focus_start: '08:00',
    focus_end: '22:00',
    max_session_minutes: 90,
    wake_time: '07:00',
    bed_time: '23:00',
    energy_pref: false,
    notification_prefs: {
      deadlines: true,
      tasks: true,
      schedule_change: true,
      missed_task: true,
      habits: true,
    },
    theme: 'system',
    onboarded: false,
    onboarding_completed_at: null,
    assistant_prefs: structuredClone(DEFAULT_ASSISTANT_PREFS),
    updated_at: nowIso(),
  }),
  categories: () => ({ id: newId(), color: '#6366f1', created_at: nowIso() }),
  tasks: () => ({
    id: newId(),
    priority: 'medium',
    difficulty: 'medium',
    estimated_minutes: 60,
    remaining_minutes: 60,
    can_split: true,
    status: 'todo',
    locked: false,
    created_at: nowIso(),
    updated_at: nowIso(),
  }),
  task_sessions: () => ({
    id: newId(),
    duration_minutes: 30,
    completed: false,
    created_at: nowIso(),
  }),
  calendar_events: () => ({
    id: newId(),
    all_day: false,
    event_type: 'fixed',
    locked: true,
    color: '#6366f1',
    created_at: nowIso(),
  }),
  habits: () => ({
    id: newId(),
    frequency: 'daily',
    target_per_week: 0,
    estimated_minutes: 30,
    color: '#8b5cf6',
    active: true,
    created_at: nowIso(),
  }),
  habit_logs: () => ({ id: newId(), completed: true, created_at: nowIso() }),
  goals: () => ({ id: newId(), status: 'active', created_at: nowIso() }),
  daily_plans: () => ({ id: newId(), balance_score: 50, generated_at: nowIso() }),
  schedule_blocks: () => ({
    id: newId(),
    block_type: 'free',
    title: '',
    locked: false,
    completed: false,
    skipped: false,
    created_at: nowIso(),
  }),
  wellbeing_checkins: () => ({ id: newId(), created_at: nowIso() }),
  notifications: () => ({
    id: newId(),
    type: 'system',
    body: '',
    read: false,
    created_at: nowIso(),
  }),
  templates: () => ({
    id: newId(),
    emoji: 'âœ¨',
    category: 'life',
    tasks: [],
    author_name: '',
    is_public: false,
    created_at: nowIso(),
    updated_at: nowIso(),
  }),
}

/**
 * Columns that are nullable in Postgres. Inserted rows get an explicit `null`
 * rather than a missing key, so exported backups round-trip identically to the
 * server-backed version.
 */
const NULLABLE_COLUMNS: Record<string, string[]> = {
  tasks: [
    'category_id',
    'description',
    'deadline',
    'scheduled_start',
    'scheduled_end',
    'completed_at',
    'parent_task_id',
  ],
  calendar_events: ['description', 'location'],
  habits: ['description', 'preferred_time'],
  goals: ['description', 'target_date'],
  daily_plans: ['generated_at'],
  schedule_blocks: ['task_id', 'event_id', 'habit_id', 'note', 'color'],
  wellbeing_checkins: ['energy', 'stress', 'sleep_hours', 'note'],
  notifications: ['data', 'key', 'deadline_at'],
  settings: ['onboarding_completed_at'],
  templates: ['description'],
}

/** Tables carrying an `updated_at` maintained by a Postgres `moddatetime` trigger. */
const TOUCHED_TABLES = new Set(['profiles', 'settings', 'tasks', 'templates'])

function prepareInsert(table: string, input: Row): Row {
  const row: Row = { ...(TABLE_DEFAULTS[table]?.() ?? {}), ...input }
  for (const column of NULLABLE_COLUMNS[table] ?? []) {
    if (row[column] === undefined) row[column] = null
  }
  if (TOUCHED_TABLES.has(table)) row.updated_at = nowIso()
  return row
}

type FilterOp = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'ilike' | 'notnull'
type Filter = { column: string; op: FilterOp; value?: unknown }
type Order = { column: string; ascending: boolean }
type Terminal = 'array' | 'single' | 'maybeSingle'
type Mode = 'select' | 'insert' | 'update' | 'upsert' | 'delete'

function isNullish(value: unknown): boolean {
  return value === null || value === undefined
}

/** Translate a `*`-wildcard PostgREST pattern into a RegExp, honouring `%`. */
function likePattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')
  return new RegExp(`^${escaped}$`, 'i')
}

/**
 * Postgres compares NULL with an ordering operator as NULL, so the row is
 * excluded. Comparisons here are string comparisons on ISO-8601 UTC text, which
 * is order-preserving because `toISOString` is fixed width.
 */
function compare(left: unknown, right: unknown): number {
  const a = left as never
  const b = right as never
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function matchesFilter(row: Row, filter: Filter): boolean {
  const actual = row[filter.column]
  switch (filter.op) {
    case 'notnull':
      return !isNullish(actual)
    case 'eq':
      return actual === filter.value
    case 'in':
      return Array.isArray(filter.value) && (filter.value as unknown[]).includes(actual)
    case 'ilike':
      return typeof actual === 'string' && typeof filter.value === 'string'
        ? likePattern(filter.value).test(actual)
        : false
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (isNullish(actual) || isNullish(filter.value)) return false
      const c = compare(actual, filter.value)
      if (filter.op === 'gt') return c > 0
      if (filter.op === 'gte') return c >= 0
      if (filter.op === 'lt') return c < 0
      return c <= 0
    }
  }
}

function applyOrders(rows: Row[], orders: Order[]): Row[] {
  if (orders.length === 0) return rows
  return [...rows].sort((a, b) => {
    for (const { column, ascending } of orders) {
      const av = a[column]
      const bv = b[column]
      // Postgres default: NULLS LAST on ASC, NULLS FIRST on DESC.
      if (isNullish(av) && isNullish(bv)) continue
      if (isNullish(av)) return ascending ? 1 : -1
      if (isNullish(bv)) return ascending ? -1 : 1
      const c = compare(av, bv)
      if (c !== 0) return ascending ? c : -c
    }
    return 0
  })
}

function project(row: Row, columns: string | null): Row {
  if (!columns || columns.trim() === '*') return row
  const wanted = columns
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const out: Row = {}
  for (const column of wanted) {
    if (column in row) out[column] = row[column]
  }
  return out
}

class LocalQuery implements PromiseLike<QueryResult<Row[]>> {
  private table: string
  private mode: Mode = 'select'
  private payload: Row[] = []
  private selectColumns: string | null = null
  private selected = false
  private filters: Filter[] = []
  private orders: Order[] = []
  private limitCount: number | null = null
  private terminal: Terminal = 'array'

  constructor(table: string) {
    this.table = table
  }

  private get collection(): TableOfRows {
    const table = (localDb as unknown as Record<string, TableOfRows>)[this.table]
    if (!table) throw new Error(`Local data layer has no table "${this.table}".`)
    return table
  }

  select(columns = '*'): this {
    this.selectColumns = columns
    this.selected = true
    return this
  }

  insert(values: Row | Row[]): this {
    this.mode = 'insert'
    this.payload = Array.isArray(values) ? values : [values]
    return this
  }

  update(values: Row): this {
    this.mode = 'update'
    this.payload = [values]
    return this
  }

  upsert(values: Row | Row[], options?: { onConflict?: string }): this {
    this.mode = 'upsert'
    this.payload = Array.isArray(values) ? values : [values]
    if (options?.onConflict) {
      this.conflictColumns = options.onConflict.split(',').map((part) => part.trim())
    }
    return this
  }

  private conflictColumns: string[] | null = null

  delete(): this {
    this.mode = 'delete'
    return this
  }

  eq(column: string, value: unknown): this {
    return this.push({ column, op: 'eq', value })
  }

  gt(column: string, value: unknown): this {
    return this.push({ column, op: 'gt', value })
  }

  gte(column: string, value: unknown): this {
    return this.push({ column, op: 'gte', value })
  }

  lt(column: string, value: unknown): this {
    return this.push({ column, op: 'lt', value })
  }

  lte(column: string, value: unknown): this {
    return this.push({ column, op: 'lte', value })
  }

  in(column: string, values: readonly unknown[]): this {
    return this.push({ column, op: 'in', value: values })
  }

  ilike(column: string, pattern: string): this {
    return this.push({ column, op: 'ilike', value: pattern })
  }

  not(column: string, op: 'is', value: null): this {
    if (op === 'is' && isNullish(value)) {
      this.filters.push({ column, op: 'notnull' })
      return this
    }
    throw new Error(`Local data layer only supports not('${column}', 'is', null).`)
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending !== false })
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  single(): this {
    this.terminal = 'single'
    return this
  }

  maybeSingle(): this {
    this.terminal = 'maybeSingle'
    return this
  }

  private push(filter: Filter): this {
    this.filters.push(filter)
    return this
  }

  private rowPasses(row: Row): boolean {
    return this.filters.every((filter) => matchesFilter(row, filter))
  }

  private finish(rows: Row[]): QueryResult<Row[]> {
    if (this.terminal === 'array') return ok(rows)
    if (this.terminal === 'maybeSingle') {
      if (rows.length === 0) return ok(null as unknown as Row[])
      if (rows.length > 1) {
        return fail('JSON object requested, multiple rows returned', 'PGRST116')
      }
      return ok(rows[0] as unknown as Row[])
    }
    if (rows.length !== 1) {
      return fail('JSON object requested, multiple (or no) rows returned', 'PGRST116')
    }
    return ok(rows[0] as unknown as Row[])
  }

  private async run(): Promise<QueryResult<Row[]>> {
    await localDb.open()
    const table = this.collection

    switch (this.mode) {
      case 'insert': {
        const rows = this.payload.map((row) => prepareInsert(this.table, row))
        await table.bulkAdd(rows)
        return this.finish(this.selected ? rows : [])
      }
      case 'upsert': {
        const keys = this.conflictColumns ?? CONFLICT_KEYS[this.table] ?? []
        const written: Row[] = []
        for (const input of this.payload) {
          const row = prepareInsert(this.table, input)
          const existing = await lookupByConflictKey(table, keys, row)
          if (existing) {
            // The existing row's primary key must win. When the conflict key is
            // compound (`daily_plans`, `wellbeing_checkins`) it is not `id`, so
            // letting the incoming `id` through would `put` a second row instead
            // of updating the one that matched.
            const merged: Row = { ...existing, ...row, id: existing['id'] }
            if (TOUCHED_TABLES.has(this.table)) merged.updated_at = nowIso()
            await table.put(merged)
            written.push(merged)
          } else {
            await table.add(row)
            written.push(row)
          }
        }
        return this.finish(this.selected ? written : [])
      }
      case 'update': {
        const all = (await table.toArray()) as unknown as Row[]
        const targets = all.filter((row) => this.rowPasses(row))
        const written: Row[] = []
        for (const target of targets) {
          const merged: Row = { ...target, ...this.payload[0] }
          if (TOUCHED_TABLES.has(this.table)) merged.updated_at = nowIso()
          await table.put(merged)
          written.push(merged)
        }
        return this.finish(this.selected ? written : [])
      }
      case 'delete': {
        const all = (await table.toArray()) as unknown as Row[]
        const targets = all.filter((row) => this.rowPasses(row))
        await table.bulkDelete(targets.map((row) => row.id as string) as never[])
        return this.finish(this.selected ? targets : [])
      }
      case 'select': {
        let rows = ((await table.toArray()) as unknown as Row[]).filter((row) =>
          this.rowPasses(row),
        )
        rows = applyOrders(rows, this.orders)
        if (this.limitCount !== null) rows = rows.slice(0, this.limitCount)
        return this.finish(rows.map((row) => project(row, this.selectColumns)))
      }
    }
  }

  then<R1 = QueryResult<Row[]>, R2 = never>(
    onfulfilled?: ((value: QueryResult<Row[]>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    // PostgREST never rejects: it resolves to `{ data, error }`. Dexie does
    // reject on constraint violations, so failures are translated here.
    // Otherwise `const { error } = await supabase.from(..)` would throw instead
    // of returning an error, and the caller would surface an unhandled
    // rejection rather than a handled query failure.
    return this.run()
      .catch((reason: unknown): QueryResult<Row[]> => {
        return fail<Row[]>(describeDexieError(reason), describeDexieErrorCode(reason))
      })
      .then(onfulfilled, onrejected)
  }
}

/**
 * Dexie names its constraint error `Dexie.ConstraintError`, and `bulkAdd`
 * wraps per-row failures in a `BulkError` whose own name hides that. Both need
 * to resolve to Postgres' 23505 unique_violation.
 */
function isConstraintError(reason: unknown): boolean {
  if (!(reason instanceof Error)) return false
  if (reason.name.includes('ConstraintError')) return true
  const failures = (reason as { failures?: unknown }).failures
  return (
    Array.isArray(failures) &&
    failures.some(
      (failure) => failure instanceof Error && failure.name.includes('ConstraintError'),
    )
  )
}

function describeDexieError(reason: unknown): string {
  if (reason instanceof Error) {
    if (isConstraintError(reason)) {
      return 'duplicate key value violates unique constraint'
    }
    return reason.message
  }
  return String(reason)
}

function describeDexieErrorCode(reason: unknown): string {
  // 23505 is Postgres' unique_violation, which is what the callers expect.
  return isConstraintError(reason) ? '23505' : 'LOCAL_DB_ERROR'
}

type TableOfRows = {
  toArray(): Promise<unknown[]>
  bulkAdd(rows: unknown[]): Promise<unknown>
  add(row: unknown): Promise<unknown>
  put(row: unknown): Promise<unknown>
  get(key: unknown): Promise<unknown>
  where(index: string): { equals(value: unknown): { first(): Promise<unknown> } }
  bulkDelete(keys: unknown[]): Promise<unknown>
}

/**
 * Resolve the row an upsert should overwrite. Single-column conflict keys use
 * the primary key; compound ones (`[user_id+plan_date]`) must go through the
 * compound index, because a compound primary-key lookup is not valid for a
 * table whose primary key is `id`.
 */
async function lookupByConflictKey(
  table: TableOfRows,
  keys: string[],
  row: Row,
): Promise<Row | undefined> {
  if (keys.length === 0) return undefined
  const values = keys.map((column) => row[column])
  if (keys.length === 1) {
    return (await table.get(values[0])) as Row | undefined
  }
  return (await table.where(`[${keys.join('+')}]`).equals(values).first()) as
    | Row
    | undefined
}

/**
 * Build the planner-data client. Only `from()` is reachable, so a mistaken call
 * to something like `rpc` fails loudly instead of silently misbehaving.
 */
function createLocalDataClient(): SupabaseClient {
  const local = {
    from: (table: string) => new LocalQuery(table) as never,
  }
  return local as unknown as SupabaseClient
}

export const localData: SupabaseClient = createLocalDataClient()

export function isLocalTable(name: string): name is keyof typeof CONFLICT_KEYS {
  return name in CONFLICT_KEYS
}

export type { TemplateRecord }
