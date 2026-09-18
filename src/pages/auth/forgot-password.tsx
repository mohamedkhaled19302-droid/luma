import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Logo } from '@/components/common/logo'
import { Spinner } from '@/components/common/loading'
import { requestPasswordReset } from '@/auth/auth-service'
import { formatError } from '@/lib/utils'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (error) {
      toast.error(formatError(error) ?? 'Failed to send reset link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Card>
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl">Reset your password</CardTitle>
            <CardDescription>We&rsquo;ll email you a secure link to set a new one.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4">
                <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-500/5 px-4 py-6 text-center">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                  <p className="text-sm font-medium">Check your email for a reset link.</p>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/auth/sign-in">Back to sign in</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@school.edu"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Spinner className="h-4 w-4" />}
                  Send reset link
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link to="/auth/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}