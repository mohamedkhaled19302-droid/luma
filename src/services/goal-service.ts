import { supabase } from '@/database/client'
import type { Goal } from '@/types/models'

export const GOAL_COLUMNS = 'id, user_id, title, description, target_date, status, created_at'

export async function listGoals(userId: string): Promise<Goal[]> {
  const { data, error } = await supabase
    .from('goals')
    .select(GOAL_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createGoal(
  userId: string,
  input: { title: string; description?: string | null; target_date?: string | null },
): Promise<Goal> {
  const { data, error } = await supabase
    .from('goals')
    .insert({ user_id: userId, status: 'active', ...input })
    .select(GOAL_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function updateGoal(
  goalId: string,
  fields: Partial<Pick<Goal, 'title' | 'description' | 'target_date' | 'status'>>,
): Promise<Goal | null> {
  const { data, error } = await supabase
    .from('goals')
    .update(fields)
    .eq('id', goalId)
    .select(GOAL_COLUMNS)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function deleteGoal(goalId: string): Promise<void> {
  const { error } = await supabase.from('goals').delete().eq('id', goalId)
  if (error) throw error
}