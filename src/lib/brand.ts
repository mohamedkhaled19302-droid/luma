/**
 * Single source of truth for the product identity.
 *
 * The whole app reads its name, tagline and localStorage namespace from here,
 * so the product can be renamed in one place without hunting through the
 * codebase. `migrateLegacyStorage()` keeps data written under the previous
 * name (offline mutation queue, theme, focus sessions, …) so renaming the
 * product never strands a user's unsynced work or local preferences.
 */

export const BRAND = {
  /** Display name, sentence case. */
  name: 'Morrow',
  /** Wordmark, rendered in the logo/marketing copy. */
  wordmark: 'MORROW',
  tagline: 'Plan a day that fits your life.',
  description:
    'Morrow is a personal daily planner that adapts to how you live. Tell it what matters, and it helps you build a realistic plan for today.',
  /** Namespace for every localStorage / IndexedDB key. */
  namespace: 'morrow',
  /** Support / feedback link surfaced in the account menu. */
  repoUrl: 'https://github.com/mohamedkhaled19302-droid/luma',
} as const

/** Every persistent browser key the app owns, in one list. */
export const STORAGE_KEYS = {
  theme: `${BRAND.namespace}:theme`,
  sounds: `${BRAND.namespace}:sounds-enabled`,
  syncQueue: `${BRAND.namespace}:sync-queue`,
  customPresets: `${BRAND.namespace}:custom-presets`,
  preloadReload: `${BRAND.namespace}:preload-reloaded`,
  focusTimerPrefix: `${BRAND.namespace}:focus-timer:`,
  focusSessionsPrefix: `${BRAND.namespace}:focus-sessions:`,
  indexedDbName: BRAND.namespace,
} as const

/**
 * Keys used before the rename. Values are migrated lazily (copy-then-keep, so
 * nothing is destroyed and a rollback stays possible).
 */
const LEGACY_KEYS: Record<string, string[]> = {
  [STORAGE_KEYS.theme]: ['luma-theme'],
  [STORAGE_KEYS.sounds]: ['luma-sounds-enabled'],
  [STORAGE_KEYS.syncQueue]: ['luma.sync-queue'],
  [STORAGE_KEYS.customPresets]: ['luma-custom-presets'],
  [STORAGE_KEYS.preloadReload]: ['luma:preload-reloaded'],
}

/** Same idea for keys that carry a trailing id, e.g. per-session focus timers. */
const LEGACY_PREFIXES: Array<{ next: string; legacy: string }> = [
  { next: STORAGE_KEYS.focusTimerPrefix, legacy: 'luma-focus-timer:' },
  { next: STORAGE_KEYS.focusSessionsPrefix, legacy: 'luma-focus-sessions:' },
]

/** Copy (never delete) any value stored under a legacy key. Idempotent. */
export function migrateLegacyStorage(): void {
  if (typeof window === 'undefined') return
  try {
    for (const [nextKey, legacyKeys] of Object.entries(LEGACY_KEYS)) {
      if (window.localStorage.getItem(nextKey) !== null) continue
      for (const legacyKey of legacyKeys) {
        const value = window.localStorage.getItem(legacyKey)
        if (value !== null) {
          window.localStorage.setItem(nextKey, value)
          break
        }
      }
    }
    for (const { next, legacy } of LEGACY_PREFIXES) {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i)
        if (key === null || !key.startsWith(legacy)) continue
        const suffix = key.slice(legacy.length)
        if (window.localStorage.getItem(next + suffix) !== null) continue
        const value = window.localStorage.getItem(key)
        if (value !== null) window.localStorage.setItem(next + suffix, value)
      }
    }
  } catch {
    /* storage unavailable (private mode / quota) — the app still works */
  }
}

/** Read a namespaced storage value with a safe fallback. */
export function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Write a namespaced storage value. Never throws. */
export function writeStorage(key: string, value: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    /* ignore quota / private-mode errors */
  }
}
