import { supabase } from '@/database/client'
import type { WellbeingCheckin } from '@/types/models'

export const CHECKIN_COLUMNS =
  'id, user_id, checkin_date, energy, stress, sleep_hours, note, created_at'

export async function getCheckin(
  userId: string,
  date: string,
): Promise<WellbeingCheckin | null> {
  const { data, error } = await supabase
    .from('wellbeing_checkins')
    .select(CHECKIN_COLUMNS)
    .eq('user_id', userId)
    .eq('checkin_date', date)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function upsertCheckin(
  userId: string,
  input: {
    checkin_date: string
    energy: number | null
    stress: number | null
    sleep_hours: number | null
    note: string | null
  },
): Promise<WellbeingCheckin> {
  const { data, error } = await supabase
    .from('wellbeing_checkins')
    .upsert({ user_id: userId, ...input })
    .select(CHECKIN_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function listCheckins(
  userId: string,
  from: string,
  to: string,
): Promise<WellbeingCheckin[]> {
  const { data, error } = await supabase
    .from('wellbeing_checkins')
    .select(CHECKIN_COLUMNS)
    .eq('user_id', userId)
    .gte('checkin_date', from)
    .lte('checkin_date', to)
    .order('checkin_date', { ascending: true })
  if (error) throw error
  return data ?? []
}