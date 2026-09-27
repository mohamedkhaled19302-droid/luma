import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/lib/theme'
import { queryClient } from '@/lib/query-client'
import { router } from '@/router'
import { seedQueryClient } from '@/services/cache-service'
import { supabase } from '@/database/client'
import { flushPending, subscribeOnline } from '@/lib/sync-queue'
import { STORAGE_KEYS, migrateLegacyStorage } from '@/lib/brand'
import '@/styles.css'

// Runs before anything reads storage, so a user who first opens the renamed
// app keeps their unsynced queue, theme, sound and focus-session preferences.
migrateLegacyStorage()

void seedQueryClient(queryClient)

if (import.meta.env.PROD) {
  // After a redeploy an open tab or a stale service worker can request a
  // chunk hash that no longer exists, failing a dynamic import with
  // "Failed to fetch dynamically imported module". Reload once so the page
  // picks up the fresh index.html and the current chunk manifest.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    if (!sessionStorage.getItem(STORAGE_KEYS.preloadReload)) {
      sessionStorage.setItem(STORAGE_KEYS.preloadReload, '1')
      window.location.reload()
    }
  })
}

// Replay anything queued while offline, then refresh every cached view.
subscribeOnline((online) => {
  if (!online) return
  void flushPending(supabase).then(() => {
    void queryClient.invalidateQueries()
  })
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
        <Toaster position="top-right" richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
)