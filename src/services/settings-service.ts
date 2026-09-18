import { supabase } from '@/database/client'
import type { Settings } from '@/types/models'

export const SETTINGS_COLUMNS = `
  user_id, sleep_target_hours, break_every_minutes, break_minutes,
  preferred_study_start, preferred_study_end, max_session_minutes,
  wake_time, bed_time,
  energy_pref, notification_prefs, theme, onboarded, onboarding_completed_at, updated_at
`

const DEFAULT_SETTINGS: Omit<Settings, 'user_id' | 'updated_at'> = {
  sleep_target_hours: 8,
  break_every_minutes: 60,
  break_minutes: 10,
  preferred_study_start: '08:00',
  preferred_study_end: '22:00',
  max_session_minutes: 90,
  wake_time: '07:00',
  bed_time: '23:00',
  energy_pref: false,
  notification_prefs: {
    deadlines: true,
    tasks: true,
    schedule_change: true,
    missed_task: true,
    habits: true,
  },
  theme: 'system',
  onboarded: false,
  onboarding_completed_at: null,
}

export async function getSettings(userId: string): Promise<Settings> {
  const { data, error } = await supabase
    .from('settings')
    .select(SETTINGS_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (data) {
    return {
      ...DEFAULT_SETTINGS,
      ...(data as Settings),
      notification_prefs: {
        ...DEFAULT_SETTINGS.notification_prefs,
        ...((data as Settings).notification_prefs ?? {}),
      },
    }
  }
  const { data: created, error: createError } = await supabase
    .from('settings')
    .upsert({ user_id: userId, ...DEFAULT_SETTINGS }, { onConflict: 'user_id' })
    .select(SETTINGS_COLUMNS)
    .single()
  if (createError) throw createError
  return { ...DEFAULT_SETTINGS, ...(created as Settings) }
}

export async function updateSettings(userId: string, fields: Partial<Settings>): Promise<Settings> {
  const { data, error } = await supabase
    .from('settings')
    .upsert({ user_id: userId, ...fields }, { onConflict: 'user_id' })
    .select(SETTINGS_COLUMNS)
    .single()
  if (error) throw error
  return { ...DEFAULT_SETTINGS, ...(data as Settings) }
}

export async function markOnboarded(userId: string): Promise<Settings> {
  return updateSettings(userId, {
    onboarded: true,
    onboarding_completed_at: new Date().toISOString(),
  })
}