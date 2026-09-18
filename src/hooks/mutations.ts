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
import { markNotificationRead, markAllNotificationsRead } from '@/services/notification-service'
import { maybeCatchOffline } from '@/services/offline-service'
import type { Task } from '@/types/models'

function invalidateMany(queryClient: ReturnType<typeof useQueryClient>, keys: string[][]) {
  for (const key of keys) void queryClient.invalidateQueries({ queryKey: key })
}

interface MutationOptions<TVariables> {
  userId: string
  networkFn: (variables: TVariables) => Promise<unknown>
  enqueue?: (variables: TVariables) => Promise<void>
  invalidate: string[][]
  onSuccess?: (data: unknown, variables: TVariables) => void
}

function useOfflineMutation<TVariables>(options: MutationOptions<TVariables>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (variables: TVariables): Promise<unknown> => {
      try {
        return await options.networkFn(variables)
      } catch (error) {
        const handled = options.enqueue
          ? await maybeCatchOffline(error, () => options.enqueue!(variables))
          : false
        if (handled) return variables
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

  const create = useOfflineMutation<{ title: string; subject_id?: string | null; priority?: string; difficulty?: string; estimated_minutes: number; remaining_minutes?: number; deadline?: string | null; can_split?: boolean; description?: string | null }>({
    ...base,
    networkFn: (vars) => createTask(userId, {
      title: vars.title,
      subject_id: vars.subject_id ?? null,
      priority: (vars.priority ?? 'medium') as Task['priority'],
      difficulty: (vars.difficulty ?? 'medium') as Task['difficulty'],
      estimated_minutes: vars.estimated_minutes,
      remaining_minutes: vars.remaining_minutes ?? vars.estimated_minutes,
      deadline: vars.deadline ?? null,
      can_split: vars.can_split ?? true,
      description: vars.description ?? null,
      locked: true,
    }),
  })

  const update = useOfflineMutation<{ id: string; fields: Record<string, unknown> }>({
    ...base,
    networkFn: (vars) => updateTask(vars.id, vars.fields as Parameters<typeof updateTask>[1]),
  })

  const remove = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => deleteTask(vars.id),
    enqueue: async (vars) => {
      const { enqueueDelete } = await import('@/services/offline-service')
      await enqueueDelete('task', vars.id)
    },
  })

  const complete = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => markTaskDone(vars.id),
  })

  const completeWithRemaining = useOfflineMutation<{ id: string; remainingMinutes: number }>({
    ...base,
    networkFn: (vars) => markTaskDone(vars.id, vars.remainingMinutes),
  })

  const miss = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => markTaskMissed(vars.id),
  })

  const reopen = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => markTaskOpen(vars.id),
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
        event_type: (vars.event_type ?? 'commitment') as 'commitment',
        all_day: vars.all_day ?? false,
        location: vars.location ?? null,
        description: vars.description ?? null,
        color: vars.color ?? '#6366f1',
        locked: true,
      }),
  })

  const update = useOfflineMutation<{ id: string; fields: Record<string, unknown> }>({
    ...base,
    networkFn: (vars) => updateEvent(vars.id, vars.fields as Parameters<typeof updateEvent>[1]),
  })

  const remove = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => deleteEvent(vars.id),
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
  })

  const update = useOfflineMutation<{ id: string; fields: Record<string, unknown> }>({
    ...base,
    networkFn: (vars) => updateHabit(vars.id, vars.fields as Parameters<typeof updateHabit>[1]),
  })

  const remove = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => deleteHabit(vars.id),
  })

  const log = useOfflineMutation<{
    habit_id: string
    log_date: string
    completed: boolean
  }>({
    ...base,
    networkFn: (vars) =>
      setHabitLog({ user_id: userId, habit_id: vars.habit_id, log_date: vars.log_date, completed: vars.completed }),
  })

  return { create, update, remove, log }
}

export function useBlockMutations(userId: string) {
  const base = { userId, invalidate: [['blocks'], ['daily-plan'], ['dashboard-summary']] }

  const create = useOfflineMutation<Record<string, unknown>>({
    ...base,
    networkFn: (vars) => createBlock(userId, vars as Parameters<typeof createBlock>[1]),
  })

  const update = useOfflineMutation<{ id: string; fields: Record<string, unknown> }>({
    ...base,
    networkFn: (vars) => updateBlock(vars.id, vars.fields as Parameters<typeof updateBlock>[1]),
  })

  const remove = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => deleteBlock(vars.id),
  })

  const complete = useOfflineMutation<{ id: string; completed: boolean }>({
    ...base,
    networkFn: (vars) => setBlockCompleted(vars.id, vars.completed),
  })

  const skip = useOfflineMutation<{ id: string; skipped: boolean }>({
    ...base,
    networkFn: (vars) => setBlockSkipped(vars.id, vars.skipped),
  })

  const lock = useOfflineMutation<{ id: string; locked: boolean }>({
    ...base,
    networkFn: (vars) => setBlockLocked(vars.id, vars.locked),
  })

  const move = useOfflineMutation<{ id: string; startAt: string; endAt: string }>({
    ...base,
    networkFn: (vars) => moveBlock(vars.id, vars.startAt, vars.endAt),
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
  })
}

export function useGoalMutations(userId: string) {
  const base = { userId, invalidate: [['goals']] }

  const create = useOfflineMutation<{ title: string; description?: string | null; target_date?: string | null }>({
    ...base,
    networkFn: (vars) => createGoal(userId, vars),
  })
  const update = useOfflineMutation<{ id: string; fields: Record<string, unknown> }>({
    ...base,
    networkFn: (vars) => updateGoal(vars.id, vars.fields as Parameters<typeof updateGoal>[1]),
  })
  const remove = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => deleteGoal(vars.id),
  })
  return { create, update, remove }
}

export function useProfileMutations(userId: string) {
  const base = { userId, invalidate: [['profile']] }
  return useOfflineMutation<{ full_name: string; school_year: string | null }>({
    ...base,
    networkFn: (vars) => upsertProfile(userId, vars),
  })
}

export function useSettingsUpdate(userId: string) {
  const base = { userId, invalidate: [['settings'], ['tasks'], ['blocks'], ['pressure']] }
  return useOfflineMutation<Record<string, unknown>>({
    ...base,
    networkFn: (vars) => updateSettings(userId, vars as Parameters<typeof updateSettings>[1]),
  })
}

export function useNotificationMutations(userId: string) {
  const base = { userId, invalidate: [['notifications']] }
  const markRead = useOfflineMutation<{ id: string }>({
    ...base,
    networkFn: (vars) => markNotificationRead(vars.id),
  })
  const markAllRead = useOfflineMutation<Record<string, never>>({
    ...base,
    networkFn: () => markAllNotificationsRead(userId),
  })
  return { markRead, markAllRead }
}