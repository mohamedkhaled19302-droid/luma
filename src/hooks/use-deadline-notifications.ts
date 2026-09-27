import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DeadlineReminder } from '@/types/models'
import {
  DEFAULT_DEADLINE_WINDOW_HOURS,
  deadlineNotificationKey,
  scanDeadlineReminders,
  selectUnsentDeadlineReminders,
} from '@/services/deadline-service'
import {
  createNotification,
  listSentNotificationKeys,
} from '@/services/notification-service'
import { getSettings } from '@/services/settings-service'

const DEFAULT_INTERVAL_MINUTES = 15

const KIND_LABELS: Record<DeadlineReminder['kind'], string> = {
  task: 'Task',
  habit: 'Habit',
  block: 'Scheduled work',
  event: 'Milestone',
}

export interface UseDeadlineNotificationsOptions {
  enabled?: boolean
  intervalMinutes?: number
  windowHours?: number
}

export interface DeadlineNotificationsState {
  reminders: DeadlineReminder[]
  loading: boolean
  error: unknown | null
  runDeadlineScan: () => Promise<void>
}

function formatDueTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'soon'
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function deadlineTitle(reminder: DeadlineReminder): string {
  return `${deadlinePrefix(reminder.urgency)} · ${reminder.title}`
}

export function deadlineBody(reminder: DeadlineReminder): string {
  return `${KIND_LABELS[reminder.kind]} due ${formatDueTime(reminder.due_at)}`
}

function deadlinePrefix(urgency: DeadlineReminder['urgency']): string {
  switch (urgency) {
    case 'overdue':
      return 'Overdue'
    case 'due-today':
      return 'Due today'
    case 'due-tomorrow':
      return 'Due tomorrow'
    default:
      return 'Upcoming'
  }
}

async function sendDeadlineNotifications(
  userId: string,
  reminders: DeadlineReminder[],
): Promise<number> {
  const settings = await getSettings(userId)
  if (!settings.notification_prefs.deadlines) return 0

  const due = reminders.filter(
    (reminder) => reminder.urgency === 'overdue' || reminder.urgency === 'due-today',
  )
  const unsent = selectUnsentDeadlineReminders(due, await listSentNotificationKeys(userId))

  let sent = 0
  for (const reminder of unsent) {
    await createNotification(userId, {
      type: 'deadline',
      title: deadlineTitle(reminder),
      body: deadlineBody(reminder),
      data: {
        kind: reminder.kind,
        id: reminder.id,
        due_at: reminder.due_at,
        urgency: reminder.urgency,
      },
      key: deadlineNotificationKey(reminder),
      deadline_at: reminder.due_at,
    })
    sent += 1
  }
  return sent
}

export function useDeadlineNotifications(
  userId: string,
  options: UseDeadlineNotificationsOptions = {},
): DeadlineNotificationsState {
  const queryClient = useQueryClient()
  const {
    enabled = Boolean(userId),
    intervalMinutes = DEFAULT_INTERVAL_MINUTES,
    windowHours = DEFAULT_DEADLINE_WINDOW_HOURS,
  } = options

  const [reminders, setReminders] = useState<DeadlineReminder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown | null>(null)
  const scanningRef = useRef(false)

  const runDeadlineScan = useCallback(async () => {
    if (!userId || scanningRef.current) return
    scanningRef.current = true
    setLoading(true)
    setError(null)
    try {
      const scanned = await scanDeadlineReminders(userId, { windowHours })
      setReminders(scanned)
      const sent = await sendDeadlineNotifications(userId, scanned)
      if (sent > 0) void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    } catch (err) {
      setError(err)
    } finally {
      scanningRef.current = false
      setLoading(false)
    }
  }, [userId, windowHours, queryClient])

  useEffect(() => {
    if (!enabled) return
    void runDeadlineScan()
    const timer = window.setInterval(() => void runDeadlineScan(), intervalMinutes * 60_000)
    return () => window.clearInterval(timer)
  }, [enabled, intervalMinutes, runDeadlineScan])

  return { reminders, loading, error, runDeadlineScan }
}