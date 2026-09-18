import { supabase } from '@/database/client'
import type { Habit, HabitLog } from '@/types/models'

export const HABIT_COLUMNS =
  'id, user_id, name, description, frequency, target_per_week, preferred_time, estimated_minutes, color, active, created_at'

export const HABIT_LOG_COLUMNS = 'id, user_id, habit_id, log_date, completed, created_at'

export type HabitInsert = Omit<Habit, 'id' | 'user_id' | 'active' | 'created_at'>
export type HabitUpdate = Partial<
  Pick<
    Habit,
    | 'name'
    | 'description'
    | 'frequency'
    | 'target_per_week'
    | 'preferred_time'
    | 'estimated_minutes'
    | 'color'
    | 'active'
  >
>

export async function listHabits(userId: string, activeOnly = false): Promise<Habit[]> {
  let query = supabase
    .from('habits')
    .select(HABIT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (activeOnly) query = query.eq('active', true)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function createHabit(userId: string, habit: HabitInsert): Promise<Habit> {
  const { data, error } = await supabase
    .from('habits')
    .insert({ user_id: userId, ...habit })
    .select(HABIT_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function updateHabit(habitId: string, fields: HabitUpdate): Promise<Habit | null> {
  const { data, error } = await supabase
    .from('habits')
    .update(fields)
    .eq('id', habitId)
    .select(HABIT_COLUMNS)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function deleteHabit(habitId: string): Promise<void> {
  const { error } = await supabase.from('habits').delete().eq('id', habitId)
  if (error) throw error
}

export async function listHabitLogs(
  userId: string,
  habitId: string,
  from: string,
  to: string,
): Promise<HabitLog[]> {
  const { data, error } = await supabase
    .from('habit_logs')
    .select(HABIT_LOG_COLUMNS)
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .gte('log_date', from)
    .lte('log_date', to)
  if (error) throw error
  return data ?? []
}

export async function listAllHabitLogs(userId: string, from: string, to: string): Promise<HabitLog[]> {
  const { data, error } = await supabase
    .from('habit_logs')
    .select(HABIT_LOG_COLUMNS)
    .eq('user_id', userId)
    .gte('log_date', from)
    .lte('log_date', to)
  if (error) throw error
  return data ?? []
}

export async function setHabitLog(input: {
  user_id: string
  habit_id: string
  log_date: string
  completed: boolean
}): Promise<HabitLog> {
  const existing = await supabase
    .from('habit_logs')
    .select(HABIT_LOG_COLUMNS)
    .eq('user_id', input.user_id)
    .eq('habit_id', input.habit_id)
    .eq('log_date', input.log_date)
    .maybeSingle()

  if (existing.data) {
    const { data, error } = await supabase
      .from('habit_logs')
      .update({ completed: input.completed })
      .eq('id', existing.data.id)
      .select(HABIT_LOG_COLUMNS)
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('habit_logs')
    .insert(input)
    .select(HABIT_LOG_COLUMNS)
    .single()
  if (error) throw error
  return data
}