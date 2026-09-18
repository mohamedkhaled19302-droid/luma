import { Navigate } from 'react-router-dom'
import { formatDistanceToNow, parseISO } from 'date-fns'
import {
  Bell,
  CalendarClock,
  CircleX,
  Clock,
  Repeat,
  SquareCheck,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useNotifications } from '@/hooks/queries'
import { useNotificationMutations } from '@/hooks/mutations'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/states'
import { cn, formatError } from '@/lib/utils'

const typeConfig: Record<string, { icon: LucideIcon; className: string }> = {
  deadline: { icon: Clock, className: 'text-red-500' },
  task: { icon: SquareCheck, className: 'text-emerald-500' },
  schedule_change: { icon: CalendarClock, className: 'text-amber-500' },
  missed_task: { icon: CircleX, className: 'text-red-500' },
  habit: { icon: Repeat, className: 'text-violet-500' },
  system: { icon: Bell, className: 'text-muted-foreground' },
}

function timeAgo(value: string): string {
  const date = parseISO(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatDistanceToNow(date, { addSuffix: true })
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const userId = user?.id
  const { data: notifications, isLoading } = useNotifications(userId ?? '')
  const nm = useNotificationMutations(userId ?? '')

  if (!user) return <Navigate to="/auth/sign-in" replace />

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

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

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your gentle nudges, in one place.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={markAllRead} disabled={unreadCount === 0}>
          Mark all read
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent</CardTitle>
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
              {list.map((notification) => {
                const config = typeConfig[notification.type] ?? {
                  icon: Bell,
                  className: 'text-muted-foreground',
                }
                const Icon = config.icon
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => nm.markRead.mutate({ id: notification.id })}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60',
                        !notification.read && 'bg-accent/40',
                      )}
                    >
                      <span className={cn('mt-0.5 shrink-0', config.className)}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {notification.title}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {timeAgo(notification.created_at)}
                          </span>
                        </span>
                        {notification.body ? (
                          <span className="mt-0.5 block text-sm text-muted-foreground">
                            {notification.body}
                          </span>
                        ) : null}
                      </span>
                      {!notification.read ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}