import type { AiChatMessage, AiPlanningContext, PlanningDetail, PlanningStyleId } from '../../src/lib/ai/types.js'
import { AiProxyError } from './errors.js'

/**
 * Input validation for the AI proxy.
 *
 * Everything arriving from the browser is untrusted: lengths are capped so a
 * caller cannot burn the free-model allowance with one giant prompt, and only
 * whitelisted planning fields are forwarded upstream (nothing else about the
 * person's data leaves the device).
 */

export const MAX_MESSAGES = 24
export const MAX_MESSAGE_CHARS = 6000
export const MAX_TOTAL_CHARS = 14000
export const MAX_SYSTEM_PROMPT_CHARS = 1500
export const MAX_TOKENS_LIMIT = 2048
export const MIN_TOKENS = 64
export const MIN_TEMPERATURE = 0
export const MAX_TEMPERATURE = 1.5

const STYLES: PlanningStyleId[] = ['structured', 'flexible', 'balanced', 'goal-focused', 'minimal']
const DETAILS: PlanningDetail[] = ['simple', 'normal', 'detailed']

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function list(value: unknown, max: number, mapper: (item: Record<string, unknown>) => unknown) {
  if (!Array.isArray(value)) return undefined
  const mapped = value
    .slice(0, max)
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map(mapper)
    .filter((item) => item !== null)
  return mapped.length > 0 ? mapped : undefined
}

function stringList(value: unknown, max: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const mapped = value
    .map((item) => text(item, maxLength))
    .filter((item): item is string => item !== undefined)
    .slice(0, max)
  return mapped.length > 0 ? mapped : undefined
}

export function parseMessages(value: unknown): AiChatMessage[] {
  if (!Array.isArray(value)) {
    throw new AiProxyError('bad_request', 'Messages must be an array.', { status: 400 })
  }
  const messages: AiChatMessage[] = []
  let total = 0
  for (const entry of value.slice(-MAX_MESSAGES)) {
    if (!entry || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const role = raw['role'] === 'assistant' ? 'assistant' : 'user'
    const content = text(raw['content'], MAX_MESSAGE_CHARS)
    if (!content) continue
    total += content.length
    if (total > MAX_TOTAL_CHARS) break
    messages.push({ role, content })
  }
  if (messages.length === 0) {
    throw new AiProxyError('bad_request', 'There is nothing to send.', { status: 400 })
  }
  return messages
}

export function clampTemperature(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(MAX_TEMPERATURE, Math.max(MIN_TEMPERATURE, Math.round(numeric * 100) / 100))
}

export function clampMaxTokens(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(MAX_TOKENS_LIMIT, Math.max(MIN_TOKENS, Math.trunc(numeric)))
}

/** Keep only the planning fields we deliberately send upstream. */
export function sanitizeContext(value: unknown): AiPlanningContext | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const style = raw['planningStyle']
  const detail = raw['planningDetail']

  const context: AiPlanningContext = {}
  const displayName = text(raw['displayName'], 40)
  if (displayName) context.displayName = displayName
  if (typeof style === 'string' && STYLES.includes(style as PlanningStyleId)) {
    context.planningStyle = style as PlanningStyleId
  }
  if (typeof detail === 'string' && DETAILS.includes(detail as PlanningDetail)) {
    context.planningDetail = detail as PlanningDetail
  }
  const dayLabel = text(raw['dayLabel'], 40)
  if (dayLabel) context.dayLabel = dayLabel
  const nowLocal = text(raw['nowLocal'], 8)
  if (nowLocal) context.nowLocal = nowLocal
  for (const key of ['awakeStart', 'awakeEnd', 'focusStart', 'focusEnd'] as const) {
    const clock = text(raw[key], 5)
    if (clock) context[key] = clock
  }

  const lifeAreas = stringList(raw['lifeAreas'], 12, 40)
  if (lifeAreas) context.lifeAreas = lifeAreas

  const tasks = list(raw['tasks'], 25, (item) => {
    const title = text(item['title'], 120)
    const id = text(item['id'], 60)
    if (!title || !id) return null
    return {
      id,
      title,
      due: text(item['due'], 24),
      priority: text(item['priority'], 12),
      minutes: typeof item['minutes'] === 'number' ? item['minutes'] : undefined,
      status: text(item['status'], 16),
      area: text(item['area'], 40),
    }
  })
  if (tasks) context.tasks = tasks as AiPlanningContext['tasks']

  const blocks = list(raw['blocks'], 25, (item) => {
    const title = text(item['title'], 120)
    const id = text(item['id'], 60)
    const start = text(item['start'], 8)
    const end = text(item['end'], 8)
    if (!title || !id || !start || !end) return null
    return {
      id,
      title,
      start,
      end,
      kind: text(item['kind'], 16) ?? 'task',
      completed: item['completed'] === true,
    }
  })
  if (blocks) context.blocks = blocks as AiPlanningContext['blocks']

  const habits = list(raw['habits'], 12, (item) => {
    const name = text(item['name'], 60)
    const id = text(item['id'], 60)
    if (!name || !id) return null
    return { id, name, doneToday: item['doneToday'] === true }
  })
  if (habits) context.habits = habits as AiPlanningContext['habits']

  const goals = list(raw['goals'], 12, (item) => {
    const title = text(item['title'], 120)
    const id = text(item['id'], 60)
    if (!title || !id) return null
    return { id, title, targetDate: text(item['targetDate'], 24) }
  })
  if (goals) context.goals = goals as AiPlanningContext['goals']

  // Ids referenced in the previous turn, so the model can resolve "it".
  const rawFocus = raw['recentFocus']
  if (rawFocus && typeof rawFocus === 'object' && !Array.isArray(rawFocus)) {
    const focus = rawFocus as Record<string, unknown>
    const taskIds = stringList(focus['taskIds'], 10, 64)
    const blockIds = stringList(focus['blockIds'], 10, 64)
    const habitIds = stringList(focus['habitIds'], 10, 64)
    const goalIds = stringList(focus['goalIds'], 10, 64)
    if (taskIds || blockIds || habitIds || goalIds) {
      context.recentFocus = {
        ...(taskIds ? { taskIds } : {}),
        ...(blockIds ? { blockIds } : {}),
        ...(habitIds ? { habitIds } : {}),
        ...(goalIds ? { goalIds } : {}),
      }
    }
  }

  // Screen awareness is consent-gated: the server trusts only this explicit
  // boolean, never any frame data.
  if (raw['screenShareActive'] === true) context.screenShareActive = true

  return context
}
