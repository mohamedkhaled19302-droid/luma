import { addDays, startOfDay } from 'date-fns'
import type {
  CalendarEvent,
  ScheduleBlock,
  BlockType,
  Habit,
  Task,
} from '@/types/models'
import type {
  SchedulerHabit,
  SchedulerInput,
  SchedulerResult,
  SchedulerTask,
} from '@/scheduler/types'
import { runScheduler } from '@/scheduler/engine'
import { computeDayBalance } from '@/scheduler/balance'
import { calculateDeadlinePressure, type CapacityProvider } from '@/scheduler/pressure'
import { formatDayKey } from '@/scheduler/time'
import { listOpenTasks } from './task-service'
import { listEventsBetween } from './event-service'
import { listBlocksForDay, listBlocksBetween, createBlocksBulk, deleteBlock, upsertDailyPlan } from './block-service'
import { listHabits, listAllHabitLogs } from './habit-service'
import { addTaskSession, updateTask } from './task-service'
import { listCheckins } from './wellbeing-service'
import { getSettings } from './settings-service'
import { timeStringToMinutes } from '@/scheduler/time'

const EVENT_BLOCK_TYPE: Record<CalendarEvent['event_type'], BlockType> = {
  fixed: 'fixed',
  appointment: 'appointment',
  milestone: 'fixed',
  other: 'free',
}

export interface SchedulerRemoteResult {
  result: SchedulerResult
  blocks: ScheduleBlock[]
}

export async function buildSchedulerInput(
  userId: string,
  from: Date,
  to: Date,
): Promise<SchedulerInput> {
  const [settings, tasks, events, existingBlocks, habits, checkins] = await Promise.all([
    getSettings(userId),
    listOpenTasks(userId),
    listEventsBetween(userId, from.toISOString(), to.toISOString()),
    listBlocksBetween(userId, from.toISOString(), to.toISOString()),
    listHabits(userId, true),
    listCheckins(userId, formatDayKey(from), formatDayKey(addDays(to, -1))),
  ])

  const today = formatDayKey(new Date())
  const now = new Date()

  const taskItems: SchedulerTask[] = tasks.map((task: Task) => ({
    id: task.id,
    category_id: task.category_id,
    title: task.title,
    priority: task.priority,
    difficulty: task.difficulty,
    remaining_minutes: task.remaining_minutes,
    deadline: task.deadline,
    can_split: task.can_split,
  }))

  const fixed: SchedulerInput['fixed'] = [
    ...events.map((event: CalendarEvent) => ({
      id: event.id,
      title: event.title,
      start: new Date(event.start_at),
      end: new Date(event.end_at),
      block_type: EVENT_BLOCK_TYPE[event.event_type] ?? 'fixed',
    })),
    ...existingBlocks
      .filter((b) => b.locked || b.completed || b.skipped)
      .map((b) => ({
        id: b.id,
        title: b.title,
        start: new Date(b.start_at),
        end: new Date(b.end_at),
        block_type: b.block_type,
      })),
  ]

  const weekStart = startOfDay(new Date())
  const habitItems: SchedulerHabit[] = await buildSchedulerHabits(userId, habits, weekStart)

  const energyByDay = new Map<string, number>()
  for (const checkin of checkins) {
    if (checkin.energy != null) energyByDay.set(checkin.checkin_date, checkin.energy)
  }
  const recentCheckins = checkins.filter((c) => c.energy != null).slice(-7)
  const typicalEnergy =
    recentCheckins.length > 0
      ? Math.round(recentCheckins.reduce((s, c) => s + (c.energy ?? 0), 0) / recentCheckins.length)
      : null

  return {
    startAt: from,
    endAt: to,
    tasks: taskItems,
    habits: habitItems,
    fixed,
    settings: {
      awakeStart: settings.wake_time ?? '07:00',
      awakeEnd: settings.bed_time ?? '23:00',
      preferredStart: settings.focus_start,
      preferredEnd: settings.focus_end,
      breakEveryMinutes: settings.break_every_minutes,
      breakMinutes: settings.break_minutes,
      maxSessionMinutes: settings.max_session_minutes,
      sleepTargetHours: settings.sleep_target_hours,
      energyPref: settings.energy_pref,
    },
    energyByDay,
    typicalEnergy,
    today,
    now,
  }
}

async function buildSchedulerHabits(
  userId: string,
  habits: Habit[],
  weekStart: Date,
): Promise<SchedulerHabit[]> {
  const weekEnd = addDays(weekStart, 7)
  const logs = await listAllHabitLogs(userId, formatDayKey(weekStart), formatDayKey(weekEnd))
  const doneCount = new Map<string, number>()
  for (const log of logs) {
    if (log.completed) doneCount.set(log.habit_id, (doneCount.get(log.habit_id) ?? 0) + 1)
  }
  return habits.map((habit: Habit) => ({
    id: habit.id,
    name: habit.name,
    frequency: habit.frequency,
    target_per_week: habit.target_per_week,
    preferred_time: habit.preferred_time,
    color: habit.color,
    estimated_minutes: habit.estimated_minutes ?? 30,
    days_done_this_week: doneCount.get(habit.id) ?? 0,
  }))
}

export async function runScheduleAndPersist(
  userId: string,
  from: Date,
  to: Date,
): Promise<SchedulerRemoteResult> {
  const plan = await planForRange(userId, from, to)
  return persistPlan(userId, from, to, plan)
}

export interface GeneratedPlan {
  input: SchedulerInput
  result: SchedulerResult
  existing: ScheduleBlock[]
  preserved: ScheduleBlock[]
}

/** Compute a proposed plan without touching the database (dry run). */
export async function planForRange(
  userId: string,
  from: Date,
  to: Date,
): Promise<GeneratedPlan> {
  const input = await buildSchedulerInput(userId, from, to)
  const result = runScheduler(input)
  const existing = await listBlocksBetween(userId, from.toISOString(), to.toISOString())
  const preserved = existing.filter((b) => b.locked || b.completed || b.skipped)
  return { input, result, existing, preserved }
}

/** Apply a previously computed plan to the database. */
export async function persistPlan(
  userId: string,
  from: Date,
  to: Date,
  plan: GeneratedPlan,
): Promise<SchedulerRemoteResult> {
  const { input, result } = plan

  const existing = plan.existing
  for (const block of existing) {
    if (block.locked || block.completed || block.skipped) continue
    await deleteBlock(block.id)
  }

  const kept = existing.filter(
    (b) => b.locked || b.completed || b.skipped,
  )

  const newBlocks = result.blocks.filter(
    (b) => new Date(b.start_at).getTime() >= from.getTime() && new Date(b.start_at).getTime() < to.getTime(),
  )

  const inserts = newBlocks.map((block) => ({
    plan_date: formatDayKey(new Date(block.start_at)),
    block_type: block.block_type,
    title: block.title,
    task_id: block.task_id,
    event_id: null,
    habit_id: block.habit_id,
    start_at: block.start_at,
    end_at: block.end_at,
    locked: false,
    completed: false,
    skipped: false,
    note: null,
    color: block.color,
  }))

  const created = await createBlocksBulk(userId, inserts)

  for (const session of result.sessions) {
    await addTaskSession({
      task_id: session.task_id,
      user_id: userId,
      start_at: session.start_at,
      end_at: session.end_at,
      duration_minutes: session.duration_minutes,
      completed: false,
    })
  }

  for (const update of result.taskUpdates) {
    await updateTask(update.task_id, {
      scheduled_start: update.scheduled_start,
      scheduled_end: update.scheduled_end,
    })
  }

  const allKept = [...kept, ...created]
  const dayKeys = new Set<string>()

  let cursor = from
  while (cursor.getTime() < to.getTime()) {
    dayKeys.add(formatDayKey(cursor))
    cursor = addDays(cursor, 1)
  }

  const capacity = buildCapacityProvider(input)
  const pressure = calculateDeadlinePressure({
    tasks: input.tasks,
    capacity,
    now: input.now,
  })

  for (const dayKey of dayKeys) {
    const blocks = allKept.filter((b) => b.plan_date === dayKey)
    const overloadedOnThatDay = pressure.overloading.some(
      (item) => formatDayKey(item.deadline) === dayKey,
    )
    const balance = computeDayBalance({
      blocks,
      sleepTargetHours: input.settings.sleepTargetHours,
      preferredStart: input.settings.preferredStart,
      preferredEnd: input.settings.preferredEnd,
      deadlinePressureOverloaded: pressure.overallOverloaded || overloadedOnThatDay,
      habitsTotal: input.habits.length,
    })
    await upsertDailyPlan(userId, { plan_date: dayKey, balance_score: balance })
  }

  return { result, blocks: allKept }
}

export function buildCapacityProvider(
  input: SchedulerInput,
): CapacityProvider {
  const { fixed, settings } = input
  return {
    freeMinutesBetween(start: Date, end: Date): number {
      const evtStart = start.getTime()
      const evtEnd = end.getTime()
      let free = 0
      const awakeStartMin = timeStringToMinutes(settings.awakeStart)
      const awakeEndMin = timeStringToMinutes(settings.awakeEnd)

      for (
        let dayStart = startOfDay(start).getTime();
        dayStart < evtEnd;
        dayStart += 24 * 60 * 60 * 1000
      ) {
        const awakeStartMs = dayStart + awakeStartMin * 60000
        const awakeEndMs = dayStart + awakeEndMin * 60000
        const windowStart = Math.max(awakeStartMs, evtStart)
        const windowEnd = Math.min(awakeEndMs, evtEnd)
        if (windowEnd <= windowStart) continue

        const occupied = fixed
          .filter((f) => f.end.getTime() > windowStart && f.start.getTime() < windowEnd)
          .sort((a, b) => a.start.getTime() - b.start.getTime())

        let cursorMs = windowStart
        for (const event of occupied) {
          if (event.start.getTime() > cursorMs) {
            free += Math.min(event.start.getTime(), windowEnd) - cursorMs
          }
          cursorMs = Math.max(cursorMs, event.end.getTime())
        }
        if (cursorMs < windowEnd) free += windowEnd - cursorMs
      }
      return Math.round(free / 60000)
    },
  }
}

export async function calculatePressureFromDb(
  userId: string,
  from: Date,
  to: Date,
): Promise<ReturnType<typeof calculateDeadlinePressure>> {
  const input = await buildSchedulerInput(userId, from, to)
  const capacity = buildCapacityProvider(input)
  return calculateDeadlinePressure({
    tasks: input.tasks,
    capacity,
    now: new Date(),
  })
}

export { listBlocksForDay }