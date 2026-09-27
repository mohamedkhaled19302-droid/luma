export interface FocusSession {
  startedAt: string
  endedAt: string
  durationMinutes: number
  completed: boolean
}

export interface DayStat {
  date: string
  minutes: number
  sessions: number
}

export interface FocusStats {
  totalMinutes: number
  totalSessions: number
  completedSessions: number
  currentStreak: number
  longestStreak: number
  bestDay: DayStat | null
  lastSeven: DayStat[]
  weekMinutes: number
  dailyAverage: number
  completionRate: number
}

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

function keyOfUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function dayKeyAt(date: Date, tz: string): string {
  if (Number.isNaN(date.getTime())) return ''
  if (tz === 'UTC' || tz === 'Etc/UTC') return keyOfUTC(date)
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const field = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    const key = `${field('year')}-${field('month')}-${field('day')}`
    return key.includes('undefined') ? keyOfUTC(date) : key
  } catch {
    return keyOfUTC(date)
  }
}

function keyAddDays(key: string, days: number): string {
  const parts = key.split('-').map(Number)
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return key
  const y = parts[0] ?? 0
  const m = parts[1] ?? 0
  const d = parts[2] ?? 0
  const date = new Date(Date.UTC(y, m - 1, d + days, 12))
  return keyOfUTC(date)
}

export function computeFocusStats(sessions: FocusSession[], now: Date, tz?: string): FocusStats {
  const timeZone = tz?.trim() || deviceTimeZone()
  const rows = sessions ?? []
  const todayKey = dayKeyAt(now, timeZone)

  const completedDays = new Map<string, { minutes: number; sessions: number }>()
  const allDays = new Map<string, { minutes: number; sessions: number }>()
  let totalMinutes = 0
  let totalSessions = 0
  let completedSessions = 0

  for (const session of rows) {
    if (!session || typeof session.durationMinutes !== 'number' || session.durationMinutes <= 0) continue
    totalSessions += 1
    const key = dayKeyAt(new Date(session.endedAt), timeZone)
    if (!key) continue
    const all = allDays.get(key) ?? { minutes: 0, sessions: 0 }
    all.minutes += session.durationMinutes
    all.sessions += 1
    allDays.set(key, all)
    if (session.completed) {
      completedSessions += 1
      totalMinutes += session.durationMinutes
      const done = completedDays.get(key) ?? { minutes: 0, sessions: 0 }
      done.minutes += session.durationMinutes
      done.sessions += 1
      completedDays.set(key, done)
    }
  }

  const lastSeven = Array.from({ length: 7 }, (_, i) => {
    const key = keyAddDays(todayKey, -(6 - i))
    const day = completedDays.get(key)
    return { date: key, minutes: day?.minutes ?? 0, sessions: day?.sessions ?? 0 }
  })
  const weekMinutes = lastSeven.reduce((sum, day) => sum + day.minutes, 0)

  let bestDay: DayStat | null = null
  for (const key of [...completedDays.keys()].sort()) {
    const day = completedDays.get(key)
    if (!day) continue
    const stat = { date: key, minutes: day.minutes, sessions: day.sessions }
    if (!bestDay || stat.minutes >= bestDay.minutes) bestDay = stat
  }

  const keys = [...completedDays.keys()].sort()
  let longestStreak = 0
  let run = 0
  let previous: string | null = null
  for (const key of keys) {
    run = previous !== null && keyAddDays(previous, 1) === key ? run + 1 : 1
    if (run > longestStreak) longestStreak = run
    previous = key
  }

  const last = keys[keys.length - 1]
  const isCurrent =
    last !== undefined && (last === todayKey || last === keyAddDays(todayKey, -1))
  let currentStreak = 0
  let cursor = isCurrent ? (last as string) : ''
  while (cursor && completedDays.has(cursor)) {
    currentStreak += 1
    cursor = keyAddDays(cursor, -1)
  }

  return {
    totalMinutes,
    totalSessions,
    completedSessions,
    currentStreak,
    longestStreak,
    bestDay,
    lastSeven,
    weekMinutes,
    dailyAverage: Math.round((weekMinutes / 7) * 10) / 10,
    completionRate: totalSessions > 0 ? completedSessions / totalSessions : 0,
  }
}