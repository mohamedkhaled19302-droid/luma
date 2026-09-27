import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BatteryCharging,
  Brain,
  CalendarRange,
  LayoutTemplate,
  MousePointer2,
  Orbit,
  Sparkles,
  Timer,
  Waves,
} from 'lucide-react'
import { Logo } from '@/components/common/logo'
import { BRAND } from '@/lib/brand'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/lib/use-media-query'

const Hero3D = lazy(() =>
  import('@/components/3d/hero-3d').then((m) => ({ default: m.Hero3D })),
)
const Hero3DCompact = lazy(() =>
  import('@/components/3d/hero-3d').then((m) => ({ default: m.Hero3DCompact })),
)

const features = [
  {
    icon: Brain,
    title: 'A scheduler that thinks',
    description: `${BRAND.name} plans your day around deadlines, energy and real focus time — not just a to-do list.`,
    color: 'from-violet-500 to-purple-500',
  },
  {
    icon: CalendarRange,
    title: 'Every block counts',
    description: 'Appointments, commitments, deep work and rest — one calm timeline instead of ten scattered apps.',
    color: 'from-indigo-500 to-blue-500',
  },
  {
    icon: BatteryCharging,
    title: 'Work with your energy',
    description: 'Tough tasks when you are sharp, lighter work when you are drained. You set the rhythm.',
    color: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Waves,
    title: 'Rest is part of the plan',
    description: 'Breaks and sleep are scheduled like everything else. Burnout is not part of the plan.',
    color: 'from-sky-500 to-cyan-500',
  },
  {
    icon: LayoutTemplate,
    title: 'Templates that launch you',
    description: 'Deadline sprints, big projects, weekly resets — proven plans you can apply with one tap.',
    color: 'from-amber-500 to-orange-500',
  },
  {
    icon: Timer,
    title: 'Focus Studio',
    description: 'A Pomodoro timer tuned to your rhythm, with deep-work presets and session streaks.',
    color: 'from-pink-500 to-rose-500',
  },
]

const stats = [
  { value: '3D', label: 'Interactive orbit view' },
  { value: '6+', label: 'Ready-made templates' },
  { value: '100%', label: 'Offline capable' },
  { value: '8', label: 'Reschedules with you' },
]

export default function LandingPage() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3.5">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/auth/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth/sign-up">
                Get started
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* ————— HERO ————— */}
        <section className="relative flex min-h-[calc(100svh-4.25rem)] flex-col items-center justify-center overflow-hidden">
          {/* 3D universe behind everything */}
          {isDesktop ? (
            <Suspense fallback={null}>
              <Hero3D />
            </Suspense>
          ) : null}

          {/* Radial vignette to keep text crisp over the 3D */}
          <div
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              background:
                'radial-gradient(ellipse 60% 50% at 50% 45%, hsl(var(--background) / 0.88) 0%, hsl(var(--background) / 0.4) 45%, transparent 75%)',
            }}
            aria-hidden="true"
          />

          <div className="relative z-10 mx-auto w-full max-w-5xl px-6 text-center">
            {/* Badge */}
            <div className="stagger-fade">
              <span className="glass inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Built for people who want a life, not just a schedule
              </span>
            </div>

            {/* Mobile 3D — above headline */}
            {!isDesktop && (
              <Suspense fallback={<div className="mx-auto mt-8 h-48" />}>
                <Hero3DCompact className="mx-auto mt-6 h-48 w-full max-w-xs" />
              </Suspense>
            )}

            {/* Headline */}
            <h1 className="font-display mx-auto mt-8 max-w-4xl text-balance text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Plan your life.
              <span className="gradient-brand-text block">
                Not just your tasks.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {BRAND.name} turns deadlines, habits and energy into a calm weekly plan —
              then reshapes it around the life you actually want to live.
            </p>

            {/* CTA */}
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="group w-full sm:w-auto">
                <Link to="/auth/sign-up">
                  Start planning free
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="glass w-full sm:w-auto">
                <Link to="/auth/sign-in">I already have an account</Link>
              </Button>
            </div>

            {/* Interaction hint */}
            {isDesktop && (
              <p className="mt-8 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <MousePointer2 className="h-3.5 w-3.5" aria-hidden="true" />
                Move your mouse to explore the orbit
              </p>
            )}
          </div>

          {/* Scroll cue */}
          <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
            <div className="flex h-9 w-5 items-start justify-center rounded-full border-2 border-muted-foreground/30 p-1.5">
              <div className="h-2 w-1 animate-bounce rounded-full bg-muted-foreground/50" />
            </div>
          </div>
        </section>

        {/* ————— STATS STRIP ————— */}
        <section className="relative z-10 border-y bg-muted/40 backdrop-blur-sm">
          <div className="mx-auto grid max-w-5xl grid-cols-2 divide-x sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="px-6 py-6 text-center">
                <p className="gradient-brand-text text-2xl font-black sm:text-3xl">{stat.value}</p>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ————— FEATURES ————— */}
        <section className="relative mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <span className="gradient-brand-text text-sm font-bold uppercase tracking-widest">
              Everything in one place
            </span>
            <h2 className="font-display mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Six tools. One calm command center.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Each piece works alone — together they run your whole week.
            </p>
          </div>

          <div className="stagger-fade mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="card-lift group relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm"
              >
                {/* Gradient accent that appears on hover */}
                <div
                  className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${feature.color} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                />
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} text-white shadow-md`}
                >
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ————— 3D CALLOUT ————— */}
        <section className="relative overflow-hidden border-t bg-muted/30">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 lg:grid-cols-2 lg:py-28">
            <div>
              <span className="gradient-brand-text text-sm font-bold uppercase tracking-widest">
                See it. Spin it. Live it.
              </span>
              <h2 className="font-display mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                Your schedule, orbiting in 3D
              </h2>
              <p className="mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">
                Your classes, tasks and breaks orbit around your day. Drag to look
                around, hover a ring to preview what&apos;s coming up — then watch it
                reshape itself as your week fills in.
              </p>
              <Button asChild className="mt-8" size="lg">
                <Link to="/auth/sign-up">
                  Try the orbit view
                  <Orbit className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="gradient-border relative flex h-72 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-violet-500/10 via-background to-fuchsia-500/10 sm:h-80">
              <div className="text-center">
                <Orbit className="mx-auto h-12 w-12 text-primary" style={{ animation: 'float-slow 3s ease-in-out infinite' }} />
                <p className="mt-3 text-sm font-medium text-muted-foreground">
                  Interactive 3D — sign in to see yours
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ————— FINAL CTA ————— */}
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
            <h2 className="font-display text-balance text-3xl font-bold tracking-tight sm:text-5xl">
              Your week is waiting.
              <span className="gradient-brand-text block">Make it yours.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-lg text-muted-foreground">
              Free to start. Set up in two minutes.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="group w-full sm:w-auto">
                <Link to="/auth/sign-up">
                  Start planning free
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <Logo />
          <div className="flex flex-col items-center gap-1 text-center sm:items-end sm:text-right">
            <p className="text-sm text-muted-foreground">
              {BRAND.wordmark} &middot; a calmer way to plan your week
            </p>
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} {BRAND.wordmark}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}