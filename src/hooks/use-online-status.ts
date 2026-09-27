import { useSyncExternalStore } from 'react'
import { isOnlineNow, subscribeOnline } from '@/lib/sync-queue'

/**
 * Reactive online/offline state via useSyncExternalStore.
 * Assumes online when the server snapshot is unavailable (SSR/Capacitor-safe).
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => isOnlineNow(),
    () => true,
  )
}
