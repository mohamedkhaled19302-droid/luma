import { describe, expect, it } from 'vitest'
import { parseAssistantReply, sanitizePayload } from '../proposals'

describe('parseAssistantReply', () => {
  it('separates the conversation from a fenced action block', () => {
    const raw = [
      'Here is a balanced plan:',
      '4:00 PM - 5:00 PM Maths homework',
      '',
      '```morrow-actions',
      '{"actions":[{"kind":"reschedule_task","payload":{"task_id":"t1","date":"2026-09-24"}}]}',
      '```',
    ].join('\n')

    const parsed = parseAssistantReply(raw)
    expect(parsed.reply).toContain('4:00 PM - 5:00 PM Maths homework')
    // The raw JSON must never reach the user's screen.
    expect(parsed.reply).not.toContain('morrow-actions')
    expect(parsed.reply).not.toContain('task_id')
    expect(parsed.proposals).toHaveLength(1)
    expect(parsed.proposals[0]?.kind).toBe('reschedule_task')
    expect(parsed.proposals[0]?.payload['task_id']).toBe('t1')
  })

  it('handles a plain ```json fence', () => {
    const parsed = parseAssistantReply(
      'Sure thing.\n```json\n{"actions":[{"kind":"create_task","payload":{"title":"Buy milk","deadline":"2026-09-24"}}]}\n```',
    )
    expect(parsed.reply).toBe('Sure thing.')
    expect(parsed.proposals[0]?.kind).toBe('create_task')
    expect(parsed.proposals[0]?.title).toBe('Add this task')
  })

  it('handles a model that forgets the fence and appends raw JSON', () => {
    const parsed = parseAssistantReply(
      'Moving it for you.\n{"actions":[{"kind":"complete_task","payload":{"task_id":"t9"}}]}',
    )
    expect(parsed.reply).toBe('Moving it for you.')
    expect(parsed.proposals[0]?.payload['task_id']).toBe('t9')
  })

  it('leaves a normal reply untouched', () => {
    const parsed = parseAssistantReply('You still have 30 minutes of unplanned time.')
    expect(parsed.reply).toBe('You still have 30 minutes of unplanned time.')
    expect(parsed.proposals).toEqual([])
  })

  it('drops unknown action kinds instead of forwarding them', () => {
    const parsed = parseAssistantReply(
      'ok```morrow-actions\n{"actions":[{"kind":"delete_everything","payload":{}},{"kind":"add_break","payload":{"date":"2026-09-24","start":"15:00"}}]}\n```',
    )
    expect(parsed.proposals).toHaveLength(1)
    expect(parsed.proposals[0]?.kind).toBe('add_break')
  })

  it('rejects a known tool whose required arguments are missing', () => {
    // `add_break` requires a day and a start time. A model that omits them gets
    // no proposal at all rather than a half-formed one the user would approve.
    const parsed = parseAssistantReply(
      'ok```morrow-actions\n{"actions":[{"kind":"add_break","payload":{}}]}\n```',
    )
    expect(parsed.proposals).toEqual([])
  })

  it('accepts a task with no deadline', () => {
    // Regression: the schema used to mark `deadline` required while telling the
    // model it could be omitted, so the most common request of all always failed.
    const parsed = parseAssistantReply(
      'ok```morrow-actions\n{"actions":[{"kind":"create_task","payload":{"title":"Buy milk"}}]}\n```',
    )
    expect(parsed.proposals).toHaveLength(1)
    expect(parsed.proposals[0]?.kind).toBe('create_task')
  })

  it('accepts rescheduling to a day with no time, and logging a habit for today', () => {
    const move = parseAssistantReply(
      'ok```morrow-actions\n{"actions":[{"kind":"reschedule_task","payload":{"task_id":"t1","date":"2026-09-24"}}]}\n```',
    )
    expect(move.proposals).toHaveLength(1)

    const log = parseAssistantReply(
      'ok```morrow-actions\n{"actions":[{"kind":"log_habit","payload":{"habit_id":"h1"}}]}\n```',
    )
    expect(log.proposals).toHaveLength(1)
  })

  it('caps how many suggestions can be offered at once', () => {
    const many = Array.from(
      { length: 9 },
      (_, i) =>
        `{"kind":"create_task","payload":{"title":"t${i}","deadline":"2026-09-24"}}`,
    )
    const parsed = parseAssistantReply(
      `plan\n\`\`\`morrow-actions\n{"actions":[${many.join(',')}]}\n\`\`\``,
    )
    // A cap that silently dropped everything would also satisfy "<= 4".
    expect(parsed.proposals).toHaveLength(4)
  })

  it('survives malformed JSON without losing the reply', () => {
    const parsed = parseAssistantReply('Still a useful answer.\n```morrow-actions\n{oops\n```')
    expect(parsed.reply).toContain('Still a useful answer.')
    expect(parsed.proposals).toEqual([])
  })
})

describe('sanitizePayload', () => {
  it('keeps only JSON-safe, whitelisted fields', () => {
    const clean = sanitizePayload({
      task_id: 't1',
      duration_minutes: 45,
      all_day: true,
      milestones: ['step 1', 'step 2'],
      nested: { evil: true },
      'bad key!': 'nope',
      __proto__: 'ignored',
    })
    expect(clean['task_id']).toBe('t1')
    expect(clean['duration_minutes']).toBe(45)
    expect(clean['all_day']).toBe(true)
    expect(clean['milestones']).toEqual(['step 1', 'step 2'])
    expect(clean['nested']).toBeUndefined()
    expect(clean['bad key!']).toBeUndefined()
  })

  it('truncates absurdly long strings and ignores non-finite numbers', () => {
    const clean = sanitizePayload({ title: 'x'.repeat(5000), minutes: Number.POSITIVE_INFINITY })
    expect(String(clean['title']).length).toBeLessThanOrEqual(200)
    expect(clean['minutes']).toBeUndefined()
  })

  it('returns an empty object for non-objects', () => {
    expect(sanitizePayload(null)).toEqual({})
    expect(sanitizePayload('text')).toEqual({})
    expect(sanitizePayload([])).toEqual({})
  })
})
