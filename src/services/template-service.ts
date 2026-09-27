import { supabase } from '@/database/client'
import type { TemplateCategory, TemplateTask } from '@/lib/planning-templates'

export const TEMPLATE_COLUMNS =
  'id, user_id, name, emoji, description, category, tasks, author_name, is_public, created_at, updated_at'

export interface TemplateRow {
  id: string
  user_id: string
  name: string
  emoji: string
  description: string | null
  category: TemplateCategory
  tasks: TemplateTask[]
  author_name: string
  is_public: boolean
  created_at: string
  updated_at: string
}

export type TemplateInsert = Omit<
  TemplateRow,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>

/** Community gallery: every public template, newest first. */
export async function getSharedTemplates(_userId: string): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_COLUMNS)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

/** Community gallery filtered by name (case-insensitive). */
export async function searchSharedTemplates(query: string): Promise<TemplateRow[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_COLUMNS)
    .eq('is_public', true)
    .ilike('name', `%${trimmed}%`)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

/** The signed-in user's own rows (private + public). */
export async function listMyTemplates(userId: string): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from('templates')
    .select(TEMPLATE_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** Insert a new template, or update an existing one when `id` is provided. */
export async function upsertTemplate(
  userId: string,
  id: string | null,
  fields: TemplateInsert,
): Promise<TemplateRow> {
  if (id) {
    const { data, error } = await supabase
      .from('templates')
      .update(fields)
      .eq('id', id)
      .eq('user_id', userId)
      .select(TEMPLATE_COLUMNS)
      .single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase
    .from('templates')
    .insert({ user_id: userId, ...fields })
    .select(TEMPLATE_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function updateTemplateVisibility(
  templateId: string,
  isPublic: boolean,
): Promise<TemplateRow | null> {
  const { data, error } = await supabase
    .from('templates')
    .update({ is_public: isPublic })
    .eq('id', templateId)
    .select(TEMPLATE_COLUMNS)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function removeTemplate(templateId: string): Promise<void> {
  const { error } = await supabase.from('templates').delete().eq('id', templateId)
  if (error) throw error
}

export function templateTotalMinutes(tasks: TemplateTask[]): number {
  return tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)
}

/** Compact footer token, e.g. "4 tasks · 40m" — shared by gallery + own list. */
export function formatSharePreview(tasks: TemplateTask[]): string {
  const minutes = templateTotalMinutes(tasks)
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  const time = hours > 0 ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`) : `${mins}m`
  const count = tasks.length
  return `${count} ${count === 1 ? 'task' : 'tasks'} · ${time}`
}