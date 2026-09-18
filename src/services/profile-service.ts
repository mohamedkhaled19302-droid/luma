import { supabase } from '@/database/client'
import type { Profile } from '@/types/models'

const PROFILE_COLUMNS = 'id, full_name, school_year, created_at, updated_at'

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function upsertProfile(
  userId: string,
  fields: { full_name: string; school_year: string | null },
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...fields })
    .select(PROFILE_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function updateProfile(
  userId: string,
  fields: Partial<{ full_name: string; school_year: string | null }>,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .maybeSingle()
  if (error) throw error
  return data
}