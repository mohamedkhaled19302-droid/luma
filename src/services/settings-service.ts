import { supabase } from '@/database/client'
import { DEFAULT_ASSISTANT_PREFS } from '@/data/assistant-defaults'
import type { AssistantPrefs, Settings } from '@/types/models'

export const SETTINGS_COLUMNS = `
  user_id, sleep_target_hours, break_every_minutes, break_minutes,
  focus_start, focus_end, max_session_minutes,
  wake_time, bed_time,
  energy_pref, notification_prefs, theme, onboarded, onboarding_completed_at,
  assistant_prefs, updated_at
`

/**
 * Private by default: nothing sends, listens, watches or records until asked.
 *
 * `enabled` is deliberately false. The assistant panel shows an explicit
 * opt-in that says what would be shared, because a feature that is quietly on
 * is not opt-in at all.
 *
 * Re-exported from `@/data/assistant-defaults` so the local data layer can seed
 * a settings row without importing this service (which imports the Supabase
 * client, which would close an import cycle).
 */
export { DEFAULT_ASSISTANT_PREFS }

const DEFAULT_SETTINGS: Omit<Settings, 'user_id' | 'updated_at'> = {
  sleep_target_hours: 8,
  break_every_minutes: 60,
  break_minutes: 10,
  focus_start: '08:00',
  focus_end: '22:00',
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
  assistant_prefs: DEFAULT_ASSISTANT_PREFS,
}

/**
 * Merge a stored row over the defaults.
 *
 * Nested bags are merged field by field so a row written by an older version
 * (which has no `assistant_prefs` at all) still yields complete preferences
 * instead of `undefined` at every call site.
 */
function withDefaults(row: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(row ?? {}),
    user_id: row?.user_id ?? '',
    updated_at: row?.updated_at ?? new Date().toISOString(),
    notification_prefs: {
      ...DEFAULT_SETTINGS.notification_prefs,
      ...(row?.notification_prefs ?? {}),
    },
    assistant_prefs: {
      ...DEFAULT_ASSISTANT_PREFS,
      ...(row?.assistant_prefs ?? {}),
    },
  }
}

export async function getSettings(userId: string): Promise<Settings> {
  const { data, error } = await supabase
    .from('settings')
    .select(SETTINGS_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (data) return withDefaults(data as Settings)
  const { data: created, error: createError } = await supabase
    .from('settings')
    .upsert({ user_id: userId, ...DEFAULT_SETTINGS }, { onConflict: 'user_id' })
    .select(SETTINGS_COLUMNS)
    .single()
  if (createError) throw createError
  return withDefaults(created as Settings)
}

export async function updateSettings(userId: string, fields: Partial<Settings>): Promise<Settings> {
  const { data, error } = await supabase
    .from('settings')
    .upsert({ user_id: userId, ...fields }, { onConflict: 'user_id' })
    .select(SETTINGS_COLUMNS)
    .single()
  if (error) throw error
  return withDefaults(data as Settings)
}

/** Merge a partial change into the assistant preferences without clobbering. */
export async function updateAssistantPrefs(
  userId: string,
  patch: Partial<AssistantPrefs>,
): Promise<Settings> {
  const current = await getSettings(userId)
  return updateSettings(userId, {
    assistant_prefs: { ...current.assistant_prefs, ...patch },
  })
}

export async function markOnboarded(userId: string): Promise<Settings> {
  return updateSettings(userId, {
    onboarded: true,
    onboarding_completed_at: new Date().toISOString(),
  })
}