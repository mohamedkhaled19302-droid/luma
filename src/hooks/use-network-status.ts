import { useSyncExternalStore } from 'react'
import { pendingCount, subscribePending } from '@/lib/sync-queue'

export interface NetworkStatus {
  online: boolean
  pendingCount: number
}

function getOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

let snapshot: NetworkStatus = { online: getOnline(), pendingCount: pendingCount() }

function subscribeNetwork(callback: () => void): () => void {
  const refresh = (): void => {
    snapshot = { online: getOnline(), pendingCount: pendingCount() }
    callback()
  }
  const onConnectivity = (): void => {
    refresh()
  }
  snapshot = { online: getOnline(), pendingCount: pendingCount() }
  window.addEventListener('online', onConnectivity)
  window.addEventListener('offline', onConnectivity)
  const unsubscribePending = subscribePending(refresh)
  return () => {
    window.removeEventListener('online', onConnectivity)
    window.removeEventListener('offline', onConnectivity)
    unsubscribePending()
  }
}

function getSnapshot(): NetworkStatus {
  return snapshot
}

export function useNetworkStatus(): NetworkStatus {
  return useSyncExternalStore(subscribeNetwork, getSnapshot, getSnapshot)
}