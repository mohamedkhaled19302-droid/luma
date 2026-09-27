import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createTask,
  updateTask,
  deleteTask,
  markTaskDone,
  markTaskMissed,
  markTaskOpen,
} from '@/services/task-service'
import {
  createEvent,
  updateEvent,
  deleteEvent,
} from '@/services/event-service'
import {
  createHabit,
  updateHabit,
  deleteHabit,
  setHabitLog,
} from '@/services/habit-service'
import { createBlock, updateBlock, deleteBlock } from '@/services/block-service'
import {
  setBlockCompleted,
  setBlockSkipped,
  setBlockLocked,
  moveBlock,
} from '@/services/block-mutations'
import { upsertCheckin } from '@/services/wellbeing-service'
import { createGoal, updateGoal, deleteGoal } from '@/services/goal-service'
import { upsertProfile } from '@/services/profile-service'
import { updateSettings } from '@/services/settings-service'
import { createCategory, updateCategory, deleteCategory } from '@/services/category-service'
import { markNotificationRead, markAllNotificationsRead } from '@/services/notification-service'
import {
  upsertTemplate,
  removeTemplate,
  updateTemplateVisibility,
  type TemplateInsert,
} from '@/services/template-service'
import { enqueue, isOnlineNow, type SyncOpKind } from '@/lib/sync-queue'
import { isOfflineError } from '@/lib/utils'
import type { EventType, Task } from '@/types/models'

function invalidateMany(queryClient: ReturnType<typeof useQueryClient>, keys: string[][]) {
  for (const key of keys) void queryClient.invalidateQueries({ queryKey: key })
}

interface QueueSpec<TVariables> {
  table: string
  ops: SyncOpKind
  payload?: (variables: TVariables) => Record<string, unknown>
  maxAttempts?: number
}

interface MutationOptions<TVariables> {
  userId: string
  networkFn: (variables: TVariables) => Promise<unknown>
  invalidate: string[][]
  onSuccess?: (data: unknown, variables: TVariables) => void
  queue?: QueueSpec<TVariables>
}

function defaultQueuePayload<TVariables>(
  ops: SyncOpKind,
  userId: string,
  variables: TVariables,
): Record<string, unknown> {
  const base = { ...(variables as Record<string, unknown>) }
  if (ops === 'insert' || ops === 'upsert') return { user_id: userId, ...base }
  return base
}

function enqueueOffline<TVariables>(options: MutationOptions<TVariables>, variables: TVariables): void {
  const spec = options.queue
  if (!spec) return
  enqueue({
    userId: options.userId,
    kind: `${spec.table}.${spec.ops}`,
    table: spec.table,
    ops: spec.ops,
    payload: spec.payload ? spec.payload(variables) : defaultQueuePayload(spec.ops, options.userId, variables),
    maxAttempts: spec.maxAttempts,
  })
}

function useOfflineMutation<TVariables>(options: MutationOptions<TVariables>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (variables: TVariables): Promise<unknown> => {
      if (options.queue && !isOnlineNow()) {
        enqueueOffline(options, variables)
        return variables
      }
      try {
        return await options.networkFn(variables)
      } catch (error) {
        if (options.queue && (isOfflineError(error) || !isOnlineNow())) {
          enqueueOffline(options, variables)
          return variables
        }
        throw error
      }
    },
    onSuccess: (data, variables) => {
      invalidateMany(queryClient, options.invalidate)
      if (options.onSuccess) options.onSuccess(data, variables)
    },
  })
}

export function useTaskMutations(userId: string) {
  const base = {
    userId,
    invalidate: [
      ['tasks'],
      ['blocks'],
      ['dashboard-summary'],
      ['pressure'],
      ['sessions'],
    ],
  }

  const create = useOfflineMutation<{ title: string; category_id?: string | null; priority?: string; difficulty?: string; estimated_minutes: number; remaining_minutes?: number; deadline?: string | null; can_split?: boolean; description?: string | null }>({
    ...base,
    networkFn: (vars) => createTask(userId, {
      title: vars.title,
      category_id: vars.category_id ?? null,
      priority: (vars.priority ?? 'medium') as Task['priority'],
      difficulty: (vars.difficulty ?? 'medium') as Task['difficulty'],
      estimated_minutes: vars.estimated_minutes,
      remaining_minutes: vars.remaining_minutes ?? vars.estimated_minutes,
      deadline: vars.deadline ?? null,
      can_split: vars.can_split ?? true,
      description: vars.description ?? null,
      locked: true,
    }),
    queue: {
      table: 'tasks',
      ops: 'insert',
      payload: (vars) => ({
        user_id: userId,
        title: vars.title,
        category_id: vars.category_id ?? null,
        priority: vars.priority ?? 'medium',
        difficulty: vars.difficulty ?? 'medium',
        estimated_minutes: vars.estimated_minutes,
        remaining_minutes: vars.remaining_minutes ?? vars.estimated_minutes,
        deadline: vars.deadline ?? null,
        can_split: vars.can_split ?? true,
        description: vars.description ?? null,
        locked: true,
      }),
    },
  })

  const update = useOfflineMutation<{ id: string; fields: Record<string, unknown> }>({
    ...base,
    networkFn: (vars) => updateTask(vars.id, vars.fields as Parameters<typeof updateTask>[1]),
    queue: { table: 'tasks', ops: 'update' },
  })

  const remove = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => deleteTask(vars.id),
    queue: { table: 'tasks', ops: 'delete' },
  })

  const complete = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => markTaskDone(vars.id),
    queue: {
      table: 'tasks',
      ops: 'update',
      payload: (vars) => ({
        id: vars.id,
        fields: {
          status: 'done',
          remaining_minutes: 0,
          completed_at: new Date().toISOString(),
          scheduled_start: null,
          scheduled_end: null,
        },
      }),
    },
  })

  const completeWithRemaining = useOfflineMutation<{ id: string; remainingMinutes: number }>({
    ...base,
    networkFn: (vars) => markTaskDone(vars.id, vars.remainingMinutes),
    queue: {
      table: 'tasks',
      ops: 'update',
      payload: (vars) => ({
        id: vars.id,
        fields: {
          status: 'done',
          remaining_minutes: vars.remainingMinutes,
          completed_at: new Date().toISOString(),
          scheduled_start: null,
          scheduled_end: null,
        },
      }),
    },
  })

  const miss = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => markTaskMissed(vars.id),
    queue: {
      table: 'tasks',
      ops: 'update',
      payload: (vars) => ({ id: vars.id, fields: { status: 'missed' } }),
    },
  })

  const reopen = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => markTaskOpen(vars.id),
    queue: {
      table: 'tasks',
      ops: 'update',
      payload: (vars) => ({ id: vars.id, fields: { status: 'todo', completed_at: null } }),
    },
  })

  return { create, update, remove, complete, completeWithRemaining, miss, reopen }
}

export function useEventMutations(userId: string) {
  const base = { userId, invalidate: [['events'], ['blocks'], ['dashboard-summary']] }

  const create = useOfflineMutation<{
    title: string
    start_at: string
    end_at: string
    event_type?: string
    all_day?: boolean
    location?: string | null
    description?: string | null
    color?: string
  }>({
    ...base,
    networkFn: (vars) =>
      createEvent(userId, {
        title: vars.title,
        start_at: vars.start_at,
        end_at: vars.end_at,
        event_type: (vars.event_type ?? 'fixed') as EventType,
        all_day: vars.all_day ?? false,
        location: vars.location ?? null,
        description: vars.description ?? null,
        color: vars.color ?? '#6366f1',
        locked: true,
      }),
    queue: {
      table: 'calendar_events',
      ops: 'insert',
      payload: (vars) => ({
        user_id: userId,
        title: vars.title,
        start_at: vars.start_at,
        end_at: vars.end_at,
        event_type: vars.event_type ?? 'fixed',
        all_day: vars.all_day ?? false,
        location: vars.location ?? null,
        description: vars.description ?? null,
        color: vars.color ?? '#6366f1',
        locked: true,
      }),
    },
  })

  const update = useOfflineMutation<{ id: string; fields: Record<string, unknown> }>({
    ...base,
    networkFn: (vars) => updateEvent(vars.id, vars.fields as Parameters<typeof updateEvent>[1]),
    queue: { table: 'calendar_events', ops: 'update' },
  })

  const remove = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => deleteEvent(vars.id),
    queue: { table: 'calendar_events', ops: 'delete' },
  })

  return { create, update, remove }
}

export function useHabitMutations(userId: string) {
  const base = { userId, invalidate: [['habits'], ['habit-logs'], ['blocks'], ['dashboard-summary']] }

  const create = useOfflineMutation<{
    name: string
    description?: string | null
    frequency?: 'daily' | 'weekly'
    target_per_week?: number
    preferred_time?: string | null
    color?: string
    estimated_minutes?: number
  }>({
    ...base,
    networkFn: (vars) =>
      createHabit(userId, {
        name: vars.name,
        description: vars.description ?? null,
        frequency: vars.frequency ?? 'daily',
        target_per_week: vars.target_per_week ?? 0,
        preferred_time: vars.preferred_time ?? null,
        color: vars.color ?? '#8b5cf6',
        estimated_minutes: vars.estimated_minutes ?? 30,
      }),
    queue: {
      table: 'habits',
      ops: 'insert',
      payload: (vars) => ({
        user_id: userId,
        name: vars.name,
        description: vars.description ?? null,
        frequency: vars.frequency ?? 'daily',
        target_per_week: vars.target_per_week ?? 0,
        preferred_time: vars.preferred_time ?? null,
        color: vars.color ?? '#8b5cf6',
        estimated_minutes: vars.estimated_minutes ?? 30,
      }),
    },
  })

  const update = useOfflineMutation<{ id: string; fields: Record<string, unknown> }>({
    ...base,
    networkFn: (vars) => updateHabit(vars.id, vars.fields as Parameters<typeof updateHabit>[1]),
    queue: { table: 'habits', ops: 'update' },
  })

  const remove = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => deleteHabit(vars.id),
    queue: { table: 'habits', ops: 'delete' },
  })

  const log = useOfflineMutation<{
    habit_id: string
    log_date: string
    completed: boolean
  }>({
    ...base,
    networkFn: (vars) =>
      setHabitLog({ user_id: userId, habit_id: vars.habit_id, log_date: vars.log_date, completed: vars.completed }),
    queue: { table: 'habit_logs', ops: 'upsert' },
  })

  return { create, update, remove, log }
}

export function useBlockMutations(userId: string) {
  const base = { userId, invalidate: [['blocks'], ['daily-plan'], ['dashboard-summary']] }

  const create = useOfflineMutation<Record<string, unknown>>({
    ...base,
    networkFn: (vars) => createBlock(userId, vars as Parameters<typeof createBlock>[1]),
    queue: { table: 'schedule_blocks', ops: 'insert' },
  })

  const update = useOfflineMutation<{ id: string; fields: Record<string, unknown> }>({
    ...base,
    networkFn: (vars) => updateBlock(vars.id, vars.fields as Parameters<typeof updateBlock>[1]),
    queue: { table: 'schedule_blocks', ops: 'update' },
  })

  const remove = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => deleteBlock(vars.id),
    queue: { table: 'schedule_blocks', ops: 'delete' },
  })

  const complete = useOfflineMutation<{ id: string; completed: boolean }>({
    ...base,
    networkFn: (vars) => setBlockCompleted(vars.id, vars.completed),
    queue: {
      table: 'schedule_blocks',
      ops: 'update',
      payload: (vars) => ({ id: vars.id, fields: { completed: vars.completed } }),
    },
  })

  const skip = useOfflineMutation<{ id: string; skipped: boolean }>({
    ...base,
    networkFn: (vars) => setBlockSkipped(vars.id, vars.skipped),
    queue: {
      table: 'schedule_blocks',
      ops: 'update',
      payload: (vars) => ({ id: vars.id, fields: { skipped: vars.skipped } }),
    },
  })

  const lock = useOfflineMutation<{ id: string; locked: boolean }>({
    ...base,
    networkFn: (vars) => setBlockLocked(vars.id, vars.locked),
    queue: {
      table: 'schedule_blocks',
      ops: 'update',
      payload: (vars) => ({ id: vars.id, fields: { locked: vars.locked } }),
    },
  })

  const move = useOfflineMutation<{ id: string; startAt: string; endAt: string }>({
    ...base,
    networkFn: (vars) => moveBlock(vars.id, vars.startAt, vars.endAt),
    queue: {
      table: 'schedule_blocks',
      ops: 'update',
      payload: (vars) => ({
        id: vars.id,
        fields: {
          start_at: vars.startAt,
          end_at: vars.endAt,
          plan_date: vars.startAt.slice(0, 10),
        },
      }),
    },
  })

  return { create, update, remove, complete, skip, lock, move }
}

export function useWellbeingMutations(userId: string) {
  const base = { userId, invalidate: [['wellbeing'], ['dashboard-summary']] }
  return useOfflineMutation<{
    checkin_date: string
    energy: number | null
    stress: number | null
    sleep_hours: number | null
    note: string | null
  }>({
    ...base,
    networkFn: (vars) => upsertCheckin(userId, vars),
    queue: { table: 'wellbeing_checkins', ops: 'upsert' },
  })
}

export function useGoalMutations(userId: string) {
  const base = { userId, invalidate: [['goals']] }

  const create = useOfflineMutation<{ title: string; description?: string | null; target_date?: string | null }>({
    ...base,
    networkFn: (vars) => createGoal(userId, vars),
    queue: {
      table: 'goals',
      ops: 'insert',
      payload: (vars) => ({
        user_id: userId,
        status: 'active',
        title: vars.title,
        description: vars.description ?? null,
        target_date: vars.target_date ?? null,
      }),
    },
  })
  const update = useOfflineMutation<{ id: string; fields: Record<string, unknown> }>({
    ...base,
    networkFn: (vars) => updateGoal(vars.id, vars.fields as Parameters<typeof updateGoal>[1]),
    queue: { table: 'goals', ops: 'update' },
  })
  const remove = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => deleteGoal(vars.id),
    queue: { table: 'goals', ops: 'delete' },
  })
  return { create, update, remove }
}

export function useProfileMutations(userId: string) {
  const base = { userId, invalidate: [['profile']] }
  return useOfflineMutation<{ full_name: string }>({
    ...base,
    networkFn: (vars) => upsertProfile(userId, vars),
    queue: {
      table: 'profiles',
      ops: 'upsert',
      payload: (vars) => ({ id: userId, full_name: vars.full_name }),
    },
  })
}

export function useCategoryMutations(userId: string) {
  const base = { userId, invalidate: [['categories'], ['tasks']] }

  const create = useOfflineMutation<{ name: string; color: string }>({
    ...base,
    networkFn: (vars) => createCategory(userId, vars.name, vars.color),
    queue: { table: 'categories', ops: 'insert' },
  })

  const update = useOfflineMutation<{ id: string; name: string; color: string }>({
    ...base,
    networkFn: (vars) => updateCategory(vars.id, { name: vars.name, color: vars.color }),
    queue: {
      table: 'categories',
      ops: 'update',
      payload: (vars) => ({ id: vars.id, fields: { name: vars.name, color: vars.color } }),
    },
  })

  const remove = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => deleteCategory(vars.id),
    queue: { table: 'categories', ops: 'delete' },
  })

  return { create, update, remove }
}

export function useSettingsUpdate(userId: string) {
  const base = { userId, invalidate: [['settings'], ['tasks'], ['blocks'], ['pressure']] }
  return useOfflineMutation<Record<string, unknown>>({
    ...base,
    networkFn: (vars) => updateSettings(userId, vars as Parameters<typeof updateSettings>[1]),
    queue: { table: 'settings', ops: 'upsert' },
  })
}

export function useNotificationMutations(userId: string) {
  const base = { userId, invalidate: [['notifications']] }
  const markRead = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => markNotificationRead(vars.id),
    queue: {
      table: 'notifications',
      ops: 'update',
      payload: (vars) => ({ id: vars.id, fields: { read: true } }),
    },
  })
  const markAllRead = useOfflineMutation<Record<string, never>>({
    ...base,
    networkFn: () => markAllNotificationsRead(userId),
    queue: {
      table: 'notifications',
      ops: 'update',
      payload: () => ({ user_id: userId, fields: { read: true } }),
    },
  })
  return { markRead, markAllRead }
}

export function useTemplateMutations(userId: string) {
  const base = {
    userId,
    invalidate: [['templates', 'shared'], ['templates']],
  }

  const create = useOfflineMutation<{ fields: TemplateInsert }>({
    ...base,
    networkFn: (vars) => upsertTemplate(userId, null, vars.fields),
    queue: {
      table: 'templates',
      ops: 'insert',
      payload: (vars) => ({ user_id: userId, ...vars.fields }),
    },
  })

  const update = useOfflineMutation<{ id: string; fields: TemplateInsert }>({
    ...base,
    networkFn: (vars) => upsertTemplate(userId, vars.id, vars.fields),
    queue: {
      table: 'templates',
      ops: 'update',
      payload: (vars) => ({ id: vars.id, user_id: userId, fields: vars.fields }),
    },
  })

  const setVisibility = useOfflineMutation<{ id: string; isPublic: boolean }>({
    ...base,
    networkFn: (vars) => updateTemplateVisibility(vars.id, vars.isPublic),
    queue: {
      table: 'templates',
      ops: 'update',
      payload: (vars) => ({ id: vars.id, fields: { is_public: vars.isPublic } }),
    },
  })

  const remove = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => removeTemplate(vars.id),
    queue: { table: 'templates', ops: 'delete' },
  })

  return { create, update, setVisibility, remove }
}