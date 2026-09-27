import { addDays, startOfDay } from 'date-fns'
import type { DeadlineReminder, DeadlineReminderKind, DeadlineUrgency } from '@/types/models'
import { listOpenTasks } from './task-service'
import { listEventsBetween } from './event-service'
import { listBlocksBetween } from './block-service'

export const DEFAULT_DEADLINE_WINDOW_HOURS = 48

const KIND_COLORS: Record<DeadlineReminderKind, string> = {
  task: '#6366f1',
  habit: '#8b5cf6',
  block: '#0ea5e9',
  event: '#f59e0b',
}

export interface DeadlineSource {
  id: string
  title: string
  kind: DeadlineReminderKind
  due_at: string
  color?: string | null
}

export interface DeadlineScanOptions {
  now?: Date
  windowHours?: number
}

export function classifyDeadlineUrgency(due: Date, now: Date): DeadlineUrgency {
  if (due.getTime() <= now.getTime()) return 'overdue'
  const endOfToday = addDays(startOfDay(now), 1)
  if (due.getTime() < endOfToday.getTime()) return 'due-today'
  const endOfTomorrow = addDays(startOfDay(now), 2)
  if (due.getTime() < endOfTomorrow.getTime()) return 'due-tomorrow'
  return 'upcoming'
}

export function buildDeadlineReminder(
  source: DeadlineSource,
  now: Date,
): DeadlineReminder | null {
  const due = new Date(source.due_at)
  if (Number.isNaN(due.getTime())) return null
  return {
    id: source.id,
    title: source.title,
    kind: source.kind,
    due_at: source.due_at,
    urgency: classifyDeadlineUrgency(due, now),
    color: source.color ?? KIND_COLORS[source.kind],
  }
}

export function scanDeadlines(
  sources: DeadlineSource[],
  options: DeadlineScanOptions = {},
): DeadlineReminder[] {
  const now = options.now ?? new Date()
  const windowHours = options.windowHours ?? DEFAULT_DEADLINE_WINDOW_HOURS
  const endMs = now.getTime() + windowHours * 60 * 60 * 1000

  return sources
    .map((source) => buildDeadlineReminder(source, now))
    .filter((reminder) => reminder != null)
    .filter((reminder) => new Date(reminder.due_at).getTime() <= endMs)
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
}

export function deadlineNotificationKey(reminder: DeadlineReminder): string {
  return `deadline:${reminder.kind}:${reminder.id}:${reminder.urgency}`
}

export function selectUnsentDeadlineReminders(
  reminders: DeadlineReminder[],
  sentKeys: ReadonlySet<string> | string[],
): DeadlineReminder[] {
  const sent = Array.isArray(sentKeys) ? new Set(sentKeys) : sentKeys
  return reminders.filter((reminder) => !sent.has(deadlineNotificationKey(reminder)))
}

export async function collectDeadlineSources(
  userId: string,
  now: Date,
  windowHours: number,
): Promise<DeadlineSource[]> {
  const nowMs = now.getTime()
  const endMs = nowMs + windowHours * 60 * 60 * 1000
  const from = new Date(nowMs - 48 * 60 * 60 * 1000).toISOString()
  const to = new Date(endMs + 24 * 60 * 60 * 1000).toISOString()

  const [tasks, events, blocks] = await Promise.all([
    listOpenTasks(userId),
    listEventsBetween(userId, from, to),
    listBlocksBetween(userId, from, to),
  ])

  const taskDeadlines = new Map<string, string>()
  const sources: DeadlineSource[] = []

  for (const task of tasks) {
    if (!task.deadline) continue
    taskDeadlines.set(task.id, task.deadline)
    sources.push({ id: task.id, title: task.title, kind: 'task', due_at: task.deadline })
  }

  for (const event of events) {
    if (event.event_type !== 'milestone') continue
    if (new Date(event.start_at).getTime() <= nowMs) continue
    sources.push({ id: event.id, title: event.title, kind: 'event', due_at: event.start_at, color: event.color })
  }

  for (const block of blocks) {
    if (block.completed || block.skipped) continue
    const dueMs = new Date(block.end_at).getTime()
    if (dueMs <= nowMs || dueMs > endMs) continue
    if (block.habit_id != null) {
      sources.push({ id: block.id, title: block.title, kind: 'habit', due_at: block.end_at, color: block.color })
    } else if (block.task_id != null && !taskDeadlines.has(block.task_id)) {
      sources.push({ id: block.id, title: block.title, kind: 'block', due_at: block.end_at, color: block.color })
    }
  }

  return sources
}

export async function scanDeadlineReminders(
  userId: string,
  options: DeadlineScanOptions = {},
): Promise<DeadlineReminder[]> {
  const now = options.now ?? new Date()
  const windowHours = options.windowHours ?? DEFAULT_DEADLINE_WINDOW_HOURS
  const sources = await collectDeadlineSources(userId, now, windowHours)
  return scanDeadlines(sources, { now, windowHours })
}