import { localDb, nowIso } from '@/data/local-db'
import { DEFAULT_ASSISTANT_PREFS } from '@/data/assistant-defaults'

/**
 * The on-device replacement for the `handle_new_user` Postgres trigger.
 *
 * The old database created a profile and a settings row whenever a signup
 * landed, with `on conflict do nothing` so re-running it was harmless. Since
 * planner rows now live in IndexedDB there is no trigger to fire, so the same
 * guarantees are reproduced here: idempotent, and safe to call on every
 * sign-in, on any device.
 */
export async function ensureUserRows(userId: string, fullName: string): Promise<void> {
  await localDb.open()

  if (!(await localDb.profiles.get(userId))) {
    const stamp = nowIso()
    await localDb.profiles.add({
      id: userId,
      full_name: fullName ?? '',
      created_at: stamp,
      updated_at: stamp,
    })
  }

  if (!(await localDb.settings.get(userId))) {
    await localDb.settings.add({
      user_id: userId,
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
      assistant_prefs: structuredClone(DEFAULT_ASSISTANT_PREFS),
      updated_at: nowIso(),
    })
  }
}
