import Dexie, { type Table } from 'dexie'
import type {
  AppNotification,
  CalendarEvent,
  Category,
  DailyPlan,
  Goal,
  Habit,
  HabitLog,
  HealthConnection,
  HealthSample,
  Profile,
  ScheduleBlock,
  Settings,
  Task,
  TaskSession,
  WellbeingCheckin,
} from '@/types/models'

/**
 * LUMA's local-first data store.
 *
 * Every planner row lives in the browser's IndexedDB. Nothing here reaches the
 * network, so the app works offline by construction and a signed-in account
 * carries no planner data off the device.
 *
 * Supabase is still used for authentication only (see `src/auth`). Auth gives
 * us an identity; `user_id` on every table keeps two accounts that share a
 * device from ever reading each other's rows.
 */

export interface TemplateRecord {
  id: string
  user_id: string
  name: string
  emoji: string | null
  description: string | null
  category: string | null
  tasks: unknown
  author_name: string | null
  is_public: boolean
  created_at: string
  updated_at: string
}

/** Compound/natural keys that `upsert` must match on, mirroring Postgres. */
export const CONFLICT_KEYS: Record<string, string[]> = {
  profiles: ['id'],
  settings: ['user_id'],
  categories: ['id'],
  templates: ['id'],
  tasks: ['id'],
  calendar_events: ['id'],
  habits: ['id'],
  goals: ['id'],
  habit_logs: ['id'],
  daily_plans: ['user_id', 'plan_date'],
  task_sessions: ['id'],
  schedule_blocks: ['id'],
      wellbeing_checkins: ['user_id', 'checkin_date'],
  notifications: ['id'],
  health_connections: ['user_id', 'device_name'],
  health_samples: ['id'],
}

export class LumaDatabase extends Dexie {
  profiles!: Table<Profile, string>
  settings!: Table<Settings, string>
  categories!: Table<Category, string>
  templates!: Table<TemplateRecord, string>
  tasks!: Table<Task, string>
  calendar_events!: Table<CalendarEvent, string>
  habits!: Table<Habit, string>
  goals!: Table<Goal, string>
  habit_logs!: Table<HabitLog, string>
  daily_plans!: Table<DailyPlan, string>
  task_sessions!: Table<TaskSession, string>
  schedule_blocks!: Table<ScheduleBlock, string>
  wellbeing_checkins!: Table<WellbeingCheckin, string>
  notifications!: Table<AppNotification, string>
  health_connections!: Table<HealthConnection, string>
  health_samples!: Table<HealthSample, string>

  constructor() {
    // Deliberately NOT named "luma". `src/storage/indexeddb.ts` already owns
    // a database called "luma" opened at raw IndexedDB version 1, and Dexie
    // maps its `version(1)` to IndexedDB version 10. Sharing the name makes
    // whichever opens second fail with
    // "The requested version (1) is less than the existing version (10)".
    super('luma-planner')
    // Indexes are declared only where the query layer actually filters or
    // sorts, so the upgrade path stays trivial.
    this.version(1).stores({
      profiles: 'id',
      settings: 'user_id',
      categories: 'id, user_id, name',
      templates: 'id, user_id, is_public',
      tasks: 'id, user_id, status, deadline, category_id, scheduled_start, parent_task_id',
      calendar_events: 'id, user_id, start_at, event_type',
      habits: 'id, user_id, active',
      goals: 'id, user_id, status, target_date',
      habit_logs: 'id, user_id, habit_id, log_date, [user_id+log_date]',
      daily_plans: 'id, user_id, plan_date, [user_id+plan_date]',
      task_sessions: 'id, user_id, task_id, start_at',
      schedule_blocks: 'id, user_id, plan_date, start_at, block_type, task_id, habit_id',
      wellbeing_checkins: 'id, user_id, checkin_date, [user_id+checkin_date]',
      notifications: 'id, user_id, read, key, created_at',
    })
    // Wearable data arrived after v1 shipped. A strap records continuously, so
    // `recorded_at` is indexed for the windowed reads the health page makes, and
    // `metric` keeps the per-metric aggregates cheap. The compound index matches
    // the unique constraint in the migration, so reconnecting a known strap
    // updates its row instead of adding a second one.
    this.version(2).stores({
      health_connections:
        'id, user_id, device_name, status, last_sample_at, [user_id+device_name]',
      health_samples: 'id, user_id, metric, recorded_at, session_id, [user_id+recorded_at]',
    })
  }
}

export const localDb = new LumaDatabase()

/**
 * The database is the render-blocking dependency for the whole planner, so a
 * corrupt or blocked IndexedDB (private windows, disabled storage) must fail
 * loudly and immediately rather than surface later as confusing empty lists.
 */
export async function ensureLocalDb(): Promise<LumaDatabase> {
  if (!localDb.isOpen()) {
    await localDb.open()
  }
  return localDb
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function newId(): string {
  const cryptoRef = globalThis.crypto
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID()
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Wipe every planner table. Used by sign-out hygiene and "reset local data". */
export async function clearLocalData(): Promise<void> {
  await localDb.transaction(
    'rw',
    [
      localDb.profiles,
      localDb.settings,
      localDb.categories,
      localDb.templates,
      localDb.tasks,
      localDb.calendar_events,
      localDb.habits,
      localDb.goals,
      localDb.habit_logs,
      localDb.daily_plans,
      localDb.task_sessions,
      localDb.schedule_blocks,
      localDb.wellbeing_checkins,
      localDb.notifications,
      localDb.health_connections,
      localDb.health_samples,
    ],
    async () => {
      // Sequential rather than Promise.all: Dexie transactions are safer when
      // each table write is awaited in turn.
      for (const table of localDb.tables) {
        await table.clear()
      }
    },
  )
}
