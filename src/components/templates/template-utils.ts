import { BRAND } from '@/lib/brand'
import type { PlanningTemplate } from '@/lib/planning-templates'
import type { TemplateRow } from '@/services/template-service'

export function formatTotalTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * Convert a persisted `templates` row into the in-app `PlanningTemplate`
 * shape so community templates flow through the exact same
 * `instantiateTemplate` + task-creation path as the built-in library.
 */
export function rowToPlanningTemplate(template: TemplateRow): PlanningTemplate {
  const spanDays =
    template.tasks.length === 0
      ? 1
      : Math.max(...template.tasks.map((task) => task.offsetDays)) + 1
  const attribution = template.author_name || `the ${BRAND.name} community`
  return {
    id: template.id,
    name: template.name,
    tagline: template.description ? `Shared by ${attribution}` : attribution,
    description:
      template.description ?? `A template shared by ${attribution} — apply it and ${BRAND.name} adds every task.`,
    category: template.category,
    emoji: template.emoji || '📘',
    spanDays,
    tasks: template.tasks,
  }
}