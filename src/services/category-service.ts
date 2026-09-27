import { supabase } from '@/database/client'
import type { Category } from '@/types/models'

const CATEGORY_COLUMNS = 'id, user_id, name, color, created_at'

export async function listCategories(userId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select(CATEGORY_COLUMNS)
    .eq('user_id', userId)
    .order('name', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getCategory(categoryId: string): Promise<Category | null> {
  const { data, error } = await supabase
    .from('categories')
    .select(CATEGORY_COLUMNS)
    .eq('id', categoryId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createCategory(
  userId: string,
  name: string,
  color: string,
): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name, color })
    .select(CATEGORY_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function updateCategory(
  categoryId: string,
  fields: Partial<{ name: string; color: string }>,
): Promise<Category | null> {
  const { data, error } = await supabase
    .from('categories')
    .update(fields)
    .eq('id', categoryId)
    .select(CATEGORY_COLUMNS)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function deleteCategory(categoryId: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', categoryId)
  if (error) throw error
}

export async function createCategoriesBulk(
  userId: string,
  items: Array<{ name: string; color: string }>,
): Promise<Category[]> {
  if (items.length === 0) return []
  const { data, error } = await supabase
    .from('categories')
    .insert(items.map((item) => ({ user_id: userId, ...item })))
    .select(CATEGORY_COLUMNS)
  if (error) throw error
  return data ?? []
}
