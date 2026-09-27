/**
 * Applies a validated assistant proposal to the user's own data.
 *
 * This is the only place where an assistant suggestion becomes a real write,
 * and it is deliberately boring:
 *
 *  - it runs in the browser under the caller's own Supabase session, so row-level
 *    security is what actually authorises every mutation. The server has no
 *    database access at all;
 *  - it re-checks that the proposal is one the allowlist produced, so a hand-crafted
 *    proposal object cannot smuggle an unlisted action through the UI;
 *  - arguments arrive already validated by the server's zod schemas and are
 *    re-narrowed here, because "already checked upstream" is not a type system.
 *
 * Every branch returns a plain result object instead of throwing, so the UI can
 * show exactly what happened or what went wrong.
 */

import { supabase } from '@/database/client'
import {
  createCategory as createCategoryRecord,
  deleteCategory as deleteCategoryRecord,
  listCategories,
} from '@/services/category-service'
import {
  createBlock as createBlockRecord,
  deleteBlock as deleteBlockRecord,
  updateBlock,
} from '@/services/block-service'
import { moveBlock as moveBlockRecord, setBlockCompleted } from '@/services/block-mutations'
import {
  createHabit as createHabitRecord,
  deleteHabit as deleteHabitRecord,
  setHabitLog,
} from '@/services/habit-service'
import {
  createGoal as createGoalRecord,
  deleteGoal as deleteGoalRecord,
  updateGoal as updateGoalRecord,
} from '@/services/goal-service'
import { runScheduleAndPersist } from '@/services/scheduling-service'
import { checkWindowAvailability } from '@/lib/assistant/scheduler-bridge'
import {
  createTask as createTaskRecord,
  deleteTask as deleteTaskRecord,
  markTaskDone,
  markTaskOpen,
  updateTask,
  type TaskInsert,
  type TaskUpdate,
} from '@/services/task-service'
import { format } from 'date-fns'
import type { AiProposal } from '@/lib/ai/types'
import type { Priority, Difficulty, TaskStatus, BlockType } from '@/types/models'

export type ApplyResult =
  | { ok: true; message: string; /** Ids to seed `recentFocus` for follow-ups. */ focus: string[] }
  | { ok: false; error: string }

const DEFAULT_CATEGORY_COLOR = '#6366f1'

function str(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function num(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function bool(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key]
  return typeof value === 'boolean' ? value : undefined
}

const PRIORITIES: readonly Priority[] = ['low', 'medium', 'high', 'critical']
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard']
const STATUSES: readonly TaskStatus[] = ['todo', 'in_progress', 'done', 'missed']
const BLOCK_TYPES: readonly BlockType[] = [
  'fixed',
  'task',
  'focus',
  'habit',
  'break',
  'appointment',
  'free',
  'sleep',
]

function oneOf<T extends string>(args: Record<string, unknown>, key: string, allowed: readonly T[]): T | undefined {
  const value = str(args, key)
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

/** Combine a YYYY-MM-DD date and HH:MM time into a local ISO timestamp. */
function stamp(date: string, time?: string): string | undefined {
  if (!time) return undefined
  const parsed = new Date(`${date}T${time}:00`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

/** Resolve a human category name to an id, case-insensitively. */
async function categoryIdForName(userId: string, name: string): Promise<string | null> {
  const categories = await listCategories(userId)
  const wanted = name.trim().toLowerCase()
  return categories.find((c) => c.name.trim().toLowerCase() === wanted)?.id ?? null
}

/**
 * Refuse to place a block on top of something that already exists.
 *
 * The scheduler is overlap-safe, but a hand-pinned proposal is not, so a
 * conflicting window is reported back to the model as something to ask about
 * rather than silently double-booking the person.
 */
async function conflictMessage(
  userId: string,
  startAt: string,
  endAt: string,
): Promise<string | null> {
  const from = new Date(startAt)
  const to = new Date(endAt)
  const { available, conflicts } = await checkWindowAvailability(userId, from, to)
  if (available) return null
  const list = conflicts
    .slice(0, 3)
    .map((c) => `${c.title} (${format(c.start, 'HH:mm')}–${format(c.end, 'HH:mm')})`)
    .join(', ')
  return `That time overlaps ${list}. Ask whether to move it or keep the existing block.`
}

/**
 * Carry a proposal through to the database.
 *
 * `applyProposal` never throws; it converts thrown service errors into a
 * readable message so the assistant panel can show them inline.
 */
export async function applyProposal(userId: string, proposal: AiProposal): Promise<ApplyResult> {
  const args = proposal.payload ?? {}
  try {
    switch (proposal.kind) {
      /* ---------------- read-only ---------------- */

      case 'get_today_summary':
      case 'list_tasks':
      case 'search_planner':
        return { ok: true, message: 'Answered from your plan data.', focus: [] }

      /* ---------------- tasks ---------------- */

      case 'create_task': {
        const title = str(args, 'title')
        if (!title) return { ok: false, error: 'That task needs a title.' }

        const insert: TaskInsert = {
          title,
          description: str(args, 'description') ?? null,
          priority: oneOf(args, 'priority', PRIORITIES) ?? 'medium',
          difficulty: oneOf(args, 'difficulty', DIFFICULTIES) ?? 'medium',
          estimated_minutes: num(args, 'estimated_minutes') ?? 30,
          remaining_minutes: num(args, 'estimated_minutes') ?? 30,
          deadline: str(args, 'deadline') ?? null,
          category_id: null,
          can_split: bool(args, 'can_split') ?? false,
          locked: false,
        }

        const categoryName = str(args, 'category')
        if (categoryName) {
          const id = await categoryIdForName(userId, categoryName)
          if (id) insert.category_id = id
        }

        const created = await createTaskRecord(userId, insert)
        return { ok: true, message: `Added "${created.title}".`, focus: [created.id] }
      }

      case 'update_task': {
        const taskId = str(args, 'task_id')
        if (!taskId) return { ok: false, error: 'That change needs a task id.' }

        const fields: TaskUpdate = {}
        const title = str(args, 'title')
        if (title) fields.title = title
        const description = str(args, 'description')
        if (description) fields.description = description
        const priority = oneOf(args, 'priority', PRIORITIES)
        if (priority) fields.priority = priority
        const difficulty = oneOf(args, 'difficulty', DIFFICULTIES)
        if (difficulty) fields.difficulty = difficulty
        const minutes = num(args, 'estimated_minutes')
        if (minutes) {
          fields.estimated_minutes = minutes
          fields.remaining_minutes = minutes
        }
        const deadline = str(args, 'deadline')
        if (deadline) fields.deadline = deadline
        const status = oneOf(args, 'status', STATUSES)
        if (status) fields.status = status
        const canSplit = bool(args, 'can_split')
        if (canSplit !== undefined) fields.can_split = canSplit

        if (Object.keys(fields).length === 0) {
          return { ok: false, error: 'Nothing in that change was recognised.' }
        }
        const updated = await updateTask(taskId, fields)
        if (!updated) return { ok: false, error: 'That task no longer exists.' }
        return { ok: true, message: `Updated "${updated.title}".`, focus: [updated.id] }
      }

      case 'complete_task': {
        const taskId = str(args, 'task_id')
        if (!taskId) return { ok: false, error: 'I need a task id to complete.' }
        const updated = await markTaskDone(taskId)
        if (!updated) return { ok: false, error: 'That task no longer exists.' }
        return { ok: true, message: `Marked "${updated.title}" as done.`, focus: [updated.id] }
      }

      case 'reschedule_task': {
        const taskId = str(args, 'task_id')
        const date = str(args, 'date')
        if (!taskId || !date) return { ok: false, error: 'I need a task and a day to reschedule to.' }

        const fields: TaskUpdate = {}
        const start = str(args, 'start')
        const startIso = stamp(date, start)
        if (startIso) fields.scheduled_start = startIso
        const end = str(args, 'end')
        const endIso = stamp(date, end)
        if (endIso) fields.scheduled_end = endIso

        const updated = await updateTask(taskId, fields)
        if (!updated) return { ok: false, error: 'That task no longer exists.' }
        return {
          ok: true,
          message: `Moved "${updated.title}" to ${format(new Date(`${date}T00:00:00`), 'EEE d MMM')}.`,
          focus: [updated.id],
        }
      }

      case 'delete_task': {
        const taskId = str(args, 'task_id')
        if (!taskId) return { ok: false, error: 'I need a task id to delete.' }
        await deleteTaskRecord(taskId)
        return { ok: true, message: 'Task deleted.', focus: [] }
      }

      /* ---------------- habits ---------------- */

      case 'create_habit': {
        const name = str(args, 'name')
        if (!name) return { ok: false, error: 'That habit needs a name.' }
        const created = await createHabitRecord(userId, {
          name,
          description: str(args, 'description') ?? null,
          frequency: oneOf(args, 'frequency', ['daily', 'weekly'] as const) ?? 'daily',
          target_per_week: num(args, 'target_per_week') ?? 7,
          preferred_time: str(args, 'preferred_time') ?? null,
          estimated_minutes: num(args, 'estimated_minutes') ?? 15,
          color: str(args, 'color') ?? '#22c55e',
        })
        return { ok: true, message: `Started tracking "${created.name}".`, focus: [created.id] }
      }

      case 'log_habit': {
        const habitId = str(args, 'habit_id')
        if (!habitId) return { ok: false, error: 'I need a habit id to log.' }
        const date = str(args, 'date') ?? format(new Date(), 'yyyy-MM-dd')
        const completed = bool(args, 'completed') ?? true
        await setHabitLog({ user_id: userId, habit_id: habitId, log_date: date, completed })
        return {
          ok: true,
          message: completed ? 'Logged for that day.' : 'Removed the mark for that day.',
          focus: [habitId],
        }
      }

      case 'delete_habit': {
        const habitId = str(args, 'habit_id')
        if (!habitId) return { ok: false, error: 'I need a habit id to delete.' }
        await deleteHabitRecord(habitId)
        return { ok: true, message: 'Habit and its history deleted.', focus: [] }
      }

      /* ---------------- goals ---------------- */

      case 'create_goal': {
        const title = str(args, 'title')
        if (!title) return { ok: false, error: 'That goal needs a title.' }
        const created = await createGoalRecord(userId, {
          title,
          description: str(args, 'description') ?? null,
          target_date: str(args, 'target_date') ?? null,
        })
        return { ok: true, message: `Added the goal "${created.title}".`, focus: [created.id] }
      }

      case 'update_goal': {
        const goalId = str(args, 'goal_id')
        if (!goalId) return { ok: false, error: 'I need a goal id to update.' }
        const fields: Parameters<typeof updateGoalRecord>[1] = {}
        const title = str(args, 'title')
        if (title) fields.title = title
        const description = str(args, 'description')
        if (description) fields.description = description
        const targetDate = str(args, 'target_date')
        if (targetDate) fields.target_date = targetDate
        const status = oneOf(args, 'status', ['active', 'achieved', 'abandoned'] as const)
        if (status) fields.status = status

        if (Object.keys(fields).length === 0) {
          return { ok: false, error: 'Nothing in that change was recognised.' }
        }
        const updated = await updateGoalRecord(goalId, fields)
        if (!updated) return { ok: false, error: 'That goal no longer exists.' }
        return { ok: true, message: `Updated "${updated.title}".`, focus: [updated.id] }
      }

      case 'delete_goal': {
        const goalId = str(args, 'goal_id')
        if (!goalId) return { ok: false, error: 'I need a goal id to delete.' }
        await deleteGoalRecord(goalId)
        return { ok: true, message: 'Goal deleted.', focus: [] }
      }

      /* ---------------- schedule ---------------- */

      case 'create_block': {
        const title = str(args, 'title')
        const date = str(args, 'date')
        const start = str(args, 'start')
        const end = str(args, 'end')
        if (!title || !date || !start || !end) {
          return { ok: false, error: 'A block needs a title, a day and a start and end time.' }
        }
        const startAt = stamp(date, start)
        const endAt = stamp(date, end)
        if (!startAt || !endAt) return { ok: false, error: 'Those times could not be read.' }
        if (endAt <= startAt) return { ok: false, error: 'The end time must be after the start time.' }

        const clash = await conflictMessage(userId, startAt, endAt)
        if (clash) return { ok: false, error: clash }

        const created = await createBlockRecord(userId, {
          plan_date: date,
          block_type: oneOf(args, 'block_type', BLOCK_TYPES) ?? 'appointment',
          title,
          task_id: str(args, 'task_id') ?? null,
          event_id: null,
          habit_id: str(args, 'habit_id') ?? null,
          start_at: startAt,
          end_at: endAt,
          locked: bool(args, 'locked') ?? false,
          completed: false,
          skipped: false,
          note: str(args, 'note') ?? null,
          color: null,
        })
        return { ok: true, message: `Added "${created.title}" to ${format(new Date(`${date}T00:00:00`), 'EEE d MMM')}.`, focus: [created.id] }
      }

      case 'move_block': {
        const blockId = str(args, 'block_id')
        const date = str(args, 'date')
        const start = str(args, 'start')
        if (!blockId || !date || !start) {
          return { ok: false, error: 'Moving a block needs its id, a day and a start time.' }
        }
        const startAt = stamp(date, start)
        if (!startAt) return { ok: false, error: 'That start time could not be read.' }

        // The block currently lives on some other day, so look it up by id
        // across the range rather than assuming it is already on `date` —
        // otherwise the duration silently falls back to one hour.
        const { data: found } = await supabase
          .from('schedule_blocks')
          .select('id, start_at, end_at')
          .eq('id', blockId)
          .maybeSingle()
        if (!found) return { ok: false, error: 'That block no longer exists.' }

        const existing = found as { start_at: string; end_at: string }
        const durationMs = new Date(existing.end_at).getTime() - new Date(existing.start_at).getTime()
        const endAt = new Date(new Date(startAt).getTime() + durationMs).toISOString()

        const clash = await conflictMessage(userId, startAt, endAt)
        if (clash) return { ok: false, error: clash }

        await moveBlockRecord(blockId, startAt, endAt)
        await updateBlock(blockId, { plan_date: date })
        return { ok: true, message: `Moved to ${format(new Date(`${date}T00:00:00`), 'EEE d MMM')} at ${start}.`, focus: [blockId] }
      }

      case 'complete_block': {
        const blockId = str(args, 'block_id')
        if (!blockId) return { ok: false, error: 'I need a block id.' }
        const completed = bool(args, 'completed') ?? true
        await setBlockCompleted(blockId, completed)
        return { ok: true, message: completed ? 'Block marked done.' : 'Block reopened.', focus: [blockId] }
      }

      case 'delete_block': {
        const blockId = str(args, 'block_id')
        if (!blockId) return { ok: false, error: 'I need a block id.' }
        await deleteBlockRecord(blockId)
        return { ok: true, message: 'Block removed from your schedule.', focus: [] }
      }

      case 'reschedule_day': {
        const date = str(args, 'date')
        if (!date) return { ok: false, error: 'I need a day to rebuild.' }
        const day = new Date(`${date}T00:00:00`)
        if (Number.isNaN(day.getTime())) return { ok: false, error: 'That day could not be read.' }

        await runScheduleAndPersist(userId, day, day)
        return { ok: true, message: `Rebuilt your plan for ${format(day, 'EEE d MMM')}.`, focus: [] }
      }

      case 'add_break': {
        const date = str(args, 'date')
        const start = str(args, 'start')
        if (!date || !start) return { ok: false, error: 'A break needs a day and a start time.' }
        const startAt = stamp(date, start)
        if (!startAt) return { ok: false, error: 'That start time could not be read.' }
        const minutes = num(args, 'minutes') ?? 15
        const endAt = new Date(new Date(startAt).getTime() + minutes * 60_000).toISOString()

        const created = await createBlockRecord(userId, {
          plan_date: date,
          block_type: 'break',
          title: str(args, 'title') ?? 'Break',
          task_id: null,
          event_id: null,
          habit_id: null,
          start_at: startAt,
          end_at: endAt,
          locked: false,
          completed: false,
          skipped: false,
          note: null,
          color: null,
        })
        return { ok: true, message: `Added a ${minutes}-minute break.`, focus: [created.id] }
      }

      /* ---------------- organisation ---------------- */

      case 'create_category': {
        const name = str(args, 'name')
        if (!name) return { ok: false, error: 'A category needs a name.' }
        const created = await createCategoryRecord(userId, name, str(args, 'color') ?? DEFAULT_CATEGORY_COLOR)
        return { ok: true, message: `Created the category "${created.name}".`, focus: [created.id] }
      }

      case 'delete_category': {
        const categoryId = str(args, 'category_id')
        if (!categoryId) return { ok: false, error: 'I need a category id.' }
        // `none` and an omitted value both mean "clear the category", so a
        // delete can never orphan work the person still has to do.
        const moveTo = str(args, 'move_tasks_to') ?? 'none'
        const target = moveTo === 'none' ? null : moveTo

        // Re-home the tasks first so a category delete never orphans work.
        const { error } = await supabase
          .from('tasks')
          .update({ category_id: target })
          .eq('category_id', categoryId)
        if (error) return { ok: false, error: 'Could not move those tasks first.' }

        await deleteCategoryRecord(categoryId)
        return { ok: true, message: 'Category deleted.', focus: [] }
      }

      /* ---------------- not yet wired ---------------- */

      default:
        return { ok: false, error: 'That action is not supported yet.' }
    }
  } catch (error) {
    // Supabase errors carry a message worth showing, but never leak internals.
    const message = error instanceof Error ? error.message : 'Something went wrong.'
    return { ok: false, error: message }
  }
}

/** Reopen a task. Used by the "undo" affordance on a completed task. */
export async function reopenTask(taskId: string): Promise<ApplyResult> {
  try {
    const updated = await markTaskOpen(taskId)
    if (!updated) return { ok: false, error: 'That task no longer exists.' }
    return { ok: true, message: `Reopened "${updated.title}".`, focus: [updated.id] }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Something went wrong.' }
  }
}
