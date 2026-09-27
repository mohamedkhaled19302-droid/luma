import { describe, expect, it } from 'vitest'
import type { DeadlineReminder } from '@/types/models'
import {
  classifyDeadlineUrgency,
  deadlineNotificationKey,
  scanDeadlines,
  selectUnsentDeadlineReminders,
  type DeadlineScanOptions,
  type DeadlineSource,
} from '@/services/deadline-service'

const now = () => new Date(2026, 2, 4, 12, 0, 0)

const source = (overrides: Partial<DeadlineSource> = {}): DeadlineSource => ({
  id: 'item-1',
  title: 'Essay draft',
  kind: 'task',
  due_at: new Date(2026, 2, 4, 17, 0, 0).toISOString(),
  ...overrides,
})

const scanned = (sources: DeadlineSource[], overrides: DeadlineScanOptions = {}) =>
  scanDeadlines(sources, { now: now(), ...overrides })

describe('classifyDeadlineUrgency', () => {
  it('marks a past due as overdue', () => {
    expect(classifyDeadlineUrgency(new Date(2026, 2, 4, 11, 0, 0), now())).toBe('overdue')
  })

  it('marks a deadline exactly now as overdue', () => {
    expect(classifyDeadlineUrgency(new Date(2026, 2, 4, 12, 0, 0), now())).toBe('overdue')
  })

  it('labels anything later in the same day as due-today', () => {
    expect(classifyDeadlineUrgency(new Date(2026, 2, 4, 17, 0, 0), now())).toBe('due-today')
  })

  it('labels the next calendar day as due-tomorrow', () => {
    expect(classifyDeadlineUrgency(new Date(2026, 2, 5, 9, 0, 0), now())).toBe('due-tomorrow')
  })

  it('labels later days as upcoming', () => {
    expect(classifyDeadlineUrgency(new Date(2026, 2, 6, 9, 0, 0), now())).toBe('upcoming')
  })
})

describe('scanDeadlines', () => {
  it('returns overdue items regardless of how far past', () => {
    const reminders = scanned([
      source({ id: 'old', due_at: new Date(2026, 2, 2, 8, 0, 0).toISOString() }),
    ])
    expect(reminders).toHaveLength(1)
    expect(reminders[0]?.urgency).toBe('overdue')
  })

  it('includes items today and tomorrow within the default window', () => {
    const reminders = scanned([
      source({ id: 'today', due_at: new Date(2026, 2, 4, 17, 0, 0).toISOString() }),
      source({ id: 'tomorrow', due_at: new Date(2026, 2, 5, 17, 0, 0).toISOString() }),
      source({ id: 'soon', kind: 'event', due_at: new Date(2026, 2, 6, 9, 0, 0).toISOString() }),
    ])
    expect(reminders.map((reminder) => reminder.id)).toEqual(['today', 'tomorrow', 'soon'])
  })

  it('excludes upcoming items beyond the window hours', () => {
    const reminders = scanned([
      source({ id: 'far', due_at: new Date(2026, 2, 8, 9, 0, 0).toISOString() }),
    ])
    expect(reminders).toHaveLength(0)
  })

  it('honours a custom window', () => {
    const reminders = scanned(
      [source({ id: 'far', due_at: new Date(2026, 2, 6, 9, 0, 0).toISOString() })],
      { windowHours: 8 },
    )
    expect(reminders).toHaveLength(0)
  })

  it('drops sources with an invalid due date', () => {
    const reminders = scanned([source({ due_at: 'not-a-date' })])
    expect(reminders).toHaveLength(0)
  })

  it('sorts by due time ascending', () => {
    const reminders = scanned([
      source({ id: 'late', due_at: new Date(2026, 2, 4, 18, 0, 0).toISOString() }),
      source({ id: 'early', due_at: new Date(2026, 2, 4, 13, 0, 0).toISOString() }),
    ])
    expect(reminders.map((reminder) => reminder.id)).toEqual(['early', 'late'])
  })
})

describe('deadlineNotificationKey', () => {
  const reminder = (overrides: Partial<DeadlineReminder> = {}): DeadlineReminder => ({
    id: 'item-1',
    title: 'Essay draft',
    kind: 'task',
    due_at: new Date(2026, 2, 4, 17, 0, 0).toISOString(),
    urgency: 'due-today',
    color: '#6366f1',
    ...overrides,
  })

  it('scopes the key by kind, id and urgency stage', () => {
    expect(deadlineNotificationKey(reminder())).toBe('deadline:task:item-1:due-today')
    expect(deadlineNotificationKey(reminder({ kind: 'event' }))).toBe('deadline:event:item-1:due-today')
    expect(deadlineNotificationKey(reminder({ urgency: 'overdue' }))).toBe(
      'deadline:task:item-1:overdue',
    )
  })

  it('changes when an item crosses an urgency stage', () => {
    const today = deadlineNotificationKey(reminder({ urgency: 'due-today' }))
    const overdue = deadlineNotificationKey(reminder({ urgency: 'overdue' }))
    expect(today).not.toBe(overdue)
  })
})

describe('selectUnsentDeadlineReminders', () => {
  const reminders = (): DeadlineReminder[] => [
    {
      id: 'a',
      title: 'Alpha',
      kind: 'task',
      due_at: new Date(2026, 2, 4, 17, 0, 0).toISOString(),
      urgency: 'due-today',
      color: '#6366f1',
    },
    {
      id: 'b',
      title: 'Beta',
      kind: 'event',
      due_at: new Date(2026, 2, 4, 18, 0, 0).toISOString(),
      urgency: 'overdue',
      color: '#f59e0b',
    },
  ]

  it('returns only reminders not present in the sent set', () => {
    const sent = new Set([deadlineNotificationKey(reminders()[0] as DeadlineReminder)])
    const result = selectUnsentDeadlineReminders(reminders(), sent)
    expect(result.map((reminder) => reminder.id)).toEqual(['b'])
  })

  it('accepts a plain array of sent keys', () => {
    const { urgency } = reminders()[1] as DeadlineReminder
    const keys = [`deadline:task:a:due-today`, `deadline:event:b:${urgency}`]
    expect(selectUnsentDeadlineReminders(reminders(), keys)).toHaveLength(0)
  })

  it('returns everything when no keys have been sent', () => {
    expect(selectUnsentDeadlineReminders(reminders(), [])).toHaveLength(2)
  })
})