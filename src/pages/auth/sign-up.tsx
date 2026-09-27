import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthLayout } from '@/layouts/auth-layout'
import { BRAND } from '@/lib/brand'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/common/loading'
import { signUpWithEmail, signInWithEmail } from '@/auth/auth-service'
import { formatError } from '@/lib/utils'

export default function SignUpPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    try {
      await signUpWithEmail(email, password, fullName)
      try {
        // When Supabase email confirmation is disabled the sign-up already
        // returns a session; otherwise sign in straight away so new users
        // land in the app without having to confirm anything.
        await signInWithEmail(email, password)
      } catch {
        // No session + sign in failed => email confirmation is still on.
        toast.error(
          'Account created. Turn off "Confirm email" in Supabase Auth settings to sign in instantly.',
        )
        return
      }
      toast.success(`Welcome to ${BRAND.name}`)
      navigate('/onboarding')
    } catch (error) {
      toast.error(formatError(error) ?? 'Failed to create an account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout wide>
      <div className="space-y-1.5 text-center lg:text-left">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Create your {BRAND.name} account
        </h1>
        <p className="text-sm text-muted-foreground">
          Set up your space in a couple of minutes.
        </p>
      </div>
      <Card className="shadow-soft-md">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                type="text"
                autoComplete="name"
                placeholder="Ava Chen"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                placeholder="8 characters or more"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading && <Spinner className="h-4 w-4" />}
              Create account
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/auth/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}