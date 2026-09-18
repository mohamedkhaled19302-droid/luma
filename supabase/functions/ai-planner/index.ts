// LUMA AI Planner Edge Function
//
// SAFETY MODEL
// ------------
// This function NEVER writes to the database. It only returns structured
// JSON. The client validates every value (schema + scheduling constraints),
// shows the proposal, and lets the user accept, edit or reject it.
//
// FALLBACK
// --------
// If no AI provider is configured (OPENAI_API_KEY empty), the function
// returns deterministic results so the app still works without AI.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-luma-mode',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Mode = 'parse-task' | 'explain-schedule' | 'refine-schedule'

interface TaskSummary {
  id?: string
  title: string
  priority: string
  difficulty: string
  remaining_minutes: number
  deadline?: string | null
}

interface BlockSummary {
  title: string
  block_type: string
  start: string
  end: string
  locked: boolean
  task_id?: string | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseAnon) {
      return json(
        { ok: false, error: 'Supabase is not configured on the edge function.' },
        500,
      )
    }

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    })

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      return json({ ok: false, error: 'Unauthorized.' }, 401)
    }

    const body: { mode?: Mode } = await req.json().catch(() => ({}))
    const mode = body.mode ?? 'parse-task'

    let response: unknown
    switch (mode) {
      case 'parse-task':
        response = await handleParseTask(body)
        break
      case 'explain-schedule':
        response = await handleExplainSchedule(body)
        break
      case 'refine-schedule':
        response = await handleRefineSchedule(body)
        break
      default:
        return json({ ok: false, error: `Unknown mode: ${mode}` }, 400)
    }

    return json({ ok: true, ...response })
  } catch (error) {
    console.error('ai-planner error', error)
    return json(
      { ok: false, error: 'The AI planner encountered an error. Please try again.' },
      500,
    )
  }
})

async function handleParseTask(body: Record<string, unknown>) {
  const text = typeof body.text === 'string' ? body.text : ''
  const system = [
    'You convert a student\'s natural-language request into a structured task.',
    'Extract: title (a short imperative), estimated_minutes (minutes, integer),',
    'deadline (ISO date or datetime, or null if none), priority, difficulty.',
    'Never invent a deadline. If unclear use medium/medium.',
    'Respond with JSON only:',
    '{"title":"...","estimated_minutes":60,"deadline":null,"priority":"medium","difficulty":"medium","confidence":0.8}',
  ].join(' ')

  const fallback = await parseTaskHeuristically(text)
  const result = await askModel(system, text, 0)
  if (!result.ok) return { task: fallback, source: 'deterministic' }

  try {
    const parsed = parseJson(result.content)
    return {
      task: {
        title: parseString(parsed.title) ?? fallback.title,
        estimated_minutes: clampInt(parsed.estimated_minutes, 15, 8 * 60),
        deadline: parsed.deadline ?? null,
        priority: ['low', 'medium', 'high', 'critical'].includes(parsed.priority)
          ? parsed.priority
          : 'medium',
        difficulty: ['easy', 'medium', 'hard'].includes(parsed.difficulty)
          ? parsed.difficulty
          : 'medium',
        confidence: parsed.confidence ?? 0.8,
      },
      source: 'ai',
    }
  } catch {
    return { task: fallback, source: 'deterministic' }
  }
}

async function handleExplainSchedule(body: Record<string, unknown>) {
  const blocks = Array.isArray(body.blocks) ? (body.blocks as BlockSummary[]) : []
  const tasks = Array.isArray(body.tasks) ? (body.tasks as TaskSummary[]) : []
  const compact = blocks
    .map(
      (b) =>
        `${b.block_type} ${b.start ?? ''}->${b.end ?? ''} ${b.title}${b.locked ? ' (locked)' : ''}`,
    )
    .join('; ')

  const system = [
    'You explain a student\'s daily schedule in plain, friendly language.',
    'Be brief (max 120 words). Mention why urgent/important tasks were placed',
    'first, how habits are handled, and how free time is protected.',
    'Never invent facts. Respond with JSON:',
    '{"explanation":"...","perBlock":[{"title":"...","reason":"..."}]}',
  ].join(' ')

  const fallback = {
    explanation:
      blocks.length === 0
        ? 'No activities are scheduled for this day.'
        : 'LUMA laid out the day around your fixed commitments, placing urgent tasks first and protecting free time.',
    perBlock: [] as Array<{ title: string; reason: string }>,
  }

  const result = await askModel(system, `Schedule: ${compact}\nTasks: ${JSON.stringify(tasks)}`, 0)
  if (!result.ok) return fallback
  try {
    const parsed = parseJson(result.content)
    return {
      explanation: parseString(parsed.explanation) ?? fallback.explanation,
      perBlock: Array.isArray(parsed.perBlock)
        ? parsed.perBlock.slice(0, 20).map((item: Record<string, unknown>) => ({
            title: parseString(item.title) ?? '',
            reason: parseString(item.reason) ?? '',
          }))
        : [],
    }
  } catch {
    return fallback
  }
}

async function handleRefineSchedule(body: Record<string, unknown>) {
  const schedule = Array.isArray(body.schedule) ? (body.schedule as BlockSummary[]) : []
  const tasks = Array.isArray(body.tasks) ? (body.tasks as TaskSummary[]) : []
  const problem = typeof body.problemStatement === 'string' ? body.problemStatement : ''

  const system = [
    'You are a schedule suggestions engine. Given a schedule and tasks, propose improvements.',
    'Return a JSON array of actions. Allowed actions:',
    'place_task (task_id, start, end), move_task (task_id, start, end),',
    'add_break (start, end), remove_task_block (task_id).',
    'Never touch locked blocks. Never invent task ids. Keep changes minimal.',
    'Every object needs: {"action":"...","task_id":null,"start":null,"end":null,"reason":"...","confidence":0.5}',
  ].join(' ')

  const fallback: unknown[] = []

  const payload = {
    schedule,
    tasks,
    problem: problem || 'Find conflicts or overloaded periods and improve balance.',
  }

  const result = await askModel(system, JSON.stringify(payload), 0.2)
  if (!result.ok) return { actions: [] }
  try {
    const parsed = parseJson(result.content)
    const actions = Array.isArray(parsed) ? parsed : parsed?.actions
    if (!Array.isArray(actions)) return { actions: [] }
    return {
      actions: actions.slice(0, 10).map((action: Record<string, unknown>) => ({
        action: action.action ?? 'place_task',
        task_id: action.task_id ?? null,
        habit_id: action.habit_id ?? null,
        start: action.start ?? null,
        end: action.end ?? null,
        reason: parseString(action.reason) ?? '',
        confidence: Number(action.confidence ?? 0.5),
      })),
    }
  } catch {
    return { actions: [] }
  }
}

// ---------------------------------------------------------------------------
// Helpers

function askModel(
  system: string,
  user: string,
  temperature: number,
): Promise<{ ok: boolean; content: string }> {
  const apiKey = Deno.env.get('OPENAI_API_KEY') ?? Deno.env.get('AI_API_KEY')
  if (!apiKey) return Promise.resolve({ ok: false, content: '' })

  const baseUrl = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1'
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini'

  return fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 800,
    }),
  })
    .then(async (res) => {
      if (!res.ok) return { ok: false, content: '' }
      const data = await res.json()
      const content: string =
        data?.choices?.[0]?.message?.content ?? ''
      return { ok: Boolean(content), content }
    })
    .catch(() => ({ ok: false, content: '' }))
}

function parseJson(text: string): Record<string, unknown> {
  let clean = text.trim()
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) clean = (fenced[1] ?? '').trim()
  return JSON.parse(clean)
}

function parseString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function clampInt(value: unknown, min: number, max: number): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return min
  return Math.max(min, Math.min(max, Math.round(num)))
}

/** Deterministic fallback parser so natural-language tasks work without AI. */
function parseTaskHeuristically(text: string): Record<string, unknown> {
  const lower = text.toLowerCase()

  const daysMap: Record<string, number> = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 0,
  }

  let deadline: string | null = null
  for (const [day, targetDay] of Object.entries(daysMap)) {
    if (lower.includes(`next ${day}`)) {
      deadline = nextWeekdayDate(targetDay, 7)
      break
    } else if (lower.includes(day)) {
      deadline = nextWeekdayDate(targetDay, 0)
      break
    }
  }

  const durationMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)/i)
  const minutesMatch = text.match(/(\d+)\s*minutes?\b/i)
  const estimatedMinutes = durationMatch
    ? Math.round(parseFloat(durationMatch[1]) * 60)
    : minutesMatch
      ? parseInt(minutesMatch[1], 10)
      : 60

  const priority = /urgent|asap|critical|today/.test(lower)
    ? 'high'
    : 'medium'

  return {
    title: titleFrom(text),
    estimated_minutes: clampInt(estimatedMinutes, 15, 8 * 60),
    deadline,
    priority,
    difficulty: 'medium',
    confidence: 0.5,
  }
}

function titleFrom(text: string): string {
  const clean = text
    .replace(/^(i need to|i have to|i must|please|can you|i want to)\s+/i, '')
    .replace(/\s+(by|for|before)\s+.*$/i, '')
    .replace(/\s+(take|takes?|will take|about)\s.*$/i, '')
    .trim()
  if (!clean) return 'Untitled task'
  return clean.charAt(0).toUpperCase() + clean.slice(1, 120)
}

function nextWeekdayDate(targetDay: number, minDaysFromNow: number): string {
  const date = new Date()
  const today = date.getDay()
  let delta = (targetDay - today + 7) % 7
  if (delta === 0) delta = 7
  if (delta < minDaysFromNow) delta += 7
  date.setDate(date.getDate() + delta)
  date.setHours(17, 0, 0, 0)
  return date.toISOString()
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  })
}