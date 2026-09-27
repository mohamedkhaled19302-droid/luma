/**
 * The assistant's tool allowlist.
 *
 * Design rules (do not weaken these):
 *
 *  1. The server NEVER executes a tool. It validates the model's arguments and
 *     hands an inert proposal back to the browser, which applies it through the
 *     existing Supabase services under the caller's own RLS session. That means
 *     there is no SQL surface, no database credentials on this side, and no way
 *     for a model to reach another user's rows.
 *  2. Every argument is validated with zod before it leaves this module. Unknown
 *     keys are rejected, not ignored.
 *  3. Destructive tools are flagged here and are held for explicit user
 *     confirmation by the handler. They are never applied on first emission.
 *  4. Read-only tools are answered from the planning context the client already
 *     sends. They perform no additional data access.
 *
 * Each field is declared once and compiled to BOTH a zod schema and an OpenAI
 * JSON Schema from the same source, so the advertised contract and the enforced
 * contract cannot drift apart.
 */

import { z } from 'zod'
import {
  isDestructiveTool,
  type AiToolDefinition,
  type AiToolName,
  type AiToolParamSpec,
} from '../../src/lib/ai/types.js'

/* ------------------------------------------------------------------ *
 * Field DSL
 * ------------------------------------------------------------------ */

type FieldSpec =
  | {
      kind: 'string'
      description: string
      min?: number
      max: number
      enum?: readonly string[]
      pattern?: RegExp
      optional?: boolean
    }
  | {
      kind: 'number'
      description: string
      min: number
      max: number
      integer?: boolean
      optional?: boolean
    }
  | { kind: 'boolean'; description: string; optional?: boolean }
  | {
      kind: 'string[]'
      description: string
      maxItems: number
      itemMax: number
      optional?: boolean
    }

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

function toZod(spec: FieldSpec): z.ZodTypeAny {
  switch (spec.kind) {
    case 'string': {
      let base = z.string()
      if (spec.min != null) base = base.min(spec.min)
      base = base.max(spec.max)
      if (spec.enum) {
        // enum() first so the model only ever sees legal values; the JSON
        // Schema still advertises maxLength for the advertised contract.
        return z.enum(spec.enum as [string, ...string[]])
      }
      if (spec.pattern) return base.regex(spec.pattern)
      return base
    }
    case 'number': {
      let base = z.number()
      if (spec.integer) base = base.int()
      return base.min(spec.min).max(spec.max)
    }
    case 'boolean':
      return z.boolean()
    case 'string[]':
      return z.array(z.string().max(spec.itemMax)).max(spec.maxItems)
  }
}

function toJsonSchemaType(spec: FieldSpec): Record<string, unknown> {
  switch (spec.kind) {
    case 'string': {
      const out: Record<string, unknown> = { type: 'string' }
      if (spec.min != null) out.minLength = spec.min
      out.maxLength = spec.max
      if (spec.enum) out.enum = [...spec.enum]
      if (spec.pattern) out.pattern = spec.pattern.source
      return out
    }
    case 'number': {
      const out: Record<string, unknown> = { type: 'number' }
      if (spec.integer) out.type = 'integer'
      out.minimum = spec.min
      out.maximum = spec.max
      return out
    }
    case 'boolean':
      return { type: 'boolean' }
    case 'string[]':
      return { type: 'array', items: { type: 'string', maxLength: spec.itemMax }, maxItems: spec.maxItems }
  }
}

function isOptional(spec: FieldSpec): boolean {
  return spec.optional === true
}

function paramSpec(name: string, spec: FieldSpec): AiToolParamSpec {
  if (spec.kind === 'string[]') {
    return { name, type: 'string[]', required: !isOptional(spec), description: spec.description }
  }
  if (spec.kind === 'number') {
    return {
      name,
      type: 'number',
      required: !isOptional(spec),
      description: spec.description,
      min: spec.min,
      max: spec.max,
    }
  }
  return {
    name,
    type: spec.kind,
    required: !isOptional(spec),
    description: spec.description,
    ...(spec.kind === 'string' && spec.enum ? { options: [...spec.enum] } : {}),
  }
}

/* ------------------------------------------------------------------ *
 * Shared fields
 * ------------------------------------------------------------------ */

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
const TASK_STATUSES = ['todo', 'in_progress', 'done', 'missed'] as const
const BLOCK_TYPES = [
  'fixed',
  'task',
  'focus',
  'habit',
  'break',
  'appointment',
  'free',
  'sleep',
] as const
const HABIT_FREQUENCIES = ['daily', 'weekly'] as const
const GOAL_STATUSES = ['active', 'achieved', 'abandoned'] as const

const taskId = (): FieldSpec => ({
  kind: 'string',
  description: 'The task id, copied verbatim from the plan data.',
  max: 64,
  pattern: SAFE_ID,
})
const blockId = (): FieldSpec => ({
  kind: 'string',
  description: 'The schedule block id, copied verbatim from the plan data.',
  max: 64,
  pattern: SAFE_ID,
})
const habitId = (): FieldSpec => ({
  kind: 'string',
  description: 'The habit id, copied verbatim from the plan data.',
  max: 64,
  pattern: SAFE_ID,
})
const goalId = (): FieldSpec => ({
  kind: 'string',
  description: 'The goal id, copied verbatim from the plan data.',
  max: 64,
  pattern: SAFE_ID,
})
const isoDate = (desc: string, optional = false): FieldSpec => ({
  kind: 'string',
  description: desc,
  max: 10,
  pattern: ISO_DATE,
  optional,
})
const hhmm = (desc: string, optional = false): FieldSpec => ({
  kind: 'string',
  description: desc,
  max: 5,
  pattern: HH_MM,
  optional,
})
const title = (desc: string): FieldSpec => ({ kind: 'string', description: desc, min: 1, max: 120 })
const notes = (): FieldSpec => ({
  kind: 'string',
  description: 'Optional longer description.',
  max: 2000,
  optional: true,
})

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

interface ToolEntry {
  name: AiToolName
  description: string
  readOnly: boolean
  fields: Record<string, FieldSpec>
  /** Shown in the confirmation dialog so the user knows what will happen. */
  confirmCopy?: (args: Record<string, unknown>) => { title: string; detail: string }
}

/**
 * The single source of truth for every callable tool.
 *
 * `satisfies` (rather than `: ToolEntry[]`) is deliberate: it validates the
 * shape while keeping each `name` as a literal type, which is what lets the
 * registry-vs-union drift check below be enforced by the compiler.
 */
const ENTRIES = [
  /* ---- read-only ---- */
  {
    name: 'get_today_summary',
    description:
      "Read today's plan, open tasks and habits from the context the user already shared. Use this before answering any question about what is scheduled, what is due, or how balanced the day is. Never call it to look at other days.",
    readOnly: true,
    fields: {},
  },
  {
    name: 'list_tasks',
    description:
      'List the user tasks in the shared context, optionally filtered. Use it when the user asks what is on their plate or what is still open.',
    readOnly: true,
    fields: {
      status: {
        kind: 'string',
        description: 'Only return tasks in this state.',
        max: 20,
        enum: TASK_STATUSES,
        optional: true,
      },
      area: {
        kind: 'string',
        description: 'Case-insensitive life-area or category filter.',
        max: 60,
        optional: true,
      },
    },
  },
  {
    name: 'search_planner',
    description:
      'Search the shared plan data for tasks, blocks, habits and goals matching a word or phrase.',
    readOnly: true,
    fields: {
      query: { kind: 'string', description: 'Text to search for.', min: 1, max: 100 },
    },
  },

  /* ---- tasks ---- */
  {
    name: 'create_task',
    description:
      'Create a new task. Use it when the user says they need to do something. If the date or time is unclear, ask instead of guessing.',
    readOnly: false,
    fields: {
      title: title('Short imperative task title.'),
      description: notes(),
      priority: {
        kind: 'string',
        description: 'Task priority.',
        max: 10,
        enum: PRIORITIES,
        optional: true,
      },
      difficulty: {
        kind: 'string',
        description: 'How hard the task feels.',
        max: 10,
        enum: DIFFICULTIES,
        optional: true,
      },
      estimated_minutes: {
        kind: 'number',
        description: 'Realistic time the task needs.',
        min: 5,
        max: 600,
        integer: true,
        optional: true,
      },
      // Optional: most tasks have no deadline. When this was required the model
      // was told it could omit the field but validation rejected every task that
      // tried, so "add a task" without a due date always failed.
      deadline: isoDate('Day the task is due, as YYYY-MM-DD. Omit if there is no deadline.', true),
      category: {
        kind: 'string',
        description: 'Existing life area or category name. Omit to leave uncategorised.',
        max: 60,
        optional: true,
      },
      can_split: {
        kind: 'boolean',
        description: 'Whether the task may be broken into shorter pieces.',
        optional: true,
      },
    },
  },
  {
    name: 'update_task',
    description: 'Change fields on an existing task. Only send the fields that should change.',
    readOnly: false,
    fields: {
      task_id: taskId(),
      title: title('Replacement title.'),
      description: notes(),
      priority: {
        kind: 'string',
        description: 'New priority.',
        max: 10,
        enum: PRIORITIES,
        optional: true,
      },
      difficulty: {
        kind: 'string',
        description: 'New difficulty.',
        max: 10,
        enum: DIFFICULTIES,
        optional: true,
      },
      estimated_minutes: {
        kind: 'number',
        description: 'New time estimate in minutes.',
        min: 5,
        max: 600,
        integer: true,
        optional: true,
      },
      deadline: isoDate('New due day, as YYYY-MM-DD.'),
      status: {
        kind: 'string',
        description: 'New state.',
        max: 20,
        enum: TASK_STATUSES,
        optional: true,
      },
      can_split: {
        kind: 'boolean',
        description: 'Whether the task may be split.',
        optional: true,
      },
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done.',
    readOnly: false,
    fields: { task_id: taskId() },
  },
  {
    name: 'reschedule_task',
    description:
      'Move a task to a different day, optionally at a specific time. Explain the new slot in the reply.',
    readOnly: false,
    fields: {
      task_id: taskId(),
      date: isoDate('Day to move the task to, as YYYY-MM-DD.'),
      // Optional: moving a task to another day is a valid request on its own.
      start: hhmm('Optional start time as HH:MM.', true),
      end: hhmm('Optional end time as HH:MM.', true),
      reason: {
        kind: 'string',
        description: 'One short sentence for the user.',
        max: 200,
        optional: true,
      },
    },
  },
  {
    name: 'delete_task',
    description: 'Permanently delete a task. Always confirm with the user first.',
    readOnly: false,
    fields: { task_id: taskId() },
    confirmCopy: (a) => ({
      title: 'Delete this task?',
      detail: `"${String(a.task_id ?? '')}" will be removed permanently, along with its sessions. This cannot be undone.`,
    }),
  },

  /* ---- habits ---- */
  {
    name: 'create_habit',
    description: 'Start tracking a new recurring habit.',
    readOnly: false,
    fields: {
      name: title('Habit name, e.g. "Morning walk".'),
      description: notes(),
      frequency: {
        kind: 'string',
        description: 'How often it repeats.',
        max: 10,
        enum: HABIT_FREQUENCIES,
        optional: true,
      },
      target_per_week: {
        kind: 'number',
        description: 'Target times per week for weekly habits.',
        min: 1,
        max: 7,
        integer: true,
        optional: true,
      },
      preferred_time: hhmm('Preferred time of day as HH:MM.', true),
      estimated_minutes: {
        kind: 'number',
        description: 'How long it usually takes.',
        min: 1,
        max: 240,
        integer: true,
        optional: true,
      },
      color: {
        kind: 'string',
        description: 'Hex colour such as #6366f1.',
        max: 9,
        pattern: /^#[0-9a-fA-F]{3,8}$/,
        optional: true,
      },
    },
  },
  {
    name: 'log_habit',
    description: 'Record a habit as completed (or not) for a day.',
    readOnly: false,
    fields: {
      habit_id: habitId(),
      // Optional: defaults to today.
      date: isoDate('Day to log, as YYYY-MM-DD. Omit for today.', true),
      completed: {
        kind: 'boolean',
        description: 'true marks it done, false removes the mark.',
        optional: true,
      },
    },
  },
  {
    name: 'delete_habit',
    description: 'Stop tracking a habit and remove its history. Always confirm first.',
    readOnly: false,
    fields: { habit_id: habitId() },
    confirmCopy: (a) => ({
      title: 'Delete this habit?',
      detail: `"${String(a.habit_id ?? '')}" and its entire streak history will be removed permanently. This cannot be undone.`,
    }),
  },

  /* ---- goals ---- */
  {
    name: 'create_goal',
    description: 'Add an outcome the user is working towards.',
    readOnly: false,
    fields: {
      title: title('Goal title.'),
      description: notes(),
      target_date: isoDate('Day the goal should be reached, as YYYY-MM-DD.'),
    },
  },
  {
    name: 'update_goal',
    description: 'Change a goal, including marking it achieved or abandoned.',
    readOnly: false,
    fields: {
      goal_id: goalId(),
      title: title('Replacement title.'),
      description: notes(),
      target_date: isoDate('New target day, as YYYY-MM-DD.'),
      status: {
        kind: 'string',
        description: 'New status.',
        max: 12,
        enum: GOAL_STATUSES,
        optional: true,
      },
    },
  },
  {
    name: 'delete_goal',
    description: 'Permanently delete a goal. Always confirm first.',
    readOnly: false,
    fields: { goal_id: goalId() },
    confirmCopy: (a) => ({
      title: 'Delete this goal?',
      detail: `"${String(a.goal_id ?? '')}" will be removed permanently. This cannot be undone.`,
    }),
  },

  /* ---- schedule ---- */
  {
    name: 'create_block',
    description:
      'Put a specific commitment on the calendar at an exact time. Use it for appointments and fixed events, not for open tasks.',
    readOnly: false,
    fields: {
      title: title('Block title.'),
      date: isoDate('Day of the block, as YYYY-MM-DD.'),
      start: hhmm('Start time as HH:MM.'),
      end: hhmm('End time as HH:MM.'),
      block_type: {
        kind: 'string',
        description: 'What kind of block this is.',
        max: 20,
        enum: BLOCK_TYPES,
        optional: true,
      },
      task_id: { ...taskId(), optional: true },
      habit_id: { ...habitId(), optional: true },
      note: {
        kind: 'string',
        description: 'Short note shown on the block.',
        max: 300,
        optional: true,
      },
      locked: {
        kind: 'boolean',
        description: 'True to make it immovable by the scheduler.',
        optional: true,
      },
    },
  },
  {
    name: 'move_block',
    description: 'Move an existing block to a new time or day.',
    readOnly: false,
    fields: {
      block_id: blockId(),
      date: isoDate('New day, as YYYY-MM-DD.'),
      start: hhmm('New start time as HH:MM.'),
      end: hhmm('New end time as HH:MM.', true),
    },
  },
  {
    name: 'complete_block',
    description: 'Mark a scheduled block as done or not done.',
    readOnly: false,
    fields: {
      block_id: blockId(),
      completed: {
        kind: 'boolean',
        description: 'true marks it done.',
        optional: true,
      },
    },
  },
  {
    name: 'delete_block',
    description: 'Remove a block from the schedule. Always confirm first.',
    readOnly: false,
    fields: { block_id: blockId() },
    confirmCopy: (a) => ({
      title: 'Remove this block?',
      detail: `"${String(a.block_id ?? '')}" will be removed from your schedule. This cannot be undone.`,
    }),
  },
  {
    name: 'reschedule_day',
    description:
      'Rebuild a whole day from the current tasks and habits, keeping fixed commitments. Destructive: it replaces the generated blocks for that day, so always confirm first.',
    readOnly: false,
    fields: {
      date: isoDate('Day to rebuild, as YYYY-MM-DD.'),
      keep_fixed: {
        kind: 'boolean',
        description: 'Keep immovable commitments in place.',
        optional: true,
      },
      focus_on: {
        kind: 'string',
        description: 'Optional short description of what the day should emphasise.',
        max: 200,
        optional: true,
      },
    },
    confirmCopy: (a) => ({
      title: 'Rebuild this day?',
      detail: `The generated blocks for ${String(a.date ?? 'that day')} will be replaced with a fresh plan. Fixed commitments are kept. This cannot be undone.`,
    }),
  },
  {
    name: 'add_break',
    description: 'Insert a rest break into the day.',
    readOnly: false,
    fields: {
      date: isoDate('Day for the break, as YYYY-MM-DD.'),
      start: hhmm('Break start time as HH:MM.'),
      minutes: {
        kind: 'number',
        description: 'Break length in minutes.',
        min: 5,
        max: 120,
        integer: true,
        optional: true,
      },
      title: {
        kind: 'string',
        description: 'Break label.',
        max: 60,
        optional: true,
      },
    },
  },

  /* ---- organisation ---- */
  {
    name: 'create_category',
    description: 'Create a life area or category such as "Work", "Health" or "Home".',
    readOnly: false,
    fields: {
      name: title('Category name.'),
      color: {
        kind: 'string',
        description: 'Hex colour such as #6366f1.',
        max: 9,
        pattern: /^#[0-9a-fA-F]{3,8}$/,
        optional: true,
      },
    },
  },
  {
    name: 'delete_category',
    description: 'Delete a category. Always confirm first, and say what happens to its tasks.',
    readOnly: false,
    fields: {
      category_id: {
        kind: 'string',
        description: 'The category id.',
        max: 64,
        pattern: SAFE_ID,
      },
      move_tasks_to: {
        kind: 'string',
        description: 'Category id to move its tasks into. Omit to leave them uncategorised.',
        max: 64,
        pattern: SAFE_ID,
        optional: true,
      },
    },
    confirmCopy: (a) => ({
      title: 'Delete this category?',
      detail: `The category will be removed. Its tasks are not deleted${
        a.move_tasks_to ? ' and will be moved to another category' : ' and will become uncategorised'
      }.`,
    }),
  },
] satisfies ToolEntry[]

/* ------------------------------------------------------------------ *
 * Compiled views
 * ------------------------------------------------------------------ */

function buildShape(fields: Record<string, FieldSpec>) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [name, spec] of Object.entries(fields)) {
    const base = toZod(spec)
    shape[name] = isOptional(spec) ? base.optional() : base
  }
  return shape
}

interface CompiledTool {
  entry: ToolEntry
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>
  definition: AiToolDefinition
  openRouter: {
    type: 'function'
    function: { name: string; description: string; parameters: Record<string, unknown> }
  }
}

const COMPILED: CompiledTool[] = ENTRIES.map((raw) => {
  // `satisfies` keeps each entry's `name` as a literal type (that is what makes
  // the drift check above compile-time enforced) but infers the array's element
  // type as a union that TS will not assign back to `ToolEntry` directly, so
  // widen it once, here, rather than giving up the literal names.
  const entry = raw as unknown as ToolEntry
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  const params: AiToolParamSpec[] = []
  for (const [name, spec] of Object.entries(entry.fields)) {
    properties[name] = toJsonSchemaType(spec)
    if (!isOptional(spec)) required.push(name)
    params.push(paramSpec(name, spec))
  }

  const parameters: Record<string, unknown> = { type: 'object', properties, additionalProperties: false }
  if (required.length > 0) parameters.required = required

  return {
    entry,
    // `.strict()` rejects unknown keys so a hallucinated argument can never
    // ride along into the payload.
    schema: z.object(buildShape(entry.fields)).strict(),
    definition: {
      name: entry.name,
      description: entry.description,
      params,
      destructive: isDestructiveTool(entry.name),
      readOnly: entry.readOnly,
    },
    openRouter: {
      type: 'function' as const,
      function: { name: entry.name, description: entry.description, parameters },
    },
  }
})

const BY_NAME = new Map<string, CompiledTool>(COMPILED.map((c) => [c.entry.name, c]))

/** Public tool metadata, safe to send to the browser. */
export const AI_TOOLS: AiToolDefinition[] = COMPILED.map((c) => c.definition)

/** OpenAI-compatible function-calling payload. */
export const OPENROUTER_TOOL_SCHEMAS = COMPILED.map((c) => c.openRouter)

/**
 * Compile-time guarantee that the registry and the wire union never drift.
 *
 * If a tool is added to `AiToolName` without a registry entry (or vice versa),
 * `tsc` fails here instead of the model quietly calling a tool that has no
 * implementation, or a proposal arriving with a name the browser cannot map.
 */
type RegistryName = (typeof ENTRIES)[number]['name']
type RegistryCoversUnion = Exclude<AiToolName, RegistryName> extends never
  ? true
  : ['missing registry entries for:', Exclude<AiToolName, RegistryName>]
type UnionCoversRegistry = Exclude<RegistryName, AiToolName> extends never
  ? true
  : ['untyped registry entries:', Exclude<RegistryName, AiToolName>]
const _registryMatchesUnion: [RegistryCoversUnion, UnionCoversRegistry] = [true, true]
void _registryMatchesUnion

export function isKnownTool(name: string): name is AiToolName {
  return BY_NAME.has(name)
}

export function getToolDefinition(name: string): AiToolDefinition | null {
  return BY_NAME.get(name)?.definition ?? null
}

export function isReadOnlyTool(name: string): boolean {
  return BY_NAME.get(name)?.entry.readOnly === true
}

export function toolRequiresConfirmation(name: string): boolean {
  return isDestructiveTool(name)
}

export type ToolValidation =
  | { ok: true; tool: AiToolName; args: Record<string, unknown>; destructive: boolean }
  | { ok: false; tool: string; reason: string }

export type ToolValidationFailure = Extract<ToolValidation, { ok: false }>

/**
 * Narrows a validation result to its failure branch.
 *
 * A user-defined guard rather than a bare `if (!validation.ok)`, because Vercel's
 * function builder type-checks `api/` with its own compiler options, where
 * `strictNullChecks` is off. Without it, narrowing on the boolean literal
 * discriminant does not kick in and `.reason` looks undefined.
 */
export function isToolValidationFailure(value: ToolValidation): value is ToolValidationFailure {
  return value.ok === false
}

/**
 * Validate a model-emitted tool call. Rejects unknown tools, malformed JSON,
 * missing required arguments, out-of-range numbers and unexpected keys.
 */
export function validateToolCall(name: string, rawArgs: unknown): ToolValidation {
  const compiled = BY_NAME.get(name)
  if (!compiled) {
    return { ok: false, tool: name, reason: `"${name}" is not an allowed tool.` }
  }

  let candidate = rawArgs
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim()
    if (trimmed === '') candidate = {}
    else {
      try {
        candidate = JSON.parse(trimmed)
      } catch {
        return { ok: false, tool: name, reason: 'arguments were not valid JSON' }
      }
    }
  }
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, tool: name, reason: 'arguments must be a JSON object' }
  }

  const result = compiled.schema.safeParse(candidate)
  if (!result.success) {
    const first = result.error.issues[0]
    const where = first?.path?.length ? `${first.path.join('.')}: ` : ''
    return {
      ok: false,
      tool: name,
      reason: `${where}${first?.message ?? 'arguments failed validation'}`,
    }
  }

  return {
    ok: true,
    tool: compiled.entry.name,
    args: result.data as Record<string, unknown>,
    destructive: compiled.definition.destructive,
  }
}

/** Human-readable confirmation copy for destructive tools. */
export function confirmationCopy(
  name: AiToolName,
  args: Record<string, unknown>,
): { title: string; detail: string } {
  const entry = BY_NAME.get(name)?.entry
  if (entry?.confirmCopy) return entry.confirmCopy(args)
  return {
    title: 'Apply this change?',
    detail: `The assistant wants to run "${name.replace(/_/g, ' ')}".`,
  }
}
