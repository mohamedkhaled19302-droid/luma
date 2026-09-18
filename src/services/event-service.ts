import { supabase } from '@/database/client'
import type { CalendarEvent } from '@/types/models'

export const EVENT_COLUMNS =
  'id, user_id, title, description, start_at, end_at, all_day, event_type, locked, location, color, created_at'

export type EventInsert = Omit<CalendarEvent, 'id' | 'user_id' | 'created_at'>

export type EventUpdate = Partial<
  Pick<
    CalendarEvent,
    | 'title'
    | 'description'
    | 'start_at'
    | 'end_at'
    | 'all_day'
    | 'event_type'
    | 'locked'
    | 'location'
    | 'color'
  >
>

export async function listEventsBetween(
  userId: string,
  from: string,
  to: string,
): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select(EVENT_COLUMNS)
    .eq('user_id', userId)
    .lte('start_at', to)
    .gte('end_at', from)
    .order('start_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createEvent(userId: string, event: EventInsert): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({ user_id: userId, ...event })
    .select(EVENT_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function updateEvent(
  eventId: string,
  fields: EventUpdate,
): Promise<CalendarEvent | null> {
  const { data, error } = await supabase
    .from('calendar_events')
    .update(fields)
    .eq('id', eventId)
    .select(EVENT_COLUMNS)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('calendar_events').delete().eq('id', eventId)
  if (error) throw error
}