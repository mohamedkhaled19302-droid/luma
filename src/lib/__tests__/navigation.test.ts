import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, notificationRoute } from '@/lib/navigation'

describe('navigation items', () => {
  it('exposes unique routes', () => {
    const routes = NAV_ITEMS.map((item) => item.to)
    expect(new Set(routes).size).toBe(routes.length)
  })
})

describe('notificationRoute', () => {
  it('maps notification types to their destination pages', () => {
    expect(notificationRoute('deadline')).toBe('/tasks')
    expect(notificationRoute('task')).toBe('/tasks')
    expect(notificationRoute('missed_task')).toBe('/tasks')
    expect(notificationRoute('schedule_change')).toBe('/planner')
    expect(notificationRoute('habit')).toBe('/habits')
  })

  it('returns undefined for types without a destination', () => {
    expect(notificationRoute('system')).toBeUndefined()
  })
})
