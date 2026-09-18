import { z } from 'zod'
import type { ScheduleAction } from './types'

export const parsedTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  estimated_minutes: z
    .number()
    .int()
    .min(5)
    .max(8 * 60),
  deadline: z.string().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  confidence: z.number().min(0).max(1).optional(),
})

export const scheduleActionSchema = z.object({
  action: z.enum(['place_task', 'move_task', 'remove_task_block', 'add_break', 'add_habit']),
  task_id: z.string().nullable().optional().transform((v) => v ?? undefined),
  habit_id: z.string().nullable().optional().transform((v) => v ?? undefined),
  start: z.string().datetime().nullable().optional().transform((v) => v ?? undefined),
  end: z.string().datetime().nullable().optional().transform((v) => v ?? undefined),
  reason: z.string().max(1000).optional().default(''),
  confidence: z.number().min(0).max(1).optional().default(0.5),
})

/**
 * Validate raw AI output. The AI may wrap the result in markdown fences,
 * so we normalize before parsing. Returns typed, validated output or a list
 * of validation errors.
 */
export function validateParsedTask(raw: unknown): {
  ok: boolean
  data?: z.infer<typeof parsedTaskSchema>
  errors?: string[]
} {
  const normalized = normalizeJson(raw)
  const result = parsedTaskSchema.safeParse(normalized)
  if (result.success) return { ok: true, data: result.data }
  return { ok: false, errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`) }
}

export function validateScheduleActions(raw: unknown): {
  ok: boolean
  data?: ScheduleAction[]
  errors?: string[]
} {
  const normalized = normalizeJson(raw)
  if (Array.isArray(normalized)) {
    const result = z.array(scheduleActionSchema).safeParse(normalized)
    if (result.success) return { ok: true, data: result.data }
    return { ok: false, errors: result.error.errors.map((e) => e.message) }
  }
  if (normalized && typeof normalized === 'object') {
    const result = scheduleActionSchema.safeParse(normalized)
    if (result.success) return { ok: true, data: [result.data] }
    return { ok: false, errors: result.error.errors.map((e) => e.message) }
  }
  return { ok: false, errors: ['AI output was not a recognizable action.'] }
}

function normalizeJson(raw: unknown): unknown {
  if (raw == null) return null
  if (typeof raw !== 'string') return raw
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = (fence[1] ?? text).trim()
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Scheduling-constraint validation for a proposed action. Verifies the
 * placement does not overlap locked blocks, school, appointments or sleep.
 */
export function validateActionAgainstSchedule(
  action: ScheduleAction,
  lockedRanges: Array<{ start: Date; end: Date }>,
): { valid: boolean; reason?: string } {
  if (action.action !== 'place_task' && action.action !== 'move_task') {
    return { valid: true }
  }
  if (!action.start || !action.end) {
    return { valid: false, reason: 'Missing start/end for placement.' }
  }
  if (action.action === 'move_task' && !action.task_id) {
    return { valid: false, reason: 'Missing task_id for move.' }
  }

  const start = new Date(action.start)
  const end = new Date(action.end)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { valid: false, reason: 'Invalid start/end timestamps.' }
  }
  if (end.getTime() <= start.getTime()) {
    return { valid: false, reason: 'The proposed block ends before it starts.' }
  }

  for (const locked of lockedRanges) {
    if (start.getTime() < locked.end.getTime() && end.getTime() > locked.start.getTime()) {
      return {
        valid: false,
        reason: `This overlaps a locked block (${locked.start.toLocaleString()} - ${locked.end.toLocaleString()}).`,
      }
    }
  }

  return { valid: true }
}