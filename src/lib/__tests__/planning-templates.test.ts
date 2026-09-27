import { describe, expect, it } from 'vitest'
import {
  filterTemplates,
  instantiateTemplate,
  totalTemplateMinutes,
  PLANNING_TEMPLATES,
  TEMPLATE_CATEGORIES,
} from '../planning-templates'

describe('planning templates', () => {
  it('every template belongs to a known category and has tasks', () => {
    const categories = new Set(TEMPLATE_CATEGORIES.map((c) => c.id))
    for (const template of PLANNING_TEMPLATES) {
      expect(categories.has(template.category)).toBe(true)
      expect(template.tasks.length).toBeGreaterThan(0)
      expect(template.id).toMatch(/^[a-z0-9-]+$/)
    }
    // no duplicate ids
    const ids = PLANNING_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('instantiates deadlines relative to the start date at 17:00', () => {
    const template = PLANNING_TEMPLATES.find((t) => t.id === 'weekly-reset')!
    const tasks = instantiateTemplate(template, '2026-03-02')
    expect(tasks).toHaveLength(template.tasks.length)
    for (const task of tasks) {
      expect(task.deadline.startsWith('2026-03-02')).toBe(true)
      expect(task.deadline).toContain('17:00:00')
    }
  })

  it('offsets later phases of a multi-day template correctly', () => {
    const sprint = PLANNING_TEMPLATES.find((t) => t.id === 'deadline-sprint-7')!
    const tasks = instantiateTemplate(sprint, '2026-05-01')
    const runThrough = tasks.find((t) => t.title.includes('Full run-through'))!
    expect(runThrough.deadline.startsWith('2026-05-05')).toBe(true) // offset 4
  })

  it('rejects an invalid start date', () => {
    const template = PLANNING_TEMPLATES[0]!
    expect(() => instantiateTemplate(template, 'not-a-date')).toThrow(/Invalid start date/)
  })

  it('filters by category and free-text query', () => {
    expect(filterTemplates(PLANNING_TEMPLATES, '', 'all')).toHaveLength(PLANNING_TEMPLATES.length)
    const sprints = filterTemplates(PLANNING_TEMPLATES, '', 'sprint')
    expect(sprints.every((t) => t.category === 'sprint')).toBe(true)
    const burnout = filterTemplates(PLANNING_TEMPLATES, 'burnout', 'all')
    expect(burnout.map((t) => t.id)).toEqual(['burnout-recovery'])
    expect(filterTemplates(PLANNING_TEMPLATES, 'zzz-no-match', 'all')).toHaveLength(0)
  })

  it('sums template minutes', () => {
    const reset = PLANNING_TEMPLATES.find((t) => t.id === 'weekly-reset')!
    expect(totalTemplateMinutes(reset)).toBe(40)
  })
})