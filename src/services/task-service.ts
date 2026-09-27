import { supabase } from '@/database/client'
import type { Task } from '@/types/models'

export const TASK_COLUMNS =
  'id, user_id, category_id, title, description, priority, difficulty, estimated_minutes, remaining_minutes, deadline, can_split, status, locked, scheduled_start, scheduled_end, completed_at, parent_task_id, created_at, updated_at'

export type TaskInsert = Omit<
  Task,
  | 'id'
  | 'user_id'
  | 'status'
  | 'scheduled_start'
  | 'scheduled_end'
  | 'completed_at'
  | 'parent_task_id'
  | 'created_at'
  | 'updated_at'
>

export type TaskUpdate = Partial<
  Pick<
    Task,
    | 'category_id'
    | 'title'
    | 'description'
    | 'priority'
    | 'difficulty'
    | 'estimated_minutes'
    | 'remaining_minutes'
    | 'deadline'
    | 'can_split'
    | 'status'
    | 'locked'
    | 'scheduled_start'
    | 'scheduled_end'
    | 'completed_at'
    | 'parent_task_id'
  >
>

export async function getTask(taskId: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('id', taskId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listTasks(userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('user_id', userId)
    .order('deadline', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

export async function listOpenTasks(userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('user_id', userId)
    .in('status', ['todo', 'in_progress'])
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function listTasksDueBefore(
  userId: string,
  before: string,
): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('user_id', userId)
    .in('status', ['todo', 'in_progress'])
    .not('deadline', 'is', null)
    .lt('deadline', before)
    .order('deadline', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function listRecentlyCompletedTasks(
  userId: string,
  after: string,
): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'done')
    .gte('completed_at', after)
    .order('completed_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createTask(userId: string, task: TaskInsert): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ user_id: userId, ...task })
    .select(TASK_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function createTasksBulk(
  userId: string,
  tasks: TaskInsert[],
): Promise<Task[]> {
  if (tasks.length === 0) return []
  const { data, error } = await supabase
    .from('tasks')
    .insert(tasks.map((task) => ({ user_id: userId, ...task })))
    .select(TASK_COLUMNS)
  if (error) throw error
  return data ?? []
}

export async function updateTask(
  taskId: string,
  fields: TaskUpdate,
): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .update(fields)
    .eq('id', taskId)
    .select(TASK_COLUMNS)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function markTaskDone(taskId: string, remainingMinutesNow = 0): Promise<Task | null> {
  return updateTask(taskId, {
    status: 'done',
    remaining_minutes: remainingMinutesNow,
    completed_at: new Date().toISOString(),
    scheduled_start: null,
    scheduled_end: null,
  })
}

export async function markTaskMissed(taskId: string): Promise<Task | null> {
  return updateTask(taskId, { status: 'missed' })
}

export async function markTaskOpen(taskId: string): Promise<Task | null> {
  return updateTask(taskId, { status: 'todo', completed_at: null })
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw error
}

export async function addTaskSession(input: {
  task_id: string
  user_id: string
  start_at: string
  end_at: string
  duration_minutes: number
  completed?: boolean
}) {
  const { data, error } = await supabase
    .from('task_sessions')
    .insert(input)
    .select('id, task_id, user_id, start_at, end_at, duration_minutes, completed, created_at')
    .single()
  if (error) throw error
  return data
}

export async function totalCompletedMinutes(
  userId: string,
  from: string,
  to: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('task_sessions')
    .select('duration_minutes')
    .eq('user_id', userId)
    .eq('completed', true)
    .gte('start_at', from)
    .lte('start_at', to)
  if (error) throw error
  return (data ?? []).reduce((sum, row) => sum + (row.duration_minutes ?? 0), 0)
}