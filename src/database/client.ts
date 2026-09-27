import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { localData } from '@/data/query-shim'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}

function configureError(): Error {
  return new Error(
    'Supabase environment variables are missing. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

let configured: SupabaseClient | null = null

/**
 * Supabase is used for authentication only. Every planner row lives in the
 * browser's IndexedDB via the local data layer, so `from()` is intercepted and
 * served from the device instead of the network.
 *
 * This keeps one client object for the whole app: the ~18 services that already
 * call `supabase.from('tasks')` keep working untouched, while `supabase.auth`
 * still talks to the real Supabase project. Importing this module never throws,
 * so the landing page and auth forms can render before configuration exists.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop: keyof SupabaseClient) {
    // Planner data never leaves the device, so it must work even if the auth
    // project is unreachable or unconfigured.
    if (prop === 'from') {
      return (table: string) => localData.from(table)
    }
    if (!url || !anonKey) throw configureError()
    if (!configured) {
      configured = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
      })
    }
    const value = configured[prop]
    if (typeof value === 'function') return value.bind(configured)
    return value
  },
})
