import { Navigate, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  BookOpenCheck,
  CalendarRange,
  CheckSquare,
  Clock,
  Flag,
  RefreshCw,
  Repeat,
  type LucideIcon,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useNotifications } from '@/hooks/queries'
import { useNotificationMutations } from '@/hooks/mutations'
import { useDeadlineNotifications } from '@/hooks/use-deadline-notifications'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/common/states'
import { NotificationItem } from '@/components/common/notification-item'
import { notificationRoute } from '@/lib/navigation'
import { cn, formatError } from '@/lib/utils'
import type {
  AppNotification,
  DeadlineReminder,
  DeadlineReminderKind,
  DeadlineUrgency,
} from '@/types/models'

const KIND_ICONS: Record<DeadlineReminderKind, LucideIcon> = {
  task: CheckSquare,
  habit: Repeat,
  block: CalendarRange,
  event: Flag,
}

const URGENCY_STYLE: Record<
  DeadlineUrgency,
  { label: string; badge: BadgeProps['variant']; text: string }
> = {
  overdue: { label: 'Overdue', badge: 'destructive', text: 'text-red-700 dark:text-red-400' },
  'due-today': { label: 'Due today', badge: 'warn', text: 'text-amber-700 dark:text-amber-400' },
  'due-tomorrow': { label: 'Due tomorrow', badge: 'outline', text: 'text-muted-foreground' },
  upcoming: { label: 'Upcoming', badge: 'secondary', text: 'text-muted-foreground' },
}

function sortDeadlines(reminders: DeadlineReminder[]): DeadlineReminder[] {
  const urgencyOrder: Record<DeadlineUrgency, number> = {
    overdue: 0,
    'due-today': 1,
    'due-tomorrow': 2,
    upcoming: 3,
  }
  return [...reminders].sort(
    (a, b) =>
      urgencyOrder[a.urgency] - urgencyOrder[b.urgency] ||
      new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
  )
}

function DeadlinesSection({
  reminders,
  loading,
  error,
  onRetry,
}: {
  reminders: DeadlineReminder[]
  loading: boolean
  error: unknown | null
  onRetry: () => void
}) {
  const sorted = sortDeadlines(reminders)
  const overdueCount = sorted.filter((reminder) => reminder.urgency === 'overdue').length

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpenCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Deadlines
          </CardTitle>
          <CardDescription>What's due in the next couple of days.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {overdueCount > 0 && (
            <Badge variant="destructive" className="shrink-0">
              {overdueCount > 1 ? `${overdueCount} overdue` : '1 overdue'}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onRetry}
            disabled={loading}
            title="Refresh deadlines"
            aria-label="Refresh deadlines"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error ? (
          <div className="p-6">
            <ErrorState message={formatError(error)} onRetry={onRetry} />
          </div>
        ) : sorted.length === 0 ? (
          loading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={<Clock className="h-6 w-6" aria-hidden="true" />}
                title="No deadlines on the horizon"
                description="Enjoy the calm — or add a task to get ahead."
              />
            </div>
          )
        ) : (
          <ul className="divide-y">
            {sorted.map((reminder) => {
              const config = URGENCY_STYLE[reminder.urgency]
              const KindIcon = KIND_ICONS[reminder.kind]
              const Icon = reminder.urgency === 'overdue' ? AlertTriangle : KindIcon
              return (
                <li
                  key={`${reminder.kind}-${reminder.id}`}
                  className={cn(
                    'flex items-center justify-between gap-3 px-4 py-3',
                    reminder.urgency === 'overdue' && 'bg-destructive/5',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        'shrink-0 text-muted-foreground',
                        reminder.urgency === 'overdue' && 'text-red-700 dark:text-red-400',
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'truncate text-sm font-medium',
                          reminder.urgency === 'overdue' && 'text-red-700 dark:text-red-400',
                        )}
                      >
                        {reminder.title}
                      </p>
                      <p className={cn('text-xs', config.text)}>
                        {format(parseISO(reminder.due_at), 'EEE, MMM d · h:mm a')}
                      </p>
                    </div>
                  </div>
                  <Badge variant={config.badge} className="shrink-0">
                    {config.label}
                  </Badge>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export default function NotificationsPage() {
  const { user, loading } = useAuth()
  const userId = user?.id
  const navigate = useNavigate()
  const { data: notifications, error, refetch } = useNotifications(userId ?? '')
  const nm = useNotificationMutations(userId ?? '')
  const {
    reminders,
    loading: deadlinesLoading,
    error: deadlinesError,
    runDeadlineScan,
  } = useDeadlineNotifications(userId ?? '')

  if (loading) {
    return (
      <div className="stagger-fade mx-auto max-w-3xl space-y-6 px-4 py-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }
  if (!user) return <Navigate to="/auth/sign-in" replace />

  const list = notifications ?? []
  const unreadCount = list.filter((notification) => !notification.read).length

  const markAllRead = () => {
    nm.markAllRead.mutate(
      {},
      {
        onSuccess: () => toast.success('All caught up.'),
        onError: (error) => toast.error(formatError(error)),
      },
    )
  }

  const handleItemClick = (notification: AppNotification) => {
    if (!notification.read) nm.markRead.mutate({ id: notification.id })
  }

  const handleItemNavigate = (notification: AppNotification) => {
    const route = notificationRoute(notification.type)
    if (route) navigate(route)
  }

  const handleRefreshDeadlines = () => {
    void runDeadlineScan()
  }

  return (
    <div className="stagger-fade mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your gentle nudges, in one place.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
          Mark all read
        </Button>
      </div>

      <DeadlinesSection
        reminders={reminders}
        loading={deadlinesLoading}
        error={deadlinesError}
        onRetry={handleRefreshDeadlines}
      />

      {error ? (
        <ErrorState message={formatError(error)} onRetry={() => void refetch()} />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-lg">Recent</CardTitle>
              <CardDescription>A quiet stream of what matters.</CardDescription>
            </div>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="shrink-0">
                {unreadCount} unread
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {list.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<Bell className="h-6 w-6" aria-hidden="true" />}
                  title="No notifications yet"
                  description="You are all caught up. Enjoy the quiet."
                />
              </div>
            ) : (
              <ul className="divide-y">
                {list.map((notification) => (
                  <li key={notification.id}>
                    <NotificationItem
                      notification={notification}
                      onClick={handleItemClick}
                      onNavigate={handleItemNavigate}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}