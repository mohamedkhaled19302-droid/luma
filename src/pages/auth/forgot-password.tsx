import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckCircle2 } from 'lucide-react'
import { AuthLayout } from '@/layouts/auth-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    <AuthLayout>
      <div className="space-y-1.5 text-center lg:text-left">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Reset your password
        </h1>
        <p className="text-sm text-muted-foreground">
          We&rsquo;ll email you a secure link to set a new one.
        </p>
      </div>
      <Card className="shadow-soft-md">
        <CardContent className="p-6">
          {sent ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                  <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium">
                  Check your email for a reset link.
                </p>
              </div>
              <Button asChild variant="outline" className="w-full" size="lg">
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
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
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
    </AuthLayout>
  )
}