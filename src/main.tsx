import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/lib/theme'
import { queryClient } from '@/lib/query-client'
import { router } from '@/router'
import { seedQueryClient } from '@/services/cache-service'
import { flushMutationQueue } from '@/services/offline-service'
import '@/styles.css'

void seedQueryClient(queryClient)

window.addEventListener('online', () => {
  void flushMutationQueue().then(() => {
    void queryClient.invalidateQueries()
  })
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
)