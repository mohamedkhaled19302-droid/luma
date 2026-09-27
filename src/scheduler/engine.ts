import { addDays, format } from 'date-fns'
import type { BlockType } from '@/types/models'
import {
  MIN_SESSION_MINUTES,
  type PlannedBlock,
  type PlannedSession,
  type PlannedTaskUpdate,
  type SchedulerHabit,
  type SchedulerInput,
  type SchedulerResult,
} from './types'
import {
  computeFreeIntervals,
  formatDayKey,
  intervalsOverlap,
  splitIntervals,
  startOfDay,
  timeStringToMinutes,
  type Interval,
} from './time'
import { slotScore } from './score'

interface PlacedSegment {
  start: number
  end: number
  blockType: BlockType
}

interface DayContext {
  dayKey: string
  dayStartMs: number
  awakeStartMs: number
  awakeEndMs: number
  free: Interval[]
  placed: PlacedSegment[]
  focusMinutes: number
  dailyTargetMinutes: number
}

const FOCUS_BLOCK_TYPES: BlockType[] = ['task', 'focus', 'habit']

function clampChunk(
  remaining: number,
  max: number,
  intervalLenMin: number,
  allowSplit: boolean,
): number {
  const upper = allowSplit ? Math.min(remaining, max, intervalLenMin) : Math.min(remaining, intervalLenMin)
  if (upper < MIN_SESSION_MINUTES) return 0
  return upper
}

/** Length in minutes of the continuous focus run immediately before startMs. */
function focusRunLengthBefore(placed: PlacedSegment[], startMs: number): number {
  const sorted = [...placed].sort((a, b) => a.start - b.start)
  let run = 0
  let cursor = startMs
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const block = sorted[i]
    if (!block) break
    if (block.end === cursor && FOCUS_BLOCK_TYPES.includes(block.blockType)) {
      run += block.end - block.start
      cursor = block.start
    } else if (block.end === cursor && block.blockType === 'break') {
      break
    } else {
      break
    }
  }
  return run / 60000
}

export function runScheduler(input: SchedulerInput): SchedulerResult {
  const {
    startAt,
    endAt,
    tasks,
    habits,
    fixed,
    settings,
    energyByDay,
    typicalEnergy,
    today,
    now,
  } = input

  const blocks: PlannedBlock[] = []
  const sessions: PlannedSession[] = []
  const taskUpdates: PlannedTaskUpdate[] = []
  const overloadDays: string[] = []

  const awakeStartMin = timeStringToMinutes(settings.awakeStart)
  const awakeEndMin = timeStringToMinutes(settings.awakeEnd)

  const workingTasks = tasks
    .filter((t) => t.remaining_minutes > 0)
    .map((t) => ({ ...t, remaining: t.remaining_minutes }))

  const fixedTime = fixed.map((event) => ({
    start: event.start.getTime(),
    end: event.end.getTime(),
  }))

  const dayContexts: DayContext[] = []
  for (let day = startOfDay(startAt); day.getTime() < endAt.getTime(); day = addDays(day, 1)) {
    const dayKey = formatDayKey(day)
    const dayStartMs = day.getTime()
    const dayEndMs = dayStartMs + 86400000

    const occupied: Interval[] = fixedTime.filter((f) =>
      intervalsOverlap(f, { start: dayStartMs, end: dayEndMs }),
    )
    if (dayKey === today) {
      occupied.push({ start: dayStartMs, end: now.getTime() })
    }

    const awakeStartMs = dayStartMs + awakeStartMin * 60000
    const awakeEndMs = dayStartMs + awakeEndMin * 60000
    const free = computeFreeIntervals(occupied, awakeStartMs, awakeEndMs)
    if (free.length === 0) continue

    const totalFreeMinutes = free.reduce((sum, f) => sum + (f.end - f.start) / 60000, 0)
    dayContexts.push({
      dayKey,
      dayStartMs,
      awakeStartMs,
      awakeEndMs,
      free,
      placed: [],
      focusMinutes: 0,
      dailyTargetMinutes: Math.min(420, Math.round(totalFreeMinutes * 0.8)),
    })
  }

  for (const ctx of dayContexts) {
    let free = ctx.free
    const energy = settings.energyPref
      ? (energyByDay.get(ctx.dayKey) ?? typicalEnergy ?? null)
      : null

    let iterations = 0
    const maxIterations = workingTasks.length * (free.length + 4) * 4 + 64

    while (iterations < maxIterations) {
      iterations += 1
      const eligible = workingTasks.filter((t) => t.remaining > 0)
      if (eligible.length === 0) break

      const usableGaps = free.filter((gap) => (gap.end - gap.start) / 60000 >= MIN_SESSION_MINUTES)
      if (usableGaps.length === 0) break

      let best:
        | {
            task: (typeof eligible)[number]
            gap: Interval
            startMs: number
            chunkMin: number
            score: number
            needsBreak: boolean
          }
        | undefined

      for (const task of eligible) {
        const allowSplit = task.can_split
        for (const gap of usableGaps) {
          const intervalLen = (gap.end - gap.start) / 60000
          if (!allowSplit && task.remaining > intervalLen) continue

          const continuousRun = focusRunLengthBefore(ctx.placed, gap.start)
          const needsBreak = continuousRun >= settings.breakEveryMinutes
          let startMs = gap.start
          if (needsBreak) {
            startMs = gap.start + settings.breakMinutes * 60000
          }
          const chunkMin = clampChunk(
            task.remaining,
            settings.maxSessionMinutes,
            (gap.end - startMs) / 60000,
            allowSplit,
          )
          if (chunkMin < MIN_SESSION_MINUTES) continue

          const prev = [...ctx.placed]
            .filter((b) => b.end === startMs)
            .sort((a, b) => b.start - a.start)[0]

          const score = slotScore(task, new Date(startMs), chunkMin, {
            now,
            preferredStart: settings.preferredStart,
            preferredEnd: settings.preferredEnd,
            energy,
            prevSameTaskId: prev && prev.end === startMs ? task.id : null,
            prevSameCategoryId: prev ? task.category_id : null,
            dayFocusMinutes: ctx.focusMinutes,
            dailyTargetMinutes: ctx.dailyTargetMinutes,
            continuousFocusMinutes: continuousRun,
                        fatigueFromRun: continuousRun,
          }, true)

          if (!best || score > best.score) {
            best = { task, gap, startMs, chunkMin, score, needsBreak }
          }
        }
      }

      if (!best) break
      const { task, startMs, chunkMin, needsBreak } = best
      const chunkEndMs = startMs + chunkMin * 60000

      if (needsBreak) {
        const breakStartMs = startMs - settings.breakMinutes * 60000
        blocks.push({
          title: 'Break',
          block_type: 'break',
          start_at: new Date(breakStartMs).toISOString(),
          end_at: new Date(startMs).toISOString(),
          task_id: null,
          habit_id: null,
          color: null,
          locked: false,
        })
        ctx.placed.push({ start: breakStartMs, end: startMs, blockType: 'break' })
      }

      blocks.push({
        title: task.title,
        block_type: 'task',
        start_at: new Date(startMs).toISOString(),
        end_at: new Date(chunkEndMs).toISOString(),
        task_id: task.id,
        habit_id: null,
        color: task.category_color ?? null,
        locked: false,
      })
      sessions.push({
        task_id: task.id,
        start_at: new Date(startMs).toISOString(),
        end_at: new Date(chunkEndMs).toISOString(),
        duration_minutes: chunkMin,
      })
      ctx.placed.push({ start: startMs, end: chunkEndMs, blockType: 'task' })
      ctx.focusMinutes += chunkMin

      task.remaining -= chunkMin
      free = splitIntervals(free, startMs, chunkEndMs)
    }

    const remainderAfter = free.reduce((sum, f) => sum + (f.end - f.start) / 60000, 0)
    if (ctx.focusMinutes > ctx.dailyTargetMinutes * 1.15 && remainderAfter < 60) {
      overloadDays.push(ctx.dayKey)
    }
  }

  placeHabits(habits, dayContexts, settings, blocks)

  for (const task of workingTasks) {
    const taskSessions = sessions.filter((s) => s.task_id === task.id)
    if (taskSessions.length === 0) continue
    const sortedSessions = [...taskSessions].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    )
    taskUpdates.push({
      task_id: task.id,
      scheduled_start: sortedSessions[0]?.start_at ?? null,
      scheduled_end: sortedSessions[sortedSessions.length - 1]?.end_at ?? null,
    })
  }

  const orderedBlocks = [...blocks].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  )

  return {
    blocks: orderedBlocks,
    sessions,
    taskUpdates,
    summary: {
      scheduledMinutes: sessions.reduce((sum, s) => sum + s.duration_minutes, 0),
      tasksScheduled: new Set(sessions.map((s) => s.task_id)).size,
      remainingWorkMinutes: workingTasks.reduce((sum, t) => sum + t.remaining, 0),
      unplaceableTasks: [
        ...new Set(workingTasks.filter((t) => t.remaining > 0).map((t) => t.id)),
      ],
      overloadDays,
    },
  }
}

function placeHabits(
  habits: SchedulerHabit[],
  dayContexts: DayContext[],
  _settings: SchedulerInput['settings'],
  blocks: PlannedBlock[],
): void {
  for (const habit of habits) {
    const estimated = habit.estimated_minutes || 30
    if (habit.preferred_time) {
      const preferredMin = timeStringToMinutes(habit.preferred_time)
      for (const ctx of dayContexts) {
        const gap = ctx.free.find(
          (g) => preferredMin * 60000 >= g.start - ctx.dayStartMs && preferredMin * 60000 < g.end - ctx.dayStartMs,
        )
        if (!gap) continue
        const targetStart = Math.max(gap.start, ctx.dayStartMs + preferredMin * 60000)
        const available = (gap.end - targetStart) / 60000
        if (available < MIN_SESSION_MINUTES) continue
        const lengthMin = Math.min(estimated, available)
        pushHabitBlock(habit, ctx, targetStart, lengthMin, blocks)
      }
      continue
    }

    if (habit.frequency === 'daily') {
      for (const ctx of dayContexts) {
        const gap = ctx.free[0]
        if (!gap) continue
        const available = (gap.end - gap.start) / 60000
        if (available < MIN_SESSION_MINUTES) continue
        const lengthMin = Math.min(estimated, available)
        pushHabitBlock(habit, ctx, gap.start, lengthMin, blocks)
      }
      continue
    }

    let remaining = Math.max(0, habit.target_per_week - habit.days_done_this_week)
    for (const ctx of dayContexts) {
      if (remaining <= 0) break
      const gap = ctx.free[0]
      if (!gap) continue
      const available = (gap.end - gap.start) / 60000
      if (available < MIN_SESSION_MINUTES) continue
      const lengthMin = Math.min(estimated, available)
      pushHabitBlock(habit, ctx, gap.start, lengthMin, blocks)
      remaining -= 1
    }
  }
}

function pushHabitBlock(
  habit: SchedulerHabit,
  ctx: DayContext,
  startMs: number,
  lengthMin: number,
  blocks: PlannedBlock[],
): void {
  blocks.push({
    title: habit.name,
    block_type: 'habit',
    start_at: new Date(startMs).toISOString(),
    end_at: new Date(startMs + lengthMin * 60000).toISOString(),
    task_id: null,
    habit_id: habit.id,
    color: habit.color ?? null,
    locked: false,
  })
  ctx.placed.push({ start: startMs, end: startMs + lengthMin * 60000, blockType: 'habit' })
  ctx.free = splitIntervals(ctx.free, startMs, startMs + lengthMin * 60000)
}

export function formatPlannedBlocks(blocks: PlannedBlock[]): string[] {
  return blocks.map(
    (b) =>
      `${format(new Date(b.start_at), 'MM-dd HH:mm')}-${format(new Date(b.end_at), 'HH:mm')} ${b.block_type}: ${b.title}`,
  )
}