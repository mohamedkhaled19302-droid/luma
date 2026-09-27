import type { AiProposal, AiProposalKind } from '../../src/lib/ai/types.js'
import { isKnownTool, validateToolCall } from './tools.js'

/**
 * Parsing for the assistant's structured suggestions.
 *
 * Model output is untrusted input. Every action — whether it arrived through
 * native tool calling or through the JSON fence that older free models emit —
 * is validated by the shared tool registry in `./tools.ts` before it becomes a
 * proposal. A malformed action is simply dropped, so the prose still reaches
 * the user and a bad block never breaks the conversation.
 *
 * Proposals are inert. Nothing here touches the database; the browser applies
 * them through the normal Supabase services under the caller's own session.
 */

export const ACTIONS_FENCE = 'morrow-actions'
export const MAX_PROPOSALS = 4
const MAX_TITLE = 60
const MAX_SUMMARY = 160
const MAX_PAYLOAD_KEYS = 10
const MAX_STRING = 200

/** Short button labels for the tools users reach for most. */
const DEFAULT_TITLES: Partial<Record<AiProposalKind, string>> = {
  create_task: 'Add this task',
  update_task: 'Apply these changes',
  complete_task: 'Mark it done',
  reschedule_task: 'Reschedule it',
  delete_task: 'Delete this task',
  create_habit: 'Create this habit',
  log_habit: 'Log this habit',
  delete_habit: 'Delete this habit',
  create_goal: 'Create this goal',
  update_goal: 'Update this goal',
  delete_goal: 'Delete this goal',
  create_block: 'Add to your schedule',
  move_block: 'Move this block',
  complete_block: 'Mark it done',
  delete_block: 'Remove this block',
  reschedule_day: 'Rebuild this day',
  add_break: 'Add a break',
  create_category: 'Create this category',
  delete_category: 'Delete this category',
}

function defaultTitle(tool: AiProposalKind): string {
  const mapped = DEFAULT_TITLES[tool]
  if (mapped) return mapped
  return tool
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export interface ParsedReply {
  /** The prose the user should read (JSON block removed). */
  reply: string
  proposals: AiProposal[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

/**
 * Keep only JSON-safe, size-limited payload fields. Anything unexpected is
 * dropped rather than forwarded to the app.
 */
export function sanitizePayload(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {}
  const clean: Record<string, unknown> = {}
  let keys = 0
  for (const [key, entry] of Object.entries(value)) {
    if (keys >= MAX_PAYLOAD_KEYS) break
    if (!/^[a-z_]{1,32}$/.test(key)) continue
    if (typeof entry === 'string') {
      const text = clampString(entry, MAX_STRING)
      if (text !== undefined) clean[key] = text
    } else if (typeof entry === 'number' && Number.isFinite(entry)) {
      clean[key] = entry
    } else if (typeof entry === 'boolean') {
      clean[key] = entry
    } else if (Array.isArray(entry)) {
      const list = entry
        .map((item) => clampString(item, MAX_STRING))
        .filter((item): item is string => item !== undefined)
        .slice(0, 6)
      if (list.length > 0) clean[key] = list
    }
    keys += 1
  }
  return clean
}

/** Build a proposal from a tool name plus raw arguments, or null if invalid. */
export function proposalFromToolCall(
  tool: string,
  rawArgs: unknown,
  id: string,
  label?: string,
  summary?: string,
): AiProposal | null {
  const validation = validateToolCall(tool, rawArgs)
  if (!validation.ok) return null
  return {
    id,
    kind: validation.tool,
    title: clampString(label, MAX_TITLE) ?? defaultTitle(validation.tool),
    ...(summary ? { summary: clampString(summary, MAX_SUMMARY) } : {}),
    payload: validation.args,
    destructive: validation.destructive,
  }
}

/**
 * Convert OpenAI-style `tool_calls` into validated proposals. Invalid calls are
 * skipped rather than surfaced, so a malformed call can never produce an
 * actionable button.
 */
export function proposalsFromToolCalls(
  toolCalls: ReadonlyArray<{ id?: string; function?: { name?: string; arguments?: string } }>,
  idPrefix = 't',
): AiProposal[] {
  const proposals: AiProposal[] = []
  for (const call of toolCalls.slice(0, MAX_PROPOSALS)) {
    const name = call.function?.name
    if (typeof name !== 'string' || !isKnownTool(name)) continue
    const proposal = proposalFromToolCall(
      name,
      call.function?.arguments,
      `${idPrefix}-${proposals.length}`,
    )
    if (proposal) proposals.push(proposal)
  }
  return proposals
}

/** Turn one raw action object into a validated proposal (or null). */
function toProposal(raw: unknown, index: number, idPrefix: string): AiProposal | null {
  if (!isRecord(raw)) return null
  // Accept both shapes: the tool-call style {"tool","args"} and the older
  // {"kind","payload"} envelope.
  const tool = raw['tool'] ?? raw['kind']
  if (typeof tool !== 'string') return null
  if (!isKnownTool(tool)) return null
  const args = raw['args'] ?? raw['payload']
  return proposalFromToolCall(
    tool,
    args,
    `${idPrefix}-${index}`,
    typeof raw['title'] === 'string' ? raw['title'] : undefined,
    typeof raw['summary'] === 'string' ? raw['summary'] : undefined,
  )
}

function extractActionsObject(candidate: string): unknown | null {
  const text = candidate.trim()
  if (!text) return null
  // Accept either the {"actions":[…]} envelope or a bare array.
  const attempts = [text]
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) attempts.push(text.slice(firstBrace, lastBrace + 1))
  const firstBracket = text.indexOf('[')
  const lastBracket = text.lastIndexOf(']')
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    attempts.push(`{"actions":${text.slice(firstBracket, lastBracket + 1)}}`)
  }
  for (const attempt of attempts) {
    try {
      const parsed: unknown = JSON.parse(attempt)
      if (isRecord(parsed) && Array.isArray(parsed['actions'])) return parsed['actions']
      if (Array.isArray(parsed)) return parsed
    } catch {
      /* try the next candidate */
    }
  }
  return null
}

/**
 * Split a model reply into readable prose plus any validated suggestions.
 * `idPrefix` keeps proposal ids unique across a conversation.
 */
export function parseAssistantReply(raw: string, idPrefix = 'p'): ParsedReply {
  const text = String(raw ?? '')
  const fenced = new RegExp(`\`\`\`(?:${ACTIONS_FENCE}|json)?\\s*([\\s\\S]*?)\`\`\``, 'i')
  const match = fenced.exec(text)

  let actions: unknown | null = null
  let prose = text

  if (match && typeof match[1] === 'string') {
    const candidate = match[1]
    if (candidate.includes('actions') || candidate.includes('"tool"') || candidate.trim().startsWith('[')) {
      actions = extractActionsObject(candidate)
      if (actions) prose = text.replace(match[0], '')
    }
  }

  if (!actions) {
    // Some models forget the fence and emit raw JSON at the end.
    const tail = text.lastIndexOf('{"actions"')
    if (tail >= 0) {
      actions = extractActionsObject(text.slice(tail))
      if (actions) prose = text.slice(0, tail)
    }
  }

  const proposals: AiProposal[] = []
  if (Array.isArray(actions)) {
    for (const entry of actions.slice(0, MAX_PROPOSALS)) {
      const proposal = toProposal(entry, proposals.length, idPrefix)
      if (proposal) proposals.push(proposal)
    }
  }

  return { reply: prose.replace(/\n{3,}/g, '\n\n').trim(), proposals }
}
