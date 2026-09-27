import { Navigate } from 'react-router-dom'
import { addDays, endOfDay, startOfDay, subDays } from 'date-fns'
import {
  CalendarDays,
  CircleCheck,
  CircleX,
  Lightbulb,
  ListTodo,
  Sparkles,
  Timer,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useBlocksBetween,
  useHabitLogs,
  useTasks,
  useTotalCompletedMinutes,
  useWellbeingRange,
} from '@/hooks/queries'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/states'
import { formatError } from '@/lib/utils'

interface Insight {
  icon: LucideIcon
  text: string
}

type TrendVariant = 'success' | 'warn' | 'destructive' | 'secondary'

interface Stat {
  icon: LucideIcon
  label: string
  value: string
  progress?: number
  trend?: { label: string; variant: TrendVariant }
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`
  if (hours > 0) return `${hours}h`
  return `${mins}m`
}

function StatCard({ icon: Icon, label, value, progress, trend }: Stat) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        </span>
        <div className="flex flex-col items-end gap-1.5">
          <p className="text-lg font-semibold leading-none">{value}</p>
          {trend && <Badge variant={trend.variant}>{trend.label}</Badge>}
        </div>
      </div>
      <p className="mt-2.5 text-xs text-muted-foreground">{label}</p>
      {progress != null && <Progress value={progress} className="mt-3" aria-label={`${label} progress`} />}
    </div>
  )
}

export default function InsightsPage() {
  const { user, loading } = useAuth()
  const userId = user?.id

  const today = new Date()
  const weekStart = startOfDay(subDays(today, 6))
  const weekEnd = endOfDay(today)
  const midnightEnd = addDays(startOfDay(today), 1)
  const fromISO = weekStart.toISOString()
  const toISO = midnightEnd.toISOString()

  const {
    data: tasks,
    isLoading: tasksLoading,
    error: tasksError,
    refetch: refetchTasks,
  } = useTasks(userId ?? '')
  const {
    data: focusMinutes,
    isLoading: focusLoading,
    error: focusError,
    refetch: refetchFocus,
  } = useTotalCompletedMinutes(userId ?? '', fromISO, toISO)
  const {
    data: blocks,
    isLoading: blocksLoading,
    error: blocksError,
    refetch: refetchBlocks,
  } = useBlocksBetween(userId ?? '', weekStart, weekEnd)
  const {
    data: checkins,
    isLoading: wellbeingLoading,
    error: wellbeingError,
    refetch: refetchWellbeing,
  } = useWellbeingRange(userId ?? '', weekStart, weekEnd)
  const {
    data: habitLogs,
    isLoading: habitsLoading,
    error: habitsError,
    refetch: refetchHabits,
  } = useHabitLogs(userId ?? '', fromISO, toISO)

  if (loading) {
    return (
      <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-56 w-full" />
      </div>
    )
  }
  if (!user) return <Navigate to="/auth/sign-in" replace />

  if (tasksLoading || focusLoading || blocksLoading || wellbeingLoading || habitsLoading) {
    return (
      <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const queryError = tasksError ?? focusError ?? blocksError ?? wellbeingError ?? habitsError
  if (queryError) {
    return (
      <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
        <ErrorState
          message={formatError(queryError)}
          onRetry={() => {
            void refetchTasks()
            void refetchFocus()
            void refetchBlocks()
            void refetchWellbeing()
            void refetchHabits()
          }}
        />
      </div>
    )
  }

  const taskList = tasks ?? []
  const openCount = taskList.filter(
    (task) => task.status === 'todo' || task.status === 'in_progress',
  ).length
  const completedThisWeek = taskList.filter((task) => {
    if (task.status !== 'done' || !task.completed_at) return false
    const completedAt = new Date(task.completed_at).getTime()
    return completedAt >= weekStart.getTime() && completedAt < midnightEnd.getTime()
  }).length
  const missedCount = taskList.filter((task) => task.status === 'missed').length

  const totalFocus = focusMinutes ?? 0
  const focusLabel = formatMinutes(totalFocus)

  const blockList = blocks ?? []
  const blockCounts: Record<string, number> = {}
  for (const block of blockList) {
    blockCounts[block.block_type] = (blockCounts[block.block_type] ?? 0) + 1
  }
  const totalBlocks = blockList.length
  const studyBlocks = (blockCounts.study ?? 0) + (blockCounts.task ?? 0)
  const studyPercent = totalBlocks > 0 ? studyBlocks / totalBlocks : 0
  const avgBlocksPerDay = totalBlocks / 7

  const energies = (checkins ?? [])
    .map((checkin) => checkin.energy)
    .filter((value): value is number => value != null)
  const avgEnergy =
    energies.length > 0 ? energies.reduce((sum, value) => sum + value, 0) / energies.length : 0

  const logs = habitLogs ?? []
  const completedLogs = logs.filter((log) => log.completed).length
  const habitRate = logs.length > 0 ? completedLogs / logs.length : 0

  const focusTrend: Stat['trend'] =
    totalFocus > 0
      ? {
          label: totalFocus >= 60 ? 'on pace' : 'warming up',
          variant: totalFocus >= 60 ? 'success' : 'warn',
        }
      : undefined

  const energyTrend: Stat['trend'] =
    avgEnergy > 0
      ? {
          label: avgEnergy >= 6.5 ? 'steady' : avgEnergy >= 5 ? 'okay' : 'drained',
          variant: avgEnergy >= 6.5 ? 'success' : avgEnergy >= 5 ? 'warn' : 'destructive',
        }
      : undefined

  const habitTrend: Stat['trend'] =
    logs.length > 0
      ? {
          label: habitRate >= 0.6 ? 'on track' : habitRate >= 0.4 ? 'steady' : 'off pace',
          variant: habitRate >= 0.6 ? 'success' : habitRate >= 0.4 ? 'warn' : 'destructive',
        }
      : undefined

  const stats: Stat[] = [
    { icon: Timer, label: 'Focus time this week', value: focusLabel, trend: focusTrend },
    {
      icon: Zap,
      label: 'Average energy',
      value: avgEnergy > 0 ? `${avgEnergy.toFixed(1)}/10` : '—',
      trend: energyTrend,
    },
    {
      icon: TrendingUp,
      label: 'Habit completion',
      value: logs.length > 0 ? `${Math.round(habitRate * 100)}%` : '—',
      progress: habitRate * 100,
      trend: habitTrend,
    },
    { icon: CalendarDays, label: 'Blocks planned', value: String(totalBlocks) },
    { icon: CircleCheck, label: 'Tasks completed', value: String(completedThisWeek) },
    {
      icon: CircleX,
      label: 'Tasks missed',
      value: String(missedCount),
      trend:
        missedCount > 0
          ? { label: `${missedCount} missed`, variant: 'destructive' }
          : { label: 'all clear', variant: 'success' },
    },
  ]

  const insights: Insight[] = []

  if (totalFocus > 0) {
    insights.push({
      icon: Timer,
      text: `You focused for ${focusLabel} this week. Every minute compounds.`,
    })
  } else {
    insights.push({
      icon: Timer,
      text: 'No focused sessions yet this week. A 25-minute block is the perfect start.',
    })
  }

  if (avgEnergy > 0) {
    insights.push(
      avgEnergy < 5
        ? {
            icon: Zap,
            text: 'Your average energy has dipped this week. An earlier bedtime is worth trying.',
          }
        : {
            icon: Zap,
            text: `Energy averaged ${avgEnergy.toFixed(1)}/10. Whatever is fueling that, protect it.`,
          },
    )
  } else {
    insights.push({
      icon: Zap,
      text: 'Check in daily and your energy patterns will start to reveal themselves.',
    })
  }

  if (logs.length > 0) {
    insights.push(
      habitRate < 0.5
        ? {
            icon: Sparkles,
            text: 'Smaller habits, bigger wins — try 10-minute versions of your habits.',
          }
        : {
            icon: Sparkles,
            text: `You kept ${Math.round(habitRate * 100)}% of your habit log. That momentum is gold.`,
          },
    )
  }

  if (totalBlocks > 0) {
    insights.push(
      studyPercent < 0.3
        ? {
            icon: Lightbulb,
            text: 'Your week needs more protected time for deep work.',
          }
        : {
            icon: Lightbulb,
            text: `You averaged ${avgBlocksPerDay.toFixed(1)} blocks a day — ${studyBlocks} of them for study and tasks.`,
          },
    )
  }

  if (openCount > 0) {
    insights.push({
      icon: ListTodo,
      text: `You have ${openCount} open task${openCount === 1 ? '' : 's'}. Start with the lightest one.`,
    })
  }

  const shownInsights = insights.slice(0, 5)

  return (
    <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A quiet read on your week&apos;s rhythm.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="h-4 w-4 text-warning" aria-hidden="true" />
            Gentle insights
          </CardTitle>
          <CardDescription>Signals from your week, nothing more.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {shownInsights.map((insight, index) => {
              const InsightIcon = insight.icon
              return (
                <li
                  key={index}
                  className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3"
                >
                  <InsightIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <p className="text-sm text-foreground/90">{insight.text}</p>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}