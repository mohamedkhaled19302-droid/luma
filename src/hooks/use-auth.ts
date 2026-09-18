import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSession, onAuthStateChange } from '@/auth/auth-service'

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
    void getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: subscription } = onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession as Session | null)
      setUser((nextSession as Session | null)?.user ?? null)
      setLoading(false)
    })

    return () => {
      active = false
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