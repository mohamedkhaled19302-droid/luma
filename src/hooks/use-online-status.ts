import { useSyncExternalStore } from 'react'
import { isOnline, subscribeOnline } from '@/services/offline-service'

/**
 * Reactive online/offline state via useSyncExternalStore.
 * Assumes online when the server snapshot is unavailable (SSR/Capacitor-safe).
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => isOnline(),
    () => true,
  )
}