import { addDays, startOfDay, startOfWeek } from 'date-fns'
import { BRAND } from '@/lib/brand'

export type AssistantIntent = 'task' | 'habit' | 'focus' | 'review' | 'help'
export type AssistantHabitFrequency = 'daily' | 'weekly'

export interface AssistantTime {
  hour: number
  minute: number
}

export interface AssistantPlanRequest {
  intent: AssistantIntent
  title: string
  date: Date | null
  dateLabel: string | null
  from: AssistantTime | null
  to: AssistantTime | null
  explicitWindow: boolean
  durationMinutes: number | null
  frequency: AssistantHabitFrequency | null
  targetPerWeek: number | null
  raw: string
}

const MINUTE = 60

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const SMALL_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'to',
  'of',
  'for',
  'on',
  'in',
  'with',
  'at',
  'by',
  'from',
  'via',
  'per',
])

const TIME_OF_DAY_RE = /\b(morning|afternoon|evening|at night|night)\b/gi

const WEEKDAY_RE = /(?:next\s+|on\s+|this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
const TOMORROW_RE = /(?:on\s+|next\s+)?tomorrow\b/i
const TODAY_RE = /\b(today|tonight)\b/i
const NEXT_WEEK_RE = /\bnext\s+week\b/i

const DAILY_RE = /\b(every\s+day|everyday|each\s+day|every\s+single\s+day|daily)\b/i
const WEEKLY_RE = /\bweekly\b/i
const PER_WEEK_RE =
  /\b(?:once|twice|(\d+))\s*(?:times?|days?|sessions?|x)?\s*(?:a|per|each|every|\/)\s*week\b/i
const CADENCE_RE = new RegExp(
  `${DAILY_RE.source}|${PER_WEEK_RE.source}|${WEEKLY_RE.source}`,
  'i',
)

const HABIT_WORD_RE = /\b(?:habit|routine)s?\b/i

const HELP_RE =
  /^(?:help|what\s+can\s+you\s+do|what\s+do\s+you\s+do|how\s+do\s+you\s+work|how\s+(?:can|does)\s+this\s+work|what\s+are\s+you|what\s+can\s+i\s+do|how\s+can\s+you\s+help|what\s+can\s+i\s+do\s+here|how\s+do\s+i\s+use\s+(?:this|you)|features|capabilities|commands|options)\s*[?.!]*$/i

const WINDOW_RE =
  /\b(?:from|between)?\s*(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to|until|till|through)\s*(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\b/i

const SINGLE_TIME_RE = /\b(?:at|around|~|from)\s+(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i

const AT_DIGIT_RE = /\b(?:at|from|around|~)\s+(\d{1,2})(?::([0-5]\d))?\b/i

const END_TIME_RE =
  /\b(?:to|until|till|through)\s*(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\b/i

const NOON_MIDNIGHT_RE = /\b(noon|midday|midnight)\b/i

const HALF_HOUR_RE = /\bhalf\s+an?\s+hour\b/i
const ONE_HOUR_RE = /\b(?:an?|one)\s+hour\b/i
const NUM_DURATION_RE = /\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|min)\b/i

const TRAILING_RE =
  /\b(it\s*takes|it'?ll\s*take|it\s*will\s*take|will\s*take|would\s*take|takes|needs?|to\s+finish|to\s+complete)\b/gi

const PREAMBLE_RE =
  /^(?:(?:hi|hello|hey|heyy|hiya|yo|sup|ok|okay|so|well|please|thanks|thank you|can you|could you|would you|i'?d|i'?m|i am|i would|i|you|we)\b\s*[,\s]*)+(?:(?:like|want|need|would like)\s+to\s+)*/i

const TASK_INTRO_RE =
  /^(?:(?:please|can you|could you|would you)\s+)?(?:add|create|make|set up|schedule|plan|book|put)\s+(?:a|an|the|another)?\s*(?:new\s+)?(?:task|item|to-do|todo)\s*(?::|-|\s+to|\s+for|\s+about|\s+on|\s+that\s+reads|\s+to\s+go)?\s*/i

const HABIT_INTRO_RE =
  /^\s*(?:(?:please|can you|could you|would you|i'?d like to|i want to|i need to)\s+)?(?:add|create|make|start|set up|build|keep|maintain|form|begin)?\s*(?:a|an|the|another)?\s*(?:new|daily|weekly)?\s*(?:habit|routine)\s*(?::|\s+of\s+doing|\s+of|\s+doing|\s+to\s+go|\s+to|\s+for)?\s*/i

const ACTION_LEADER_RE =
  /^(?:add|create|make|set up|schedule|plan|book|put|do|prepare|prep|start|begin)\b\s+/i

const REVIEW_VERB_RE = /^(?:review|revise|go\s+over|read\s+over|go\s+through|look\s+over)\s+/i

const GENERIC_TITLES = new Set(['task', 'habit', 'review task'])

const ACTION_START_SRC = String.raw`(?:\b(?:add|create|make|start|schedule|plan|book|study|review|revise|focus|read|write|do|finish|prep|practice|prepare|begin)\b|\bset\s+up\b|\bgo\s+over\b|\bread\s+over\b)`
const INTRODUCER_SRC = String.raw`(?:\b(?:a|an|the|new|another)\s+(?:habit|routine|task|focus\s+session)\b)`
const SPLIT_RE = new RegExp(
  String.raw`(?:\s+(?:and|then|also|plus)\s+|\s*[;,]\s+)(?=${ACTION_START_SRC}|${INTRODUCER_SRC})`,
  'gi',
)

export function parseTimeToken(value: string): AssistantTime | null {
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, ' ')
  if (/\bnoon|midday\b/.test(trimmed)) return { hour: 12, minute: 0 }
  if (/\bmidnight\b/.test(trimmed)) return { hour: 0, minute: 0 }
  const match = /^(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?$/.exec(trimmed)
  if (!match) return null
  let hour = Number(match[1])
  const minute = match[2] ? Number(match[2]) : 0
  const meridiem = match[3]
  if (meridiem) {
    const pm = /^p/i.test(meridiem)
    if (pm && hour < 12) hour += 12
    if (!pm && hour === 12) hour = 0
  } else if (hour < 12) {
    hour += 12
  }
  return { hour, minute }
}

export function addMinutesToTime(time: AssistantTime, minutes: number): AssistantTime {
  const total = time.hour * MINUTE + time.minute + minutes
  return { hour: Math.floor(total / MINUTE) % 24, minute: total % MINUTE }
}

export function resolveDateFromLabel(label: string | null, now: Date): Date | null {
  if (!label) return null
  const today = startOfDay(now)
  const lower = label.toLowerCase()
  if (lower === 'today' || lower === 'tonight') return today
  if (lower === 'tomorrow') return addDays(today, 1)
  if (lower === 'next week') return addDays(startOfWeek(today, { weekStartsOn: 0 }), 7)
  const index = WEEKDAYS[lower]
  if (index == null) return null
  let offset = (index - today.getDay() + 7) % 7
  if (offset === 0) offset = 7
  return addDays(today, offset)
}

export function capTitle(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase()
      if (index > 0 && SMALL_WORDS.has(lower)) return lower
      if (index > 0 && /^\d+$/.test(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

export function formatMinutesOfDay(time: AssistantTime): string {
  const h = String(time.hour).padStart(2, '0')
  const m = String(time.minute).padStart(2, '0')
  return `${h}:${m}`
}

function isPureGreeting(lower: string): boolean {
  const compact = lower.trim().replace(/[^a-z'\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!compact) return false
  const name = BRAND.name.toLowerCase()
  const named = new RegExp(
    `^(?:hi|hello|hey|heyy|hiya|hola|howdy|yo|sup)\\s+(?:${name}|there|friend)\\s*$`,
  )
  if (named.test(compact)) {
    return true
  }
  if (/^(?:hi|hello|hey|heyy|hiya|hola|howdy|yo|sup)(?:\s+there)?\s*$/.test(compact)) {
    return true
  }
  if (/^(?:good\s+morning|good\s+afternoon|good\s+evening)\s*$/.test(compact)) return true
  return /^what'?s\s+(?:up|going\s+on)\s*$/.test(compact)
}

function detectIntent(lower: string): AssistantIntent {
  if (isPureGreeting(lower)) return 'help'
  if (HELP_RE.test(lower)) return 'help'
  if (HABIT_WORD_RE.test(lower)) return 'habit'
  if (CADENCE_RE.test(lower)) return 'habit'
  if (/\bfocus\b/.test(lower)) return 'focus'
  if (/\b(?:review|revise|go\s+over|read\s+over|go\s+through|look\s+over)\b/.test(lower)) {
    return 'review'
  }
  return 'task'
}

function detectCadence(lower: string): { frequency: AssistantHabitFrequency; targetPerWeek: number } {
  const perWeek = PER_WEEK_RE.exec(lower)
  if (perWeek && perWeek[0]) {
    const head = perWeek[0].toLowerCase()
    const value = perWeek[1] ? Number(perWeek[1]) : head.startsWith('once') ? 1 : head.startsWith('twice') ? 2 : 1
    return { frequency: 'weekly', targetPerWeek: value }
  }
  if (DAILY_RE.test(lower)) return { frequency: 'daily', targetPerWeek: 7 }
  if (WEEKLY_RE.test(lower)) return { frequency: 'weekly', targetPerWeek: 3 }
  return { frequency: 'daily', targetPerWeek: 7 }
}

function detectDate(lower: string): { label: string | null; re: RegExp } {
  if (NEXT_WEEK_RE.test(lower)) {
    return { label: 'next week', re: NEXT_WEEK_RE }
  }
  const weekday = WEEKDAY_RE.exec(lower)
  if (weekday?.[1]) {
    const word = weekday[1].toLowerCase()
    return { label: word, re: new RegExp(`(?:next\\s+|on\\s+|this\\s+)?${word}\\b`, 'i') }
  }
  if (TOMORROW_RE.test(lower)) {
    return { label: 'tomorrow', re: TOMORROW_RE }
  }
  const today = TODAY_RE.exec(lower)
  if (today?.[1]) {
    const word = today[1].toLowerCase()
    return { label: word, re: new RegExp(`\\b${word}\\b`, 'i') }
  }
  return { label: null, re: /(?!)/ }
}

function extractDuration(input: string): { minutes: number | null; cleaned: string } {
  const half = HALF_HOUR_RE.exec(input)
  if (half) return { minutes: 30, cleaned: input.replace(half[0], ' ') }
  const one = ONE_HOUR_RE.exec(input)
  if (one) return { minutes: 60, cleaned: input.replace(one[0], ' ') }
  const numeric = NUM_DURATION_RE.exec(input)
  if (numeric?.[1]) {
    const minutes = Number(numeric[1])
    const unit = (numeric[2] ?? '').toLowerCase()
    return {
      minutes: unit.startsWith('h') ? Math.round(minutes * MINUTE) : Math.round(minutes),
      cleaned: input.replace(numeric[0], ' '),
    }
  }
  return { minutes: null, cleaned: input }
}

function joinToken(match: RegExpExecArray, hourI: number, minuteI: number, meridiemI: number): string {
  const h = match[hourI] ?? ''
  const min = match[minuteI] ? `:${match[minuteI]}` : ''
  const meridiem = match[meridiemI] ? ` ${match[meridiemI]}` : ''
  return `${h}${min}${meridiem}`
}

function stripTimeTokens(text: string): string {
  return text
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, ' ')
    .replace(/\b(?:at|around|by|until|till|from)\s+\d{1,2}\b/gi, ' ')
    .replace(/\b(?:a\.?m\.?|p\.?m\.?)\b/gi, ' ')
    .trim()
}

function extractWindow(base: string): {
  from: AssistantTime | null
  to: AssistantTime | null
  base: string
} {
  const window = WINDOW_RE.exec(base)
  if (window) {
    const first = parseTimeToken(joinToken(window, 1, 2, 3))
    const second = parseTimeToken(joinToken(window, 4, 5, 6))
    if (first && second) {
      return { from: first, to: second, base: base.replace(window[0], ' ') }
    }
  }

  const seasonal = NOON_MIDNIGHT_RE.exec(base)
  if (seasonal?.[1]) {
    const from = seasonal[1].toLowerCase() === 'midnight' ? { hour: 0, minute: 0 } : { hour: 12, minute: 0 }
    let cleaned = base.replace(seasonal[0], ' ')
    const end = END_TIME_RE.exec(cleaned)
    if (end) {
      const to = parseTimeToken(joinToken(end, 1, 2, 3))
      if (to) {
        cleaned = cleaned.replace(end[0], ' ')
        return { from, to, base: cleaned }
      }
    }
    return { from, to: null, base: cleaned }
  }

  const single = SINGLE_TIME_RE.exec(base)
  if (single) {
    const parsed = parseTimeToken(`${single[1] ?? ''}${single[2] ? `:${single[2]}` : ''} ${single[3] ?? 'pm'}`)
    if (parsed) {
      return { from: parsed, to: null, base: base.replace(single[0], ' ') }
    }
  }

  const atDigit = AT_DIGIT_RE.exec(base)
  if (atDigit) {
    const parsed = parseTimeToken(`${atDigit[1] ?? ''}${atDigit[2] ? `:${atDigit[2]}` : ''}`)
    if (parsed) {
      return { from: parsed, to: null, base: base.replace(atDigit[0], ' ') }
    }
  }

  return { from: null, to: null, base }
}

function buildTitle(intent: AssistantIntent, raw: string): string {
  if (intent === 'help') return ''
  if (intent === 'focus') return 'Focus session'

  let s = raw.trim().replace(/\s+/g, ' ')
  s = s.replace(TIME_OF_DAY_RE, ' ')
  s = s.replace(TRAILING_RE, ' ')
  s = s.replace(PREAMBLE_RE, ' ')
  s = s.replace(/^[,;:\-–—\s]+/, ' ')

  if (intent === 'habit') {
    s = s.replace(HABIT_INTRO_RE, ' ')
    s = s.replace(DAILY_RE, ' ')
    s = s.replace(WEEKLY_RE, ' ')
    s = s.replace(PER_WEEK_RE, ' ')
  } else {
    s = s.replace(TASK_INTRO_RE, ' ')
    s = s.replace(ACTION_LEADER_RE, ' ')
  }

  s = s.replace(/^[,;:\-–—\s]+|[,;:\-–—\s]+$/g, '')
  s = s.replace(/^(?:a|an|the|of|to|for|about|on|in|with|by)\s+/i, '')
  s = s.replace(/\s+(?:a|an|the|of|to|for|about|on|in|with|by|from)\s*$/i, '')
  s = s.trim()

  if (s === '') {
    if (intent === 'review') return 'Review task'
    if (intent === 'habit') return 'Habit'
    return 'Task'
  }

  if (intent === 'review') {
    const topic = s.replace(REVIEW_VERB_RE, '').trim()
    if (!topic) return 'Review task'
    return `Review ${capTitle(topic)}`
  }

  return capTitle(s)
}

function splitIntoSegments(text: string): string[] {
  const segments: string[] = []
  let cursor = 0
  SPLIT_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = SPLIT_RE.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length
    if (start > cursor && cursor < text.length) {
      const part = text.slice(cursor, start).trim()
      if (part) segments.push(part)
    }
    cursor = end
  }
  const tail = text.slice(cursor).trim()
  if (tail) segments.push(tail)
  return segments
}

export function parsePlanRequest(input: string, now: Date = new Date()): AssistantPlanRequest {
  const raw = input.trim().replace(/\s+/g, ' ')
  const lower = raw.toLowerCase()

  const intent = detectIntent(lower)

  const { label, re: dateRe } = detectDate(lower)
  const date = resolveDateFromLabel(label, now)

  let base = raw.replace(dateRe, ' ')

  const windowed = extractWindow(base)
  const from = windowed.from
  const to = windowed.to
  base = stripTimeTokens(windowed.base)

  const duration = extractDuration(base)
  base = duration.cleaned

  const resolvedTo = from && !to ? addMinutesToTime(from, duration.minutes ?? MINUTE) : to

  let resolvedIntent = intent
  let title = buildTitle(intent, base)
  if (
    resolvedIntent !== 'help' &&
    resolvedIntent !== 'focus' &&
    GENERIC_TITLES.has(title.toLowerCase()) &&
    from === null &&
    duration.minutes === null &&
    date === null
  ) {
    resolvedIntent = 'help'
    title = ''
  }

  const cadence =
    resolvedIntent === 'habit' ? detectCadence(lower) : { frequency: null, targetPerWeek: null }

  return {
    intent: resolvedIntent,
    title,
    date,
    dateLabel: label,
    from,
    to: resolvedTo,
    explicitWindow: from !== null,
    durationMinutes: duration.minutes,
    frequency: (cadence.frequency ?? null) as AssistantHabitFrequency | null,
    targetPerWeek: cadence.targetPerWeek,
    raw,
  }
}

export function parsePlanRequests(input: string, now: Date = new Date()): AssistantPlanRequest[] {
  const text = input.trim().replace(/\s+/g, ' ')
  if (!text) return []
  return splitIntoSegments(text)
    .map((segment) => parsePlanRequest(segment, now))
    .filter((request) => request.raw.length > 0)
}