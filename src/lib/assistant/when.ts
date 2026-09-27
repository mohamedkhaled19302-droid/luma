import { addDays, startOfDay } from 'date-fns'
import {
  addMinutesToTime,
  parseTimeToken,
  resolveDateFromLabel,
  type AssistantTime,
} from './parser'

export type WhenSpec =
  | { kind: 'window'; day: Date; from: AssistantTime; to: AssistantTime }
  | { kind: 'day'; day: Date }
  | { kind: 'range'; start: Date; end: Date }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const WINDOW_RE =
  /\b(?:from|between)?\s*(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to|until|till|through)\s*(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?\b/i

const SINGLE_TIME_RE = /\b(?:at|around|~|from)\s+(\d{1,2})(?::([0-5]\d))?(?!\s+[a-z]{3,9}\b)\s*(a\.?m\.?|p\.?m\.?)?\b/i

const ANYTIME_RE = /\b(?:anytime|any time|whenever|whenever works|free|free time|no preference|don'?t matter|up to you|sometime|whenever you'?d like)\b/i

const RANGE_TO_RE = /\b(?:from|between)\s+(.+?)\s+(?:to|until|through|and)\s+(.+?)\s*$/i
const RANGE_BARE_RE = /\b(.+?)\s+(?:to|until|through)\s+(.+?)\s*$/i

const WEEKDAY_RE = /(?:next\s+|on\s+|this\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
const TOMORROW_RE = /(?:on\s+|next\s+)?tomorrow\b/i
const TODAY_RE = /\b(today|tonight)\b/i
const NEXT_WEEK_RE = /\bnext\s+week\b/i

function monthToIndex(word: string): number | null {
  const key = word.toLowerCase().slice(0, 3)
  const index = MONTHS.indexOf(key)
  return index >= 0 ? index : null
}

function dayOfYearDate(month: number, day: number): { month: number; day: number } | null {
  if (month < 0 || month > 11) return null
  if (day < 1 || day > 31) return null
  const maxDay = new Date(2000, month + 1, 0).getDate()
  if (day > maxDay) return null
  return { month, day }
}

function parseDateToken(token: string, now: Date): Date | null {
  const text = token.trim().replace(/\s+/g, ' ')
  if (!text) return null

  const label = resolveDateFromLabel(text.toLowerCase(), now)
  if (label) return label

  const match = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})$/i.exec(text)
  if (match) {
    const month = monthToIndex(match[2] ?? '')
    const resolved = dayOfYearDate(month ?? -1, Number(match[1]))
    if (resolved) return withYear(resolved.month, resolved.day, now)
    return null
  }

  const reverse = /^([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?$/i.exec(text)
  if (reverse) {
    const month = monthToIndex(reverse[1] ?? '')
    const resolved = dayOfYearDate(month ?? -1, Number(reverse[2]))
    if (resolved) return withYear(resolved.month, resolved.day, now)
    return null
  }

  const numeric = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/.exec(text)
  if (numeric) {
    let month = Number(numeric[1])
    let day = Number(numeric[2])
    if (month > 12) {
      const swap = day
      day = month
      month = swap
    }
    const resolved = dayOfYearDate(month - 1, day)
    if (!resolved) return null
    if (numeric[3]) {
      const year = Number(numeric[3])
      const fullYear = year < 100 ? 2000 + year : year
      const date = startOfDay(new Date(fullYear, resolved.month, resolved.day))
      return date.getTime() >= startOfDay(now).getTime() ? date : null
    }
    return withYear(resolved.month, resolved.day, now)
  }

  return null
}

function withYear(month: number, day: number, now: Date): Date {
  const today = startOfDay(now)
  let year = now.getFullYear()
  let date = startOfDay(new Date(year, month, day))
  if (date.getTime() < today.getTime()) {
    year += 1
    date = startOfDay(new Date(year, month, day))
  }
  return date
}

function compactDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function extractWindow(text: string): { from: AssistantTime | null; to: AssistantTime | null } {
  const match = WINDOW_RE.exec(text)
  if (match) {
    const first = parseTimeToken(`${match[1] ?? ''}${match[2] ? `:${match[2]}` : ''} ${match[3] ?? 'pm'}`)
    const second = parseTimeToken(`${match[4] ?? ''}${match[5] ? `:${match[5]}` : ''} ${match[6] ?? 'pm'}`)
    if (first && second) return { from: first, to: second }
  }
  const single = SINGLE_TIME_RE.exec(text)
  if (single) {
    const from = parseTimeToken(`${single[1] ?? ''}${single[2] ? `:${single[2]}` : ''} ${single[3] ?? 'pm'}`)
    if (from) {
      const to = addMinutesToTime(from, 60)
      return { from, to }
    }
  }
  return { from: null, to: null }
}

function detectRange(text: string, now: Date): { start: Date; end: Date } | null {
  const withVehicle = RANGE_TO_RE.exec(text)
  if (withVehicle) {
    const start = parseDateToken(withVehicle[1] ?? '', now)
    const end = parseDateToken(withVehicle[2] ?? '', now)
    if (start && end && compactDateKey(start) !== compactDateKey(end)) {
      return orderRange(start, end)
    }
    if (start && end && compactDateKey(start) === compactDateKey(end) && !WINDOW_RE.test(text)) {
      return { start, end }
    }
    return null
  }

  const bare = RANGE_BARE_RE.exec(text)
  if (bare) {
    const start = parseDateToken(bare[1] ?? '', now)
    const end = parseDateToken(bare[2] ?? '', now)
    if (start && end) return orderRange(start, end)
  }
  return null
}

function orderRange(a: Date, b: Date): { start: Date; end: Date } {
  return a.getTime() <= b.getTime() ? { start: a, end: b } : { start: b, end: a }
}

function extractLabel(text: string): string | null {
  if (NEXT_WEEK_RE.test(text)) return 'next week'
  const weekday = WEEKDAY_RE.exec(text)
  if (weekday?.[1]) return weekday[1].toLowerCase()
  const tomorrow = TOMORROW_RE.exec(text)
  if (tomorrow?.[0]) return 'tomorrow'
  const today = TODAY_RE.exec(text)
  if (today?.[1]) return today[1].toLowerCase()
  return null
}

function dayRef(text: string, now: Date): Date | null {
  const label = extractLabel(text)
  if (!label) return null
  return resolveDateFromLabel(label, now)
}

export function parseWhenSpec(input: string, now: Date = new Date()): WhenSpec | null {
  const text = input.trim().replace(/\s+/g, ' ')
  if (!text) return null

  if (ANYTIME_RE.test(text)) {
    return { kind: 'day', day: startOfDay(now) }
  }

  const range = detectRange(text, now)
  if (range) return { kind: 'range', start: range.start, end: range.end }

  const explicit = parseDateToken(text.replace(/^(?:from|on|due|by)\s+/i, ''), now)
  const labelDay = dayRef(text, now)

  const { from, to } = extractWindow(text)
  if (from && to) {
    return { kind: 'window', day: explicit ?? labelDay ?? startOfDay(now), from, to }
  }

  if (explicit) return { kind: 'day', day: explicit }
  if (labelDay) return { kind: 'day', day: labelDay }

  return null
}

export function rangeDayCount(spec: Extract<WhenSpec, { kind: 'range' }>): number {
  const from = startOfDay(spec.start)
  const to = startOfDay(spec.end)
  let count = 1
  let cursor = from
  while (cursor.getTime() < to.getTime()) {
    cursor = addDays(cursor, 1)
    count += 1
  }
  return count
}