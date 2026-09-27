import type { DashboardSummary } from '@/types/models'
import { getProfile } from './profile-service'
import { listBlocksForDay, getDailyPlan } from './block-service'
import { listTasks } from './task-service'
import { listHabits } from './habit-service'
import { getCheckin } from './wellbeing-service'
import { formatDayKey } from '@/scheduler/time'

function greetingFor(date: Date, name: string): string {
  const hour = date.getHours()
  if (hour < 5) return `Still up, ${name}?`
  if (hour < 12) return `Good morning, ${name}`
  if (hour < 18) return `Good afternoon, ${name}`
  return `Good evening, ${name}`
}

function getFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const now = new Date()
  const todayKey = formatDayKey(now)

  const [profile, blocks, plan, tasks, habits, checkin] = await Promise.all([
    getProfile(userId),
    listBlocksForDay(userId, todayKey),
    getDailyPlan(userId, todayKey).catch(() => null),
    listTasks(userId),
    listHabits(userId, true),
    getCheckin(userId, todayKey).catch(() => null),
  ])

  const openTasks = tasks.filter((task) => task.status === 'todo' || task.status === 'in_progress')
  const upcomingDeadlines = openTasks
    .filter((task) => task.deadline != null)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())

  const name = getFirstName(profile?.full_name || 'there')

  return {
    greeting: greetingFor(now, name),
    today: {
      date: todayKey,
      blocks: blocks.sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      ),
      balance: plan?.balance_score ?? 50,
    },
    upcomingDeadlines,
    openTasks,
    activeHabits: habits,
    wellbeingToday: checkin,
  }
}