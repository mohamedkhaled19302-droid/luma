import { supabase, isSupabaseConfigured } from '@/database/client'

class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.',
    )
    this.name = 'SupabaseNotConfiguredError'
  }
}

function assertConfigured(): void {
  if (!isSupabaseConfigured()) throw new SupabaseNotConfiguredError()
}

export async function signUpWithEmail(email: string, password: string, fullName: string) {
  assertConfigured()
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  })
}

export async function signInWithEmail(email: string, password: string) {
  assertConfigured()
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  assertConfigured()
  return supabase.auth.signOut()
}

export async function requestPasswordReset(email: string) {
  assertConfigured()
  const redirectTo = `${window.location.origin}/auth/reset-password`
  return supabase.auth.resetPasswordForEmail(email, { redirectTo })
}

export async function updatePassword(newPassword: string) {
  assertConfigured()
  return supabase.auth.updateUser({ password: newPassword })
}

export async function getSession() {
  if (!isSupabaseConfigured()) {
    return { data: { session: null }, error: null }
  }
  return supabase.auth.getSession()
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured()) return null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export function onAuthStateChange(callback: (event: string, session: unknown) => void) {
  if (!isSupabaseConfigured()) {
    return {
      data: {
        subscription: { unsubscribe: () => undefined },
      },
    }
  }
  return supabase.auth.onAuthStateChange(callback)
}

export { SupabaseNotConfiguredError }