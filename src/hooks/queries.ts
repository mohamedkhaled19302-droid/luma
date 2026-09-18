import { useQuery } from '@tanstack/react-query'
import {
  listOpenTasks,
  listTasks,
  listTasksDueBefore,
  listRecentlyCompletedTasks,
  totalCompletedMinutes,
} from '@/services/task-service'
import { listSubjects } from '@/services/subject-service'
import { listHabits, listAllHabitLogs } from '@/services/habit-service'
import { getSettings } from '@/services/settings-service'
import { listEventsBetween } from '@/services/event-service'
import { listBlocksForDay, listBlocksBetween, getDailyPlan } from '@/services/block-service'
import { getProfile } from '@/services/profile-service'
import { getCheckin, listCheckins } from '@/services/wellbeing-service'
import { listGoals } from '@/services/goal-service'
import {
  listNotifications,
  countUnreadNotifications,
} from '@/services/notification-service'
import { getDashboardSummary } from '@/services/dashboard-service'
import { calculatePressureFromDb } from '@/services/scheduling-service'
import { formatDayKey } from '@/scheduler/time'
import { addDays, startOfDay } from 'date-fns'

const RETRY = 2

export function useProfile(userId: string) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: () => getProfile(userId),
    staleTime: 60_000,
    retry: RETRY,
  })
}

export function useSubjects(userId: string) {
  return useQuery({
    queryKey: ['subjects', userId],
    queryFn: () => listSubjects(userId),
    staleTime: 60_000,
    retry: RETRY,
  })
}

export function useTasks(userId: string) {
  return useQuery({
    queryKey: ['tasks', userId],
    queryFn: () => listTasks(userId),
    staleTime: 30_000,
    retry: RETRY,
  })
}

export function useOpenTasks(userId: string) {
  return useQuery({
    queryKey: ['tasks', 'open', userId],
    queryFn: () => listOpenTasks(userId),
    staleTime: 30_000,
    retry: RETRY,
  })
}

export function useTasksDueBefore(userId: string, before: string) {
  return useQuery({
    queryKey: ['tasks', 'due', userId, before],
    queryFn: () => listTasksDueBefore(userId, before),
    staleTime: 60_000,
    retry: RETRY,
  })
}

export function useRecentlyCompletedTasks(userId: string, after: string) {
  return useQuery({
    queryKey: ['tasks', 'recent', userId, after],
    queryFn: () => listRecentlyCompletedTasks(userId, after),
    staleTime: 60_000,
    retry: RETRY,
  })
}

export function useTotalCompletedMinutes(userId: string, from: string, to: string) {
  return useQuery({
    queryKey: ['sessions', 'completed', userId, from, to],
    queryFn: () => totalCompletedMinutes(userId, from, to),
    staleTime: 60_000,
    retry: RETRY,
  })
}

export function useHabits(userId: string, activeOnly = false) {
  return useQuery({
    queryKey: ['habits', userId, activeOnly],
    queryFn: () => listHabits(userId, activeOnly),
    staleTime: 30_000,
    retry: RETRY,
  })
}

export function useHabitLogs(userId: string, from: string, to: string) {
  return useQuery({
    queryKey: ['habit-logs', userId, from, to],
    queryFn: () => listAllHabitLogs(userId, from, to),
    staleTime: 30_000,
    retry: RETRY,
  })
}

export function useSettings(userId: string) {
  return useQuery({
    queryKey: ['settings', userId],
    queryFn: () => getSettings(userId),
    staleTime: 60_000,
    retry: RETRY,
  })
}

export function useEvents(userId: string, from: Date, to: Date) {
  return useQuery({
    queryKey: ['events', userId, from.toISOString(), to.toISOString()],
    queryFn: () => listEventsBetween(userId, from.toISOString(), to.toISOString()),
    staleTime: 30_000,
    retry: RETRY,
  })
}

export function useBlocksForDay(userId: string, date: Date) {
  const dayKey = formatDayKey(date)
  return useQuery({
    queryKey: ['blocks', userId, dayKey],
    queryFn: () => listBlocksForDay(userId, dayKey),
    staleTime: 30_000,
    retry: RETRY,
  })
}

export function useBlocksBetween(userId: string, from: Date, to: Date) {
  return useQuery({
    queryKey: ['blocks', 'range', userId, from.toISOString(), to.toISOString()],
    queryFn: () => listBlocksBetween(userId, from.toISOString(), to.toISOString()),
    staleTime: 30_000,
    retry: RETRY,
  })
}

export function useDailyPlan(userId: string, date: Date) {
  return useQuery({
    queryKey: ['daily-plan', userId, formatDayKey(date)],
    queryFn: () => getDailyPlan(userId, formatDayKey(date)),
    staleTime: 60_000,
    retry: RETRY,
  })
}

export function useWellbeing(userId: string, date: Date) {
  return useQuery({
    queryKey: ['wellbeing', userId, formatDayKey(date)],
    queryFn: () => getCheckin(userId, formatDayKey(date)),
    staleTime: 30_000,
    retry: RETRY,
  })
}

export function useWellbeingRange(userId: string, from: Date, to: Date) {
  return useQuery({
    queryKey: ['wellbeing', 'range', userId, formatDayKey(from), formatDayKey(to)],
    queryFn: () => listCheckins(userId, formatDayKey(from), formatDayKey(to)),
    staleTime: 60_000,
    retry: RETRY,
  })
}

export function useGoals(userId: string) {
  return useQuery({
    queryKey: ['goals', userId],
    queryFn: () => listGoals(userId),
    staleTime: 60_000,
    retry: RETRY,
  })
}

export function useNotifications(userId: string) {
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: () => listNotifications(userId),
    staleTime: 15_000,
    retry: RETRY,
  })
}

export function useUnreadCount(userId: string) {
  return useQuery({
    queryKey: ['notifications', 'unread', userId],
    queryFn: () => countUnreadNotifications(userId),
    staleTime: 15_000,
    retry: RETRY,
  })
}

export function useDashboardSummary(userId: string) {
  return useQuery({
    queryKey: ['dashboard-summary', userId],
    queryFn: () => getDashboardSummary(userId),
    staleTime: 15_000,
    retry: RETRY,
  })
}

export function useDeadlinePressure(userId: string) {
  return useQuery({
    queryKey: ['pressure', userId],
    queryFn: () => calculatePressureFromDb(userId, startOfDay(new Date()), addDays(new Date(), 14)),
    staleTime: 60_000,
    retry: RETRY,
  })
}

export function useHabitLogsToday(userId: string, date: Date) {
  const today = formatDayKey(date)
  return useQuery({
    queryKey: ['habit-logs', userId, today, today],
    queryFn: () => listAllHabitLogs(userId, today, today),
    staleTime: 30_000,
    retry: RETRY,
  })
}