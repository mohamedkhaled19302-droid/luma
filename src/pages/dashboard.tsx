import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  Heart,
  ListTodo,
  Orbit,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useDashboardSummary,
  useDailyPlan,
  useHabits,
  useOpenTasks,
  useSettings,
  useWellbeing,
} from '@/hooks/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/states'
import { cn } from '@/lib/utils'
import { usePointerReactive } from '@/lib/use-pointer-reactive'
import type { Priority, Task } from '@/types/models'

const DayOrbit3D = lazy(() =>
  import('@/components/3d/day-orbit-3d').then((m) => ({ default: m.DayOrbit3D })),
)

const priorityTokens: Record<Priority, string> = {
  critical: 'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-300',
  high: 'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-300',
  medium: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300',
  low: 'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300',
}

function fallbackGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function StatTile({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: LucideIcon
  value: number
  label: string
  accent: string
}) {
  return (
    <div className="group rounded-xl border bg-muted/40 p-3.5 text-center transition-colors hover:border-primary/25 hover:bg-muted/70">
      <div className={cn('mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm', accent)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="mt-2 text-xl font-extrabold leading-none tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</p>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const userId = user?.id
  const { reducedMotion } = usePointerReactive()
  const { data: summary, isLoading } = useDashboardSummary(userId ?? '')
  const { data: openTasks } = useOpenTasks(userId ?? '')
  const { data: activeHabits } = useHabits(userId ?? '', true)
  const { data: wellbeing } = useWellbeing(userId ?? '', new Date())
  const { data: settings } = useSettings(userId ?? '')
  const { data: dailyPlan } = useDailyPlan(userId ?? '', new Date())

  if (!userId) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <EmptyState title="Sign in to see your dashboard" />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-48 w-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    )
  }

  const greeting = summary?.greeting ?? fallbackGreeting()
  const balance = dailyPlan?.balance_score ?? summary?.today.balance ?? 50
  const balanceLabel =
    balance >= 70
      ? 'Nicely balanced. A steady, gentle flow.'
      : balance >= 50
        ? 'A good, steady rhythm.'
        : 'A little heavy — be kind to yourself.'
  const blocks = summary?.today.blocks ?? []
  const deadlines = (summary?.upcomingDeadlines ?? []).filter(
    (task): task is Task & { deadline: string } => task.deadline != null,
  )
  const habits = activeHabits ?? []
  const focusWindow = settings ? `${settings.focus_start}–${settings.focus_end}` : null
  const needsCheckin = !wellbeing || wellbeing.energy == null

  return (
    <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {greeting}
            <span className="gradient-brand-text">.</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what today has in store.
          </p>
        </div>
        <p className="glass flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium shadow-sm">
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
          {format(new Date(), 'EEEE, MMM d')}
        </p>
      </header>

      {/* Today at a glance */}
      <Card className="relative overflow-hidden">
        <div className="gradient-brand absolute inset-x-0 top-0 h-1" aria-hidden="true" />
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg">Today at a glance</CardTitle>
            <CardDescription>{balanceLabel}</CardDescription>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium">
              <span className="text-muted-foreground">Day balance</span>
              <span className="gradient-brand-text font-bold">{balance}%</span>
            </div>
            <Progress value={balance} className="h-2.5" aria-label="Day balance progress" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatTile icon={CalendarDays} value={blocks.length} label="blocks planned" accent="from-indigo-500 to-violet-500" />
            <StatTile icon={ListTodo} value={openTasks?.length ?? 0} label="tasks open" accent="from-amber-500 to-orange-500" />
            <StatTile icon={Flame} value={habits.length} label="active habits" accent="from-emerald-500 to-teal-500" />
          </div>
          {focusWindow && (
            <p className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Your focus window: <strong className="text-foreground">{focusWindow}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      {/* 3D Orbit */}
      {blocks.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md">
                <Orbit className="h-4 w-4" aria-hidden="true" />
              </div>
              Your day in orbit
            </CardTitle>
            <CardDescription>
              Drag to spin · scroll to zoom · hover a satellite to peek
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Suspense fallback={<Skeleton className="h-72 w-full sm:h-80" />}>
              <DayOrbit3D blocks={blocks} frozen={reducedMotion} className="h-72 w-full sm:h-80" />
            </Suspense>
          </CardContent>
        </Card>
      )}

      {/* Quick actions row */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/focus"
          className="card-lift group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md">
            <Timer className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">Focus Studio</p>
            <p className="truncate text-xs text-muted-foreground">Start a deep-work session</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
        <Link
          to="/templates"
          className="card-lift group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md">
            <Zap className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">Templates</p>
            <p className="truncate text-xs text-muted-foreground">Launch a ready-made plan</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </div>

      {/* Next up */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Next up</CardTitle>
          <CardDescription>Your plan, one block at a time</CardDescription>
        </CardHeader>
        <CardContent>
          {blocks.length === 0 ? (
            <EmptyState
              title="No blocks planned yet"
              description="Generate your day in the planner and it will appear here."
              action={
                <Button asChild size="sm">
                  <Link to="/planner">Open planner</Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {blocks.slice(0, 4).map((block) => (
                <li key={block.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/60">
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', block.completed ? 'bg-emerald-500' : 'bg-primary')} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-medium', block.completed && 'text-muted-foreground line-through')}>
                      {block.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(block.start_at), 'h:mm a')} – {format(parseISO(block.end_at), 'h:mm a')}
                    </p>
                  </div>
                  {block.completed && <CheckCircle2 role="img" className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Completed" />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Deadlines */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Upcoming deadlines</CardTitle>
            <CardDescription>What needs your attention soon</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/tasks">
              All tasks <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {deadlines.length === 0 ? (
            <EmptyState title="No deadlines on the horizon" description="Enjoy the calm — or add a task to get ahead." />
          ) : (
            <ul className="space-y-2.5">
              {deadlines.slice(0, 5).map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/60">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(task.deadline), 'EEE, MMM d')}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn('shrink-0 capitalize', priorityTokens[task.priority])}>
                    {task.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Habits + Wellbeing */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-4 w-4 text-orange-500" aria-hidden="true" />
              Habits
            </CardTitle>
            <CardDescription>Keep the streak alive</CardDescription>
          </CardHeader>
          <CardContent>
            {habits.length === 0 ? (
              <EmptyState title="No active habits yet" description="Tiny habits grow into big wins." />
            ) : (
              <div className="flex flex-wrap gap-2">
                {habits.map((habit) => (
                  <span
                    key={habit.id}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: habit.color }} />
                    {habit.name}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="h-4 w-4 text-rose-500" aria-hidden="true" />
              Wellbeing
            </CardTitle>
            <CardDescription>A moment for you</CardDescription>
          </CardHeader>
          <CardContent>
            {needsCheckin ? (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-500/10">
                  <Heart className="h-5 w-5 text-rose-500" aria-hidden="true" />
                </div>
                <p className="text-sm">How are you feeling today?</p>
                <Button asChild size="sm">
                  <Link to="/wellbeing">Check in</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'energy', value: `${wellbeing.energy}/10`, color: 'text-emerald-700 dark:text-emerald-400' },
                  { label: 'stress', value: `${wellbeing.stress ?? '-'}/10`, color: 'text-amber-700 dark:text-amber-400' },
                  { label: 'sleep', value: `${wellbeing.sleep_hours ?? '-'}h`, color: 'text-sky-700 dark:text-sky-400' },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border bg-muted/30 p-3 text-center">
                    <p className={cn('text-lg font-bold leading-none', m.color)}>{m.value}</p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{m.label}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}