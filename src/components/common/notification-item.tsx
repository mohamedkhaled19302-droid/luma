import { formatDistanceToNow } from 'date-fns'
import { Bell, CalendarClock, CheckCircle2, CircleX, Clock, Mail, Repeat } from 'lucide-react'
import type { AppNotification } from '@/types/models'
import { cn } from '@/lib/utils'

const typeIcons: Record<string, { icon: typeof Bell; className: string }> = {
  deadline: { icon: Clock, className: 'text-destructive' },
  task: { icon: CheckCircle2, className: 'text-success' },
  schedule_change: { icon: CalendarClock, className: 'text-warning' },
  missed_task: { icon: CircleX, className: 'text-destructive' },
  habit: { icon: Repeat, className: 'text-violet-500' },
  system: { icon: Bell, className: 'text-muted-foreground' },
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatDistanceToNow(date, { addSuffix: true })
}

export function NotificationItem({
  notification,
  onClick,
  onNavigate,
}: {
  notification: AppNotification
  onClick?: (n: AppNotification) => void
  onNavigate?: (n: AppNotification) => void
}) {
  const config = typeIcons[notification.type] ?? { icon: Bell, className: 'text-muted-foreground' }
  const Icon = config.icon

  return (
    <button
      type="button"
      onClick={() => {
        onClick?.(notification)
        onNavigate?.(notification)
      }}
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
            {formatTimestamp(notification.created_at)}
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
      ) : (
        <Mail className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
      )}
    </button>
  )
}