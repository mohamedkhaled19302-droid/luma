import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Logo } from '@/components/common/logo'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

const SELLING_POINTS = [
  {
    title: 'One plan for your whole life',
    body: 'Tasks, habits, wellbeing and free time — balanced by an adaptive scheduler.',
  },
  {
    title: 'Know what to do next',
    body: 'Your day is planned around energy, deadlines and habits. No more guesswork.',
  },
  {
    title: 'Be kind to future-you',
    body: `${BRAND.name} protects your focus time and keeps stress in check, automatically.`,
  },
]

export function AuthLayout({
  children,
  wide = false,
}: {
  children: ReactNode
  wide?: boolean
}) {
  return (
    <main className="relative flex min-h-dvh w-full overflow-hidden">
      {/* Brand panel — hidden on short/narrow screens, shown md+ */}
      <div className="relative hidden w-[46%] shrink-0 flex-col justify-between overflow-hidden border-r bg-card p-10 lg:flex">
        {/* Aurora inside brand panel */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -top-24 right-0 h-80 w-80 rounded-full gradient-brand opacity-20 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-fuchsia-500/15 blur-3xl" />
        </div>

        <div className="relative">
          <Link to="/landing" className="press inline-block rounded-lg" aria-label="Back to homepage">
            <Logo />
          </Link>
        </div>

        <div className="relative space-y-8">
          <div className="flex items-center gap-2">
            <span className="eyebrow">{BRAND.wordmark}</span>
          </div>
          <div className="space-y-6">
            {SELLING_POINTS.map((point) => (
              <div key={point.title} className="flex gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-display font-semibold tracking-tight">{point.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{point.body}</p>
                </div>
              </div>
            ))}
          </div>
          <blockquote className="border-l-2 border-primary/40 pl-4 text-sm italic text-muted-foreground">
            &ldquo;It feels like having a planner who actually understands my week.&rdquo;
            <span className="mt-2 block not-italic text-xs font-medium text-foreground">
              &mdash; a {BRAND.name} user
            </span>
          </blockquote>
        </div>

        <p className="relative text-xs text-muted-foreground">
          Plan your life. Not just your tasks.
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-1 items-center justify-center px-4 py-12">
        {/* Mobile logo */}
        <div className="absolute left-4 top-5 lg:hidden">
          <Link to="/landing" className="press inline-block rounded-lg" aria-label="Back to homepage">
            <Logo />
          </Link>
        </div>
        <Link
          to="/landing"
          className="absolute right-4 top-5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Home
        </Link>

        <div
          className={cn(
            'animate-in-screen w-full space-y-6',
            wide ? 'max-w-md' : 'max-w-sm',
          )}
        >
          {children}
        </div>
      </div>
    </main>
  )
}