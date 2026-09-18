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
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

interface Insight {
  icon: LucideIcon
  text: string
}

interface Stat {
  icon: LucideIcon
  label: string
  value: string
  progress?: number
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`
  if (hours > 0) return `${hours}h`
  return `${mins}m`
}

function StatCard({ icon: Icon, label, value, progress }: Stat) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        </span>
        <p className="text-right text-base font-semibold leading-none">{value}</p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
      {progress != null && <Progress value={progress} className="mt-2" />}
    </div>
  )
}

export default function InsightsPage() {
  const { user } = useAuth()
  const userId = user?.id

  const today = new Date()
  const weekStart = startOfDay(subDays(today, 6))
  const weekEnd = endOfDay(today)
  const midnightEnd = addDays(startOfDay(today), 1)
  const fromISO = weekStart.toISOString()
  const toISO = midnightEnd.toISOString()

  const { data: tasks, isLoading: tasksLoading } = useTasks(userId ?? '')
  const { data: focusMinutes, isLoading: focusLoading } = useTotalCompletedMinutes(
    userId ?? '',
    fromISO,
    toISO,
  )
  const { data: blocks, isLoading: blocksLoading } = useBlocksBetween(userId ?? '', weekStart, weekEnd)
  const { data: checkins, isLoading: wellbeingLoading } = useWellbeingRange(
    userId ?? '',
    weekStart,
    weekEnd,
  )
  const { data: habitLogs, isLoading: habitsLoading } = useHabitLogs(userId ?? '', fromISO, toISO)

  if (!user) return <Navigate to="/auth/sign-in" replace />

  if (tasksLoading || focusLoading || blocksLoading || wellbeingLoading || habitsLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Skeleton className="h-8 w-40" />
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

  const stats: Stat[] = [
    { icon: Timer, label: 'Focus time this week', value: focusLabel },
    {
      icon: Zap,
      label: 'Average energy',
      value: avgEnergy > 0 ? `${avgEnergy.toFixed(1)}/10` : '—',
    },
    {
      icon: TrendingUp,
      label: 'Habit completion',
      value: logs.length > 0 ? `${Math.round(habitRate * 100)}%` : '—',
      progress: habitRate * 100,
    },
    { icon: CalendarDays, label: 'Blocks planned', value: String(totalBlocks) },
    { icon: CircleCheck, label: 'Tasks completed', value: String(completedThisWeek) },
    { icon: CircleX, label: 'Tasks missed', value: String(missedCount) },
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
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
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
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" />
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
                  <InsightIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
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