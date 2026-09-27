import { supabase } from '@/database/client'
import type { AppNotification, NotificationType } from '@/types/models'

export const NOTIFICATION_COLUMNS = 'id, user_id, type, title, body, data, read, key, deadline_at, created_at'

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

export async function createNotification(
  userId: string,
  input: {
    type: NotificationType
    title: string
    body: string
    data?: Record<string, unknown> | null
    key?: string | null
    deadline_at?: string | null
  },
): Promise<AppNotification> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({ user_id: userId, ...input })
    .select(NOTIFICATION_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function listSentNotificationKeys(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('key')
    .eq('user_id', userId)
    .not('key', 'is', null)
    .limit(500)
  if (error) throw error
  return (data ?? []).map((row) => row.key as string)
}

export async function markNotificationRead(
  notificationId: string,
  read = true,
): Promise<void> {
  await supabase.from('notifications').update({ read }).eq('id', notificationId)
}

export async function markNotificationsRead(
  userId: string,
  notificationIds: string[],
): Promise<void> {
  if (notificationIds.length === 0) return
  await supabase
    .from('notifications')
    .update({ read: true })
    .in('id', notificationIds)
    .eq('user_id', userId)
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await supabase.from('notifications').delete().eq('id', notificationId)
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)
  if (error) throw error
  return count ?? 0
}