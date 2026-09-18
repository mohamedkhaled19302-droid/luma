import { supabase } from '@/database/client'
import type { DailyPlan, ScheduleBlock } from '@/types/models'

export const BLOCK_COLUMNS =
  'id, user_id, plan_date, block_type, title, task_id, event_id, habit_id, start_at, end_at, locked, completed, skipped, note, color, created_at'

export type BlockInsert = Omit<ScheduleBlock, 'id' | 'user_id' | 'created_at'>
export type BlockUpdate = Partial<
  Pick<
    ScheduleBlock,
    | 'plan_date'
    | 'block_type'
    | 'title'
    | 'task_id'
    | 'event_id'
    | 'habit_id'
    | 'start_at'
    | 'end_at'
    | 'locked'
    | 'completed'
    | 'skipped'
    | 'note'
    | 'color'
  >
>

export async function listBlocksForDay(userId: string, date: string): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from('schedule_blocks')
    .select(BLOCK_COLUMNS)
    .eq('user_id', userId)
    .eq('plan_date', date)
    .order('start_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function listBlocksBetween(
  userId: string,
  from: string,
  to: string,
): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from('schedule_blocks')
    .select(BLOCK_COLUMNS)
    .eq('user_id', userId)
    .gte('start_at', from)
    .lt('start_at', to)
    .order('start_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createBlock(userId: string, block: BlockInsert): Promise<ScheduleBlock> {
  const { data, error } = await supabase
    .from('schedule_blocks')
    .insert({ user_id: userId, ...block })
    .select(BLOCK_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function createBlocksBulk(
  userId: string,
  blocks: BlockInsert[],
): Promise<ScheduleBlock[]> {
  if (blocks.length === 0) return []
  const { data, error } = await supabase
    .from('schedule_blocks')
    .insert(blocks.map((b) => ({ user_id: userId, ...b })))
    .select(BLOCK_COLUMNS)
  if (error) throw error
  return data ?? []
}

export async function updateBlock(blockId: string, fields: BlockUpdate): Promise<ScheduleBlock | null> {
  const { data, error } = await supabase
    .from('schedule_blocks')
    .update(fields)
    .eq('id', blockId)
    .select(BLOCK_COLUMNS)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateBlocksBulk(
  updates: Array<{ id: string; fields: BlockUpdate }>,
): Promise<void> {
  for (const update of updates) {
    await updateBlock(update.id, update.fields)
  }
}

export async function deleteBlock(blockId: string): Promise<void> {
  const { error } = await supabase.from('schedule_blocks').delete().eq('id', blockId)
  if (error) throw error
}

export async function replaceBlocksForDay(
  userId: string,
  date: string,
  blocks: BlockInsert[],
): Promise<ScheduleBlock[]> {
  const { error: deleteError } = await supabase
    .from('schedule_blocks')
    .delete()
    .eq('user_id', userId)
    .eq('plan_date', date)
  if (deleteError) throw deleteError
  return createBlocksBulk(userId, blocks)
}

export async function upsertDailyPlan(
  userId: string,
  input: { plan_date: string; balance_score: number },
): Promise<DailyPlan> {
  const { data, error } = await supabase
    .from('daily_plans')
    .upsert({ user_id: userId, ...input })
    .select('id, user_id, plan_date, balance_score, generated_at')
    .single()
  if (error) throw error
  return data
}

export async function getDailyPlan(userId: string, date: string): Promise<DailyPlan | null> {
  const { data, error } = await supabase
    .from('daily_plans')
    .select('id, user_id, plan_date, balance_score, generated_at')
    .eq('user_id', userId)
    .eq('plan_date', date)
    .maybeSingle()
  if (error) throw error
  return data
}