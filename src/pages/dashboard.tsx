import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  Heart,
  ListTodo,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useDailyPlan,
  useDashboardSummary,
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
import type { BlockType, Priority, Task } from '@/types/models'

const blockColors: Record<BlockType, string> = {
  task: 'bg-indigo-500',
  study: 'bg-violet-500',
  school: 'bg-emerald-500',
  habit: 'bg-amber-500',
  break: 'bg-neutral-400',
  commitment: 'bg-fuchsia-500',
  free: 'bg-sky-300',
  sleep: 'bg-indigo-300',
}

const priorityTokens: Record<Priority, string> = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  low: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
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
}: {
  icon: LucideIcon
  value: number
  label: string
}) {
  return (
    <div className="rounded-lg bg-muted p-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-primary" aria-hidden="true" />
      <p className="mt-1 text-lg font-semibold leading-none">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const userId = user?.id
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
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
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
  const focusWindow = settings
    ? `${settings.preferred_study_start}–${settings.preferred_study_end}`
    : null
  const needsCheckin = !wellbeing || wellbeing.energy == null

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what today has in store.
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          {format(new Date(), 'EEEE, MMM d')}
        </p>
      </header>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle>Today at a glance</CardTitle>
            <CardDescription>{balanceLabel}</CardDescription>
          </div>
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={balance} className="h-2.5" />
          <div className="grid grid-cols-3 gap-2">
            <StatTile icon={CalendarDays} value={blocks.length} label="blocks planned" />
            <StatTile icon={ListTodo} value={openTasks?.length ?? 0} label="tasks open" />
            <StatTile icon={Flame} value={habits.length} label="active habits" />
          </div>
          {focusWindow && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Preferred focus window {focusWindow}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next up</CardTitle>
          <CardDescription>Your plan for today</CardDescription>
        </CardHeader>
        <CardContent>
          {blocks.length === 0 ? (
            <EmptyState
              title="Nothing planned yet"
              description="Head to the planner and shape your day."
              action={
                <Button asChild size="sm">
                  <Link to="/planner">Open planner</Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {blocks.map((block) => (
                <li
                  key={block.id}
                  className={cn('flex items-center gap-3', block.completed && 'opacity-60')}
                >
                  <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">
                    {format(new Date(block.start_at), 'HH:mm')}
                  </span>
                  <span
                    className={cn(
                      'h-8 w-1 shrink-0 rounded-full',
                      blockColors[block.block_type] ?? 'bg-neutral-400',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm font-medium',
                        block.completed && 'line-through',
                      )}
                    >
                      {block.title}
                    </span>
                  </span>
                  {block.completed && (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming deadlines</CardTitle>
          <CardDescription>Worth keeping an eye on</CardDescription>
        </CardHeader>
        <CardContent>
          {deadlines.length === 0 ? (
            <EmptyState title="No deadlines on the horizon. Enjoy the calm." />
          ) : (
            <ul className="space-y-2">
              {deadlines.slice(0, 5).map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(task.deadline), 'EEE, MMM d')}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn('shrink-0 capitalize', priorityTokens[task.priority])}
                  >
                    {task.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
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
                    className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium"
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
            <CardTitle>Wellbeing check-in</CardTitle>
            <CardDescription>A moment for you</CardDescription>
          </CardHeader>
          <CardContent>
            {needsCheckin ? (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <Heart className="h-6 w-6 text-primary" aria-hidden="true" />
                <p className="text-sm">How are you feeling today?</p>
                <Button asChild size="sm">
                  <Link to="/wellbeing">Check in</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-lg font-semibold leading-none">{wellbeing.energy}/10</p>
                  <p className="mt-1 text-xs text-muted-foreground">energy</p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-lg font-semibold leading-none">{wellbeing.stress ?? '-'}/10</p>
                  <p className="mt-1 text-xs text-muted-foreground">stress</p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-lg font-semibold leading-none">{wellbeing.sleep_hours ?? '-'}h</p>
                  <p className="mt-1 text-xs text-muted-foreground">sleep</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}