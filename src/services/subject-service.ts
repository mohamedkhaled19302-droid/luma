import { supabase } from '@/database/client'
import type { Subject } from '@/types/models'

const SUBJECT_COLUMNS = 'id, user_id, name, color, created_at'

export async function listSubjects(userId: string): Promise<Subject[]> {
  const { data, error } = await supabase
    .from('subjects')
    .select(SUBJECT_COLUMNS)
    .eq('user_id', userId)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getSubject(subjectId: string): Promise<Subject | null> {
  const { data, error } = await supabase
    .from('subjects')
    .select(SUBJECT_COLUMNS)
    .eq('id', subjectId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createSubject(
  userId: string,
  name: string,
  color: string,
): Promise<Subject> {
  const { data, error } = await supabase
    .from('subjects')
    .insert({ user_id: userId, name, color })
    .select(SUBJECT_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function updateSubject(
  subjectId: string,
  fields: Partial<{ name: string; color: string }>,
): Promise<Subject | null> {
  const { data, error } = await supabase
    .from('subjects')
    .update(fields)
    .eq('id', subjectId)
    .select(SUBJECT_COLUMNS)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function deleteSubject(subjectId: string): Promise<void> {
  const { error } = await supabase.from('subjects').delete().eq('id', subjectId)
  if (error) throw error
}

export async function createSubjectsBulk(
  userId: string,
  items: Array<{ name: string; color: string }>,
): Promise<Subject[]> {
  if (items.length === 0) return []
  const { data, error } = await supabase
    .from('subjects')
    .insert(items.map((item) => ({ user_id: userId, ...item })))
    .select(SUBJECT_COLUMNS)
  if (error) throw error
  return data ?? []
}