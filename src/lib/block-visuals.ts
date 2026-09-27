import type { BlockType } from '@/types/models'

/**
 * Single source of truth for schedule-block visuals.
 * - `classes`: Tailwind classes for list/card surfaces (planner timeline, lists).
 * - `hex`:    hex color for 3D scenes, charts, dots and inline accents.
 */
export const BLOCK_VISUALS: Record<BlockType, { classes: string; hex: string; label: string }> = {
  fixed: { classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', hex: '#10b981', label: 'Fixed' },
  task: { classes: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', hex: '#6366f1', label: 'Task' },
  focus: { classes: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300', hex: '#8b5cf6', label: 'Focus' },
  habit: { classes: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300', hex: '#f59e0b', label: 'Habit' },
  break: { classes: 'border-stone-500/30 bg-stone-500/10 text-stone-700 dark:text-stone-300', hex: '#a3a3a3', label: 'Break' },
  appointment: { classes: 'border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300', hex: '#d946ef', label: 'Appointment' },
  free: { classes: 'border-slate-300/40 bg-slate-100/80 text-slate-600 dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-300', hex: '#38bdf8', label: 'Free' },
  sleep: { classes: 'border-slate-700 bg-slate-800 text-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200', hex: '#818cf8', label: 'Sleep' },
}

export function blockVisual(type: BlockType) {
  return BLOCK_VISUALS[type]
}