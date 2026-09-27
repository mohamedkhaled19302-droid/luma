import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/layouts/auth-layout'
import { SpinnerScreen } from '@/components/common/loading'
import { getSession, onAuthStateChange } from '@/auth/auth-service'

export default function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    let done = false

    const redirect = () => {
      if (done) return
      done = true
      navigate('/dashboard', { replace: true })
    }

    // The supabase client (detectSessionInUrl: true) already exchanged the
    // OAuth code on page load. Wait for the restored session, then continue.
    void getSession()
      .then(({ data }) => {
        if (!active) return
        if (data.session) redirect()
      })
      .catch(() => undefined)

    const { data: subscription } = onAuthStateChange((_event, session) => {
      if (!active) return
      if (session) redirect()
    })

    const fallback = window.setTimeout(() => {
      if (!active) return
      redirect()
    }, 5000)

    return () => {
      active = false
      window.clearTimeout(fallback)
      subscription.subscription.unsubscribe()
    }
  }, [navigate])

  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-4 py-16">
        <SpinnerScreen />
        <p className="text-sm text-muted-foreground">Completing sign in…</p>
      </div>
    </AuthLayout>
  )
}