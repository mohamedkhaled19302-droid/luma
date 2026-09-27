import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearLocalData, localDb } from '@/data/local-db'
import { ensureUserRows } from '@/data/seed'

/**
 * `ensureUserRows` replaces the `handle_new_user` Postgres trigger, which used
 * to create the profile and settings rows on signup with `on conflict do
 * nothing`. Losing that guarantee would leave every authenticated page reading
 * rows that do not exist.
 */

beforeEach(async () => {
  await clearLocalData()
})

describe('ensureUserRows', () => {
  it('creates the profile and settings rows for a new account', async () => {
    await ensureUserRows('user-1', 'Sam')

    const profile = await localDb.profiles.get('user-1')
    expect(profile?.full_name).toBe('Sam')
    expect(typeof profile?.created_at).toBe('string')

    const settings = await localDb.settings.get('user-1')
    expect(settings).toBeDefined()
    expect(settings?.focus_start).toBe('08:00')
    expect(settings?.theme).toBe('system')
    expect(settings?.onboarded).toBe(false)
  })

  it('gives the private assistant defaults, not permissive ones', async () => {
    await ensureUserRows('user-1', 'Sam')
    const settings = await localDb.settings.get('user-1')
    expect(settings?.assistant_prefs.enabled).toBe(false)
    expect(settings?.assistant_prefs.wake_word).toBe(false)
    expect(settings?.assistant_prefs.screen_awareness).toBe(false)
    expect(settings?.assistant_prefs.keep_conversations).toBe(false)
  })

  it('is idempotent, so signing in repeatedly does not clobber edits', async () => {
    await ensureUserRows('user-1', 'Sam')

    // Simulate the user changing their name and settings after onboarding.
    const profile = await localDb.profiles.get('user-1')
    await localDb.profiles.put({ ...profile!, full_name: 'Sam K.' })
    const settings = await localDb.settings.get('user-1')
    await localDb.settings.put({ ...settings!, focus_start: '06:00' })

    await ensureUserRows('user-1', 'Sam')

    expect((await localDb.profiles.get('user-1'))?.full_name).toBe('Sam K.')
    expect((await localDb.settings.get('user-1'))?.focus_start).toBe('06:00')
    expect(await localDb.profiles.count()).toBe(1)
    expect(await localDb.settings.count()).toBe(1)
  })

  it('tolerates a missing display name', async () => {
    await ensureUserRows('user-1', '')
    expect((await localDb.profiles.get('user-1'))?.full_name).toBe('')
  })

  it('keeps two accounts on one device independent', async () => {
    await ensureUserRows('user-1', 'Sam')
    await ensureUserRows('user-2', 'Alex')
    expect(await localDb.profiles.count()).toBe(2)
    expect((await localDb.profiles.get('user-2'))?.full_name).toBe('Alex')
  })
})
