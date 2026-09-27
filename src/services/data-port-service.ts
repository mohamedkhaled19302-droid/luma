import type { SupabaseClient } from '@supabase/supabase-js'
import { formatError } from '@/lib/utils'
import type { TemplateRow } from '@/services/template-service'
import type {
  AppNotification,
  CalendarEvent,
  Category,
  DailyPlan,
  Goal,
  Habit,
  HabitLog,
  Profile,
  ScheduleBlock,
  Settings,
  Task,
  TaskSession,
  WellbeingCheckin,
} from '@/types/models'

export const BUNDLE_VERSION = 2

export interface BundleData {
  profiles: Profile[]
  categories: Category[]
  tasks: Task[]
  calendar_events: CalendarEvent[]
  habits: Habit[]
  habit_logs: HabitLog[]
  goals: Goal[]
  daily_plans: DailyPlan[]
  schedule_blocks: ScheduleBlock[]
  wellbeing_checkins: WellbeingCheckin[]
  notifications: AppNotification[]
  settings: Settings[]
  task_sessions: TaskSession[]
  templates: TemplateRow[]
}

export interface ExportBundle {
  version: number
  exported_at: string
  user_id: string
  data: BundleData
}

export interface ImportResult {
  restored: number
  inserted: number
  updated: number
  errors: string[]
}

export class BundleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BundleValidationError'
  }
}

type Row = Record<string, unknown>

interface TableDef {
  dataKey: keyof BundleData
  table: string
  columns: string
  userColumn: string
  keyColumns: string[]
  onConflict: string
}

const TABLE_DEFS: TableDef[] = [
  {
    dataKey: 'profiles',
    table: 'profiles',
    columns: 'id, full_name, created_at, updated_at',
    userColumn: 'id',
    keyColumns: ['id'],
    onConflict: 'id',
  },
  {
    dataKey: 'settings',
    table: 'settings',
    columns:
      'user_id, sleep_target_hours, break_every_minutes, break_minutes, focus_start, focus_end, max_session_minutes, wake_time, bed_time, energy_pref, notification_prefs, theme, onboarded, onboarding_completed_at, updated_at',
    userColumn: 'user_id',
    keyColumns: ['user_id'],
    onConflict: 'user_id',
  },
  {
    dataKey: 'categories',
    table: 'categories',
    columns: 'id, user_id, name, color, created_at',
    userColumn: 'user_id',
    keyColumns: ['id'],
    onConflict: 'id',
  },
  {
    dataKey: 'templates',
    table: 'templates',
    columns: 'id, user_id, name, emoji, description, category, tasks, author_name, is_public, created_at, updated_at',
    userColumn: 'user_id',
    keyColumns: ['id'],
    onConflict: 'id',
  },
  {
    dataKey: 'tasks',
    table: 'tasks',
    columns:
      'id, user_id, category_id, title, description, priority, difficulty, estimated_minutes, remaining_minutes, deadline, can_split, status, locked, scheduled_start, scheduled_end, completed_at, parent_task_id, created_at, updated_at',
    userColumn: 'user_id',
    keyColumns: ['id'],
    onConflict: 'id',
  },
  {
    dataKey: 'calendar_events',
    table: 'calendar_events',
    columns:
      'id, user_id, title, description, start_at, end_at, all_day, event_type, locked, location, color, created_at',
    userColumn: 'user_id',
    keyColumns: ['id'],
    onConflict: 'id',
  },
  {
    dataKey: 'habits',
    table: 'habits',
    columns:
      'id, user_id, name, description, frequency, target_per_week, preferred_time, estimated_minutes, color, active, created_at',
    userColumn: 'user_id',
    keyColumns: ['id'],
    onConflict: 'id',
  },
  {
    dataKey: 'goals',
    table: 'goals',
    columns: 'id, user_id, title, description, target_date, status, created_at',
    userColumn: 'user_id',
    keyColumns: ['id'],
    onConflict: 'id',
  },
  {
    dataKey: 'habit_logs',
    table: 'habit_logs',
    columns: 'id, user_id, habit_id, log_date, completed, created_at',
    userColumn: 'user_id',
    keyColumns: ['id'],
    onConflict: 'id',
  },
  {
    dataKey: 'daily_plans',
    table: 'daily_plans',
    columns: 'id, user_id, plan_date, balance_score, generated_at',
    userColumn: 'user_id',
    keyColumns: ['user_id', 'plan_date'],
    onConflict: 'user_id,plan_date',
  },
  {
    dataKey: 'task_sessions',
    table: 'task_sessions',
    columns: 'id, task_id, user_id, start_at, end_at, duration_minutes, completed, created_at',
    userColumn: 'user_id',
    keyColumns: ['id'],
    onConflict: 'id',
  },
  {
    dataKey: 'schedule_blocks',
    table: 'schedule_blocks',
    columns:
      'id, user_id, plan_date, block_type, title, task_id, event_id, habit_id, start_at, end_at, locked, completed, skipped, note, color, created_at',
    userColumn: 'user_id',
    keyColumns: ['id'],
    onConflict: 'id',
  },
  {
    dataKey: 'wellbeing_checkins',
    table: 'wellbeing_checkins',
    columns: 'id, user_id, checkin_date, energy, stress, sleep_hours, note, created_at',
    userColumn: 'user_id',
    keyColumns: ['user_id', 'checkin_date'],
    onConflict: 'user_id,checkin_date',
  },
  {
    dataKey: 'notifications',
    table: 'notifications',
    columns: 'id, user_id, type, title, body, data, read, key, deadline_at, created_at',
    userColumn: 'user_id',
    keyColumns: ['id'],
    onConflict: 'id',
  },
]

function rowKeyFor(row: Row, keyColumns: string[]): string {
  return keyColumns.map((column) => String(row[column] ?? '')).join('|')
}

function rowsForUser(bundle: ExportBundle, def: TableDef): Row[] {
  const rows = bundle.data[def.dataKey] as unknown as Row[] | undefined
  if (!Array.isArray(rows)) return []
  return rows.filter((row) => String(row[def.userColumn] ?? '') === bundle.user_id)
}

async function loadExistingKeys(
  client: SupabaseClient,
  def: TableDef,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await client
    .from(def.table)
    .select(def.keyColumns.join(', '))
    .eq(def.userColumn, userId)
  if (error) throw error
  const keys = new Set<string>()
  for (const row of (data ?? []) as unknown as Row[]) {
    keys.add(rowKeyFor(row, def.keyColumns))
  }
  return keys
}

export function validateBundle(value: unknown): asserts value is ExportBundle {
  if (!value || typeof value !== 'object') {
    throw new BundleValidationError('Invalid backup file: expected an object.')
  }
  const candidate = value as Record<string, unknown>
  if (candidate.version !== BUNDLE_VERSION) {
    throw new BundleValidationError(
      `Unsupported backup version "${String(candidate.version)}". Expected version ${BUNDLE_VERSION}.`,
    )
  }
  if (typeof candidate.user_id !== 'string' || candidate.user_id.length === 0) {
    throw new BundleValidationError('Invalid backup file: missing user_id.')
  }
  if (typeof candidate.exported_at !== 'string' || candidate.exported_at.length === 0) {
    throw new BundleValidationError('Invalid backup file: missing exported_at.')
  }
  const data = candidate.data
  if (!data || typeof data !== 'object') {
    throw new BundleValidationError('Invalid backup file: missing data.')
  }
  const dataRecord = data as Record<string, unknown>
  for (const def of TABLE_DEFS) {
    if (!Array.isArray(dataRecord[def.dataKey])) {
      throw new BundleValidationError(
        `Invalid backup file: unexpected data shape for "${def.dataKey}".`,
      )
    }
  }
}

export function parseBundle(text: string): ExportBundle {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new BundleValidationError('Invalid backup file: not valid JSON.')
  }
  validateBundle(value)
  return value
}

export async function exportAllData(client: SupabaseClient): Promise<ExportBundle> {
  const { data: sessionData, error: sessionError } = await client.auth.getUser()
  if (sessionError) throw sessionError
  const userId = sessionData?.user?.id
  if (!userId) throw new Error('You must be signed in to export your data.')

  const data = {} as Record<keyof BundleData, Row[]>
  for (const def of TABLE_DEFS) {
    const { data: rows, error } = await client
      .from(def.table)
      .select(def.columns)
      .eq(def.userColumn, userId)
    if (error) throw error
    data[def.dataKey] = (rows ?? []) as unknown as Row[]
  }

  return {
    version: BUNDLE_VERSION,
    exported_at: new Date().toISOString(),
    user_id: userId,
    data: data as unknown as BundleData,
  }
}

export function backupFilename(date = new Date()): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `luma-backup-${yyyy}-${mm}-${dd}.json`
}

export function downloadJson(bundle: ExportBundle, filename?: string): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename ?? backupFilename()
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * Restore a backup. Rows that already exist are upserted rather than skipped,
 * so a restore genuinely repairs drifted or partially-cleared data instead of
 * silently doing nothing.
 */
export async function importBundle(
  client: SupabaseClient,
  bundle: ExportBundle,
): Promise<ImportResult> {
  validateBundle(bundle)
  let inserted = 0
  let updated = 0
  const errors: string[] = []

  for (const def of TABLE_DEFS) {
    const rows = rowsForUser(bundle, def)
    if (rows.length === 0) continue
    try {
      const existing = await loadExistingKeys(client, def, bundle.user_id)
      // Later rows win, so a bundle that repeats a key collapses to one write.
      const deduped = new Map<string, Row>()
      for (const row of rows) {
        deduped.set(rowKeyFor(row, def.keyColumns), row)
      }
      for (const key of deduped.keys()) {
        if (existing.has(key)) updated += 1
        else inserted += 1
      }
      const payload = [...deduped.values()]
      if (payload.length > 0) {
        const { error } = await client.from(def.table).upsert(payload, { onConflict: def.onConflict })
        if (error) throw error
      }
    } catch (error) {
      errors.push(`${def.table}: ${formatError(error)}`)
    }
  }

  return { restored: inserted + updated, inserted, updated, errors }
}
