import { describe, expect, it } from 'vitest'
import type { TemplateTask } from '@/lib/planning-templates'
import { formatSharePreview, templateTotalMinutes } from '@/services/template-service'

const task = (overrides: Partial<TemplateTask> = {}): TemplateTask => ({
  title: 'Do the thing',
  offsetDays: 0,
  estimatedMinutes: 60,
  priority: 'medium',
  difficulty: 'medium',
  ...overrides,
})

describe('templateTotalMinutes', () => {
  it('returns 0 for an empty task list', () => {
    expect(templateTotalMinutes([])).toBe(0)
  })

  it('sums estimated minutes across tasks', () => {
    expect(
      templateTotalMinutes([task({ estimatedMinutes: 30 }), task({ estimatedMinutes: 75 })]),
    ).toBe(105)
  })
})

describe('formatSharePreview', () => {
  it('handles an empty template', () => {
    expect(formatSharePreview([])).toBe('0 tasks · 0m')
  })

  it('formats a single task', () => {
    expect(formatSharePreview([task({ estimatedMinutes: 45 })])).toBe('1 task · 45m')
  })

  it('pluralizes task count', () => {
    expect(
      formatSharePreview([task(), task({ title: 'Another', estimatedMinutes: 30 })]),
    ).toBe('2 tasks · 1h 30m')
  })

  it('omits the hours part when under an hour', () => {
    expect(formatSharePreview([task({ estimatedMinutes: 15 })])).toBe('1 task · 15m')
  })

  it('omits the minutes part for whole hours', () => {
    expect(formatSharePreview([task({ estimatedMinutes: 120 })])).toBe('1 task · 2h')
  })
})