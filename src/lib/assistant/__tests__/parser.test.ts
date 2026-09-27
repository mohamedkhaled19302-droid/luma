import { describe, expect, it } from 'vitest'
import { addDays, startOfDay, startOfWeek } from 'date-fns'
import { parsePlanRequest, parsePlanRequests } from '../parser'

// Monday, 19 January 2026 — deterministic anchor so every date resolution is stable.
const NOW = new Date(2026, 0, 19, 12, 0, 0)
const TODAY = startOfDay(NOW)

describe('parsePlanRequest exact windows', () => {
  it('parses "study math from 7pm to 9pm" into a pinned 19:00–21:00 block', () => {
    const request = parsePlanRequest('study math from 7pm to 9pm', NOW)
    expect(request.intent).toBe('task')
    expect(request.title).toBe('Study Math')
    expect(request.from).toEqual({ hour: 19, minute: 0 })
    expect(request.to).toEqual({ hour: 21, minute: 0 })
    expect(request.explicitWindow).toBe(true)
    expect(request.durationMinutes).toBeNull()
  })

  it('defaults bare hours to the evening (PM)', () => {
    const request = parsePlanRequest('do chem from 7 to 9', NOW)
    expect(request.from).toEqual({ hour: 19, minute: 0 })
    expect(request.to).toEqual({ hour: 21, minute: 0 })
    expect(request.title).toBe('Chem')
  })

  it('honors 12-hour edge hours with explicit meridiem', () => {
    const request = parsePlanRequest('study from 12pm to 1pm', NOW)
    expect(request.from).toEqual({ hour: 12, minute: 0 })
    expect(request.to).toEqual({ hour: 13, minute: 0 })
  })

  it('parses 24-hour times like 19:00–21:00', () => {
    const request = parsePlanRequest('study math from 19:00 to 21:00', NOW)
    expect(request.from).toEqual({ hour: 19, minute: 0 })
    expect(request.to).toEqual({ hour: 21, minute: 0 })
    expect(request.explicitWindow).toBe(true)
  })

  it('resolves noon and a trailing end time', () => {
    const request = parsePlanRequest('study math from noon to 2pm', NOW)
    expect(request.from).toEqual({ hour: 12, minute: 0 })
    expect(request.to).toEqual({ hour: 14, minute: 0 })
    expect(request.title).toBe('Study Math')
  })

  it('maps midnight to 00:00', () => {
    const request = parsePlanRequest('review notes at midnight', NOW)
    expect(request.from).toEqual({ hour: 0, minute: 0 })
    expect(request.explicitWindow).toBe(true)
    expect(request.intent).toBe('review')
  })

  it('resolves "tonight" as today without a start time when no window is given', () => {
    const request = parsePlanRequest('study math tonight', NOW)
    expect(request.dateLabel).toBe('tonight')
    expect(request.date?.getTime()).toBe(TODAY.getTime())
    expect(request.from).toBeNull()
    expect(request.explicitWindow).toBe(false)
  })
})

describe('parsePlanRequest intents', () => {
  it('detects a focus session with a date and a window', () => {
    const request = parsePlanRequest('tomorrow from 4 to 5 focus', NOW)
    expect(request.intent).toBe('focus')
    expect(request.title).toBe('Focus session')
    expect(request.date).not.toBeNull()
    expect(request.dateLabel).toBe('tomorrow')
    expect(request.from).toEqual({ hour: 16, minute: 0 })
    expect(request.to).toEqual({ hour: 17, minute: 0 })
    expect(request.explicitWindow).toBe(true)
  })

  it('infers the end of a focus session from the duration', () => {
    const request = parsePlanRequest('I want to focus 45 minutes on my essay around 8pm', NOW)
    expect(request.intent).toBe('focus')
    expect(request.durationMinutes).toBe(45)
    expect(request.from).toEqual({ hour: 20, minute: 0 })
    expect(request.to).toEqual({ hour: 20, minute: 45 })
    expect(request.explicitWindow).toBe(true)
  })

  it('detects a daily habit add with a duration', () => {
    const request = parsePlanRequest('add a habit read 20 minutes daily', NOW)
    expect(request.intent).toBe('habit')
    expect(request.durationMinutes).toBe(20)
    expect(request.title).toBe('Read')
    expect(request.frequency).toBe('daily')
    expect(request.targetPerWeek).toBe(7)
  })

  it('detects a habit from "every day" phrasing without the word habit', () => {
    const request = parsePlanRequest('meditate 10 minutes every day', NOW)
    expect(request.intent).toBe('habit')
    expect(request.durationMinutes).toBe(10)
    expect(request.title).toBe('Meditate')
    expect(request.frequency).toBe('daily')
  })

  it('detects a weekly habit with a target count', () => {
    const request = parsePlanRequest('practice guitar 30 minutes 3 times per week', NOW)
    expect(request.intent).toBe('habit')
    expect(request.title).toBe('Practice Guitar')
    expect(request.durationMinutes).toBe(30)
    expect(request.frequency).toBe('weekly')
    expect(request.targetPerWeek).toBe(3)
  })

  it('parses a duration-only review task (no time window)', () => {
    const request = parsePlanRequest('review biology 30 minutes', NOW)
    expect(request.intent).toBe('review')
    expect(request.durationMinutes).toBe(30)
    expect(request.from).toBeNull()
    expect(request.explicitWindow).toBe(false)
    expect(request.title).toBe('Review Biology')
  })

  it('turns "it takes 2 hours" into 120 minutes and strips filler', () => {
    const request = parsePlanRequest('finish the essay tomorrow, it takes 2 hours', NOW)
    expect(request.intent).toBe('task')
    expect(request.durationMinutes).toBe(120)
    expect(request.dateLabel).toBe('tomorrow')
    expect(request.explicitWindow).toBe(false)
    expect(request.title).toBe('Finish the Essay')
  })

  it('resolves weekday + morning + duration for a review request', () => {
    const request = parsePlanRequest(
      'On Monday morning review psych chapter 4 and do biology 30 minutes',
      NOW,
    )
    expect(request.intent).toBe('review')
    expect(request.durationMinutes).toBe(30)
    expect(request.dateLabel).toBe('monday')
    expect(request.date?.getTime()).toBe(addDays(TODAY, 7).getTime())
    expect(request.title).toBe('Review Psych Chapter 4 and Do Biology')
  })
})

describe('parsePlanRequest date resolution', () => {
  it('leaves a bare task undated', () => {
    const request = parsePlanRequest('study math', NOW)
    expect(request.intent).toBe('task')
    expect(request.title).toBe('Study Math')
    expect(request.date).toBeNull()
    expect(request.from).toBeNull()
    expect(request.explicitWindow).toBe(false)
  })

  it('resolves tomorrow', () => {
    const request = parsePlanRequest('read tomorrow', NOW)
    expect(request.date?.getTime()).toBe(addDays(TODAY, 1).getTime())
    expect(request.title).toBe('Read')
  })

  it('resolves next week to the start of the following week', () => {
    const request = parsePlanRequest('read next week', NOW)
    expect(request.dateLabel).toBe('next week')
    expect(request.date?.getTime()).toBe(
      addDays(startOfWeek(TODAY, { weekStartsOn: 0 }), 7).getTime(),
    )
  })

  it('resolves a named weekday to its next occurrence', () => {
    const request = parsePlanRequest('workout on wednesday', NOW)
    expect(request.dateLabel).toBe('wednesday')
    expect(request.date?.getTime()).toBe(addDays(TODAY, 2).getTime())
    expect(request.title).toBe('Workout')
  })
})

describe('parsePlanRequest help & greetings', () => {
  it('turns a pure greeting into the help intent', () => {
    const request = parsePlanRequest('hi', NOW)
    expect(request.intent).toBe('help')
    expect(request.title).toBe('')
    expect(request.frequency).toBeNull()
  })

  it('turns "what can you do" into the help intent', () => {
    const request = parsePlanRequest('what can you do', NOW)
    expect(request.intent).toBe('help')
  })

  it('recoils from instructions stripped to a generic placeholder', () => {
    const request = parsePlanRequest('add a task', NOW)
    expect(request.intent).toBe('help')
    expect(request.title).toBe('')
  })

  it('keeps a titled task as a task', () => {
    const request = parsePlanRequest('Add task: read chapter 3', NOW)
    expect(request.intent).toBe('task')
    expect(request.title).toBe('Read Chapter 3')
    expect(request.explicitWindow).toBe(false)
  })
})

describe('parsePlanRequests multi-part parsing', () => {
  it('splits "and" segments into separate requests', () => {
    const requests = parsePlanRequests('Study math from 7pm to 9pm and read chapter 3', NOW)
    const first = requests[0]!
    const second = requests[1]!
    expect(requests).toHaveLength(2)
    expect(first.intent).toBe('task')
    expect(first.title).toBe('Study Math')
    expect(first.from).toEqual({ hour: 19, minute: 0 })
    expect(first.to).toEqual({ hour: 21, minute: 0 })
    expect(second.intent).toBe('task')
    expect(second.title).toBe('Read Chapter 3')
    expect(second.from).toBeNull()
  })

  it('splits "then" segments into separate requests', () => {
    const requests = parsePlanRequests('study math then read chapter 5', NOW)
    expect(requests.map((r) => r.title)).toEqual(['Study Math', 'Read Chapter 5'])
  })

  it('mixes a task and a habit in one sentence', () => {
    const requests = parsePlanRequests(
      'Add a task read chapter 2 from 6 to 7 and a habit of reviewing notes daily',
      NOW,
    )
    const first = requests[0]!
    const second = requests[1]!
    expect(requests).toHaveLength(2)
    expect(first.intent).toBe('task')
    expect(first.title).toBe('Read Chapter 2')
    expect(first.from).toEqual({ hour: 18, minute: 0 })
    expect(first.to).toEqual({ hour: 19, minute: 0 })
    expect(second.intent).toBe('habit')
    expect(second.title).toBe('Reviewing Notes')
    expect(second.frequency).toBe('daily')
  })

  it('splits a compound weekday sentence', () => {
    const requests = parsePlanRequests(
      'On Monday morning review psych chapter 4 and do biology 30 minutes',
      NOW,
    )
    const first = requests[0]!
    const second = requests[1]!
    expect(requests).toHaveLength(2)
    expect(first.intent).toBe('review')
    expect(first.title).toBe('Review Psych Chapter 4')
    expect(second.intent).toBe('task')
    expect(second.title).toBe('Biology')
    expect(second.durationMinutes).toBe(30)
  })

  it('works in both orderings of parts', () => {
    const requests = parsePlanRequests('meditate 10 minutes every day and review history 30 minutes', NOW)
    const first = requests[0]!
    const second = requests[1]!
    expect(requests).toHaveLength(2)
    expect(first.intent).toBe('habit')
    expect(first.title).toBe('Meditate')
    expect(second.intent).toBe('review')
  })
})