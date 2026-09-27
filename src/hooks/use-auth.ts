import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSession, onAuthStateChange } from '@/auth/auth-service'
import { ensureUserRows } from '@/data/seed'

export interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  isAuthenticated: boolean
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const apply = async (nextSession: Session | null) => {
      if (!active) return
      // Seed before the app renders: the planner assumes a profile and settings
      // row exist for the signed-in account, exactly as the database trigger
      // used to guarantee. This is local IndexedDB, so it costs a few ms.
      if (nextSession?.user) {
        try {
          await ensureUserRows(
            nextSession.user.id,
            (nextSession.user.user_metadata?.full_name as string | undefined) ?? '',
          )
        } catch {
          // A blocked or corrupt IndexedDB must not hard-lock the app; the
          // individual queries surface their own errors instead.
        }
      }
      if (!active) return
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    }

    // On first load `getSession()` can resolve `null` before the auth client has
    // finished reading the persisted session. Only trust it when it actually
    // returns a session; otherwise wait for the INITIAL_SESSION event, which is
    // emitted with the authoritative restored session.
    void getSession()
      .then(({ data }) => {
        if (data.session) void apply(data.session as Session)
      })
      .catch(() => undefined)

    // Every event is applied, including sign-out and token refresh. A previous
    // "settled once" latch here meant signing out left the app believing it was
    // still authenticated.
    const { data: subscription } = onAuthStateChange((_event, nextSession) => {
      if (!active) return
      void apply(nextSession as Session | null)
    })

    // Safety net: never leave the app stuck on the loading spinner.
    const fallback = window.setTimeout(() => {
      if (active) setLoading(false)
    }, 15000)

    return () => {
      active = false
      window.clearTimeout(fallback)
      subscription.subscription.unsubscribe()
    }
  }, [])

  return {
    session,
    user,
    loading,
    isAuthenticated: Boolean(user),
  }
}
