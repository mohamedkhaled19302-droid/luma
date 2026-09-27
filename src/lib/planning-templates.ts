import { addDays, format, parseISO } from 'date-fns'
import type { Difficulty, Priority } from '@/types/models'

export type TemplateCategory = 'sprint' | 'project' | 'focus' | 'wellbeing' | 'life'

export interface TemplateTask {
  title: string
  /** Days after the chosen start date when this task is due */
  offsetDays: number
  estimatedMinutes: number
  priority: Priority
  difficulty: Difficulty
  description?: string
}

export interface PlanningTemplate {
  id: string
  name: string
  tagline: string
  description: string
  category: TemplateCategory
  emoji: string
  /** Total calendar days the plan spans */
  spanDays: number
  tasks: TemplateTask[]
}

export interface InstantiatedTask extends TemplateTask {
  deadline: string // ISO date at 17:00 local
}

export const TEMPLATE_CATEGORIES: Array<{ id: TemplateCategory; label: string }> = [
  { id: 'sprint', label: 'Deadline sprints' },
  { id: 'project', label: 'Projects' },
  { id: 'focus', label: 'Focus systems' },
  { id: 'wellbeing', label: 'Wellbeing' },
  { id: 'life', label: 'Life admin' },
]

export const PLANNING_TEMPLATES: PlanningTemplate[] = [
  {
    id: 'deadline-sprint-7',
    name: '7-Day Deadline Sprint',
    tagline: 'One focused week before the big date',
    description:
      'A spaced countdown built for any hard deadline: heavy work early, a full run-through mid-week, light recall at the end.',
    category: 'sprint',
    emoji: '🎯',
    spanDays: 7,
    tasks: [
      { title: 'Gather everything you need: docs, notes, references', offsetDays: 0, estimatedMinutes: 45, priority: 'high', difficulty: 'easy' },
      { title: 'Skim it all — build a map of what matters', offsetDays: 0, estimatedMinutes: 60, priority: 'high', difficulty: 'medium' },
      { title: 'Deep work: weakest area first', offsetDays: 1, estimatedMinutes: 90, priority: 'critical', difficulty: 'hard' },
      { title: 'Deep work: second-weakest area', offsetDays: 2, estimatedMinutes: 90, priority: 'high', difficulty: 'hard' },
      { title: 'Notes or cards for the key details', offsetDays: 3, estimatedMinutes: 45, priority: 'medium', difficulty: 'medium' },
      { title: 'Full run-through, start to finish', offsetDays: 4, estimatedMinutes: 120, priority: 'critical', difficulty: 'hard' },
      { title: 'Review the run-through & log what slipped', offsetDays: 5, estimatedMinutes: 60, priority: 'high', difficulty: 'medium' },
      { title: 'Redo only the parts that went badly', offsetDays: 6, estimatedMinutes: 60, priority: 'high', difficulty: 'medium' },
      { title: 'Light recall + early night', offsetDays: 6, estimatedMinutes: 30, priority: 'medium', difficulty: 'easy', description: 'No last-minute cramming — sleep is the strategy.' },
    ],
  },
  {
    id: 'big-project-14',
    name: 'Big Project in 2 Weeks',
    tagline: 'From brief to submission without panic',
    description:
      'Breaks a large assignment into research, outline, draft, and polish phases so the deadline never sneaks up on you.',
    category: 'project',
    emoji: '🏗️',
    spanDays: 14,
    tasks: [
      { title: 'Read the brief twice & list requirements', offsetDays: 0, estimatedMinutes: 30, priority: 'critical', difficulty: 'easy' },
      { title: 'Research round 1 — gather sources', offsetDays: 1, estimatedMinutes: 90, priority: 'high', difficulty: 'medium' },
      { title: 'Research round 2 — fill the gaps', offsetDays: 3, estimatedMinutes: 60, priority: 'medium', difficulty: 'medium' },
      { title: 'Build the outline & milestones', offsetDays: 4, estimatedMinutes: 45, priority: 'high', difficulty: 'medium' },
      { title: 'Rough draft — first half', offsetDays: 6, estimatedMinutes: 120, priority: 'high', difficulty: 'hard' },
      { title: 'Rough draft — second half', offsetDays: 8, estimatedMinutes: 120, priority: 'high', difficulty: 'hard' },
      { title: 'Revise against the rubric', offsetDays: 10, estimatedMinutes: 90, priority: 'high', difficulty: 'medium' },
      { title: 'Get feedback from someone who has done this before', offsetDays: 11, estimatedMinutes: 30, priority: 'medium', difficulty: 'easy' },
      { title: 'Final polish & formatting', offsetDays: 12, estimatedMinutes: 60, priority: 'high', difficulty: 'medium' },
      { title: 'Submit 24h early buffer', offsetDays: 13, estimatedMinutes: 15, priority: 'critical', difficulty: 'easy' },
    ],
  },
  {
    id: 'weekly-reset',
    name: 'Weekly Reset Ritual',
    tagline: '30 minutes every Sunday',
    description:
      'A repeating maintenance loop: clear last week, preview next week, and reset your space and head.',
    category: 'wellbeing',
    emoji: '🌿',
    spanDays: 1,
    tasks: [
      { title: 'Clear your desk & digital desktop', offsetDays: 0, estimatedMinutes: 10, priority: 'low', difficulty: 'easy' },
      { title: 'Review last week — what worked?', offsetDays: 0, estimatedMinutes: 10, priority: 'medium', difficulty: 'easy' },
      { title: 'Preview next week’s deadlines', offsetDays: 0, estimatedMinutes: 10, priority: 'high', difficulty: 'easy' },
      { title: 'Pick your 3 priorities for the week', offsetDays: 0, estimatedMinutes: 10, priority: 'high', difficulty: 'medium' },
    ],
  },
  {
    id: 'deep-work-habit',
    name: 'Deep Work Starter Pack',
    tagline: 'Train the focus muscle in 5 days',
    description:
      'Five progressively longer distraction-free sessions. Pair each with the Focus Studio timer.',
    category: 'focus',
    emoji: '🧠',
    spanDays: 5,
    tasks: [
      { title: 'Focus session — 25 minutes, phone in another room', offsetDays: 0, estimatedMinutes: 25, priority: 'medium', difficulty: 'easy' },
      { title: 'Focus session — 35 minutes', offsetDays: 1, estimatedMinutes: 35, priority: 'medium', difficulty: 'easy' },
      { title: 'Focus session — 45 minutes, single task only', offsetDays: 2, estimatedMinutes: 45, priority: 'medium', difficulty: 'medium' },
      { title: 'Focus session — 60 minutes on your hardest task', offsetDays: 3, estimatedMinutes: 60, priority: 'high', difficulty: 'hard' },
      { title: 'Focus session — 90 minute deep dive', offsetDays: 4, estimatedMinutes: 90, priority: 'high', difficulty: 'hard' },
    ],
  },
  {
    id: 'fresh-start',
    name: 'Fresh Start Week',
    tagline: 'Set up the next chapter before it starts',
    description:
      'Set up your categories, note the dates that matter, and lock in your focus windows before the week gets busy.',
    category: 'life',
    emoji: '🚀',
    spanDays: 7,
    tasks: [
      { title: 'Add every category you want to keep separate, with a colour', offsetDays: 0, estimatedMinutes: 20, priority: 'high', difficulty: 'easy' },
      { title: 'Collect what you need & note every fixed date', offsetDays: 1, estimatedMinutes: 45, priority: 'high', difficulty: 'medium' },
      { title: 'Set your wake/sleep times and focus hours', offsetDays: 1, estimatedMinutes: 10, priority: 'medium', difficulty: 'easy' },
      { title: 'Block your recurring commitments (work, training, clubs, family)', offsetDays: 2, estimatedMinutes: 20, priority: 'medium', difficulty: 'easy' },
      { title: 'Choose one habit to build this week', offsetDays: 3, estimatedMinutes: 15, priority: 'low', difficulty: 'easy' },
      { title: 'Plan the week and let the scheduler work', offsetDays: 4, estimatedMinutes: 20, priority: 'high', difficulty: 'easy' },
    ],
  },
  {
    id: 'burnout-recovery',
    name: 'Burnout Recovery Week',
    tagline: 'Get back on track, gently',
    description:
      'A low-pressure week that keeps momentum alive with tiny wins, rest, and honest check-ins.',
    category: 'wellbeing',
    emoji: '💛',
    spanDays: 7,
    tasks: [
      { title: 'Forgive the backlog — triage to 3 must-dos', offsetDays: 0, estimatedMinutes: 20, priority: 'medium', difficulty: 'easy' },
      { title: 'One 15-minute tidy of the space you work in', offsetDays: 1, estimatedMinutes: 15, priority: 'low', difficulty: 'easy' },
      { title: 'Smallest possible step on must-do #1', offsetDays: 2, estimatedMinutes: 25, priority: 'high', difficulty: 'easy' },
      { title: 'Walk outside, no podcasts', offsetDays: 3, estimatedMinutes: 20, priority: 'low', difficulty: 'easy' },
      { title: 'Smallest possible step on must-do #2', offsetDays: 4, estimatedMinutes: 25, priority: 'high', difficulty: 'easy' },
      { title: 'Message a friend / ask for help', offsetDays: 5, estimatedMinutes: 10, priority: 'medium', difficulty: 'easy' },
      { title: 'Weekly check-in: energy, stress, sleep', offsetDays: 6, estimatedMinutes: 10, priority: 'medium', difficulty: 'easy' },
    ],
  },
]

/**
 * Turn a template into concrete tasks with deadlines relative to `startDate`
 * (yyyy-MM-dd). Each deadline lands at 17:00 local time on its offset day.
 */
export function instantiateTemplate(template: PlanningTemplate, startDate: string): InstantiatedTask[] {
  const start = parseISO(startDate)
  if (Number.isNaN(start.getTime())) throw new Error(`Invalid start date: ${startDate}`)
  return template.tasks.map((task) => {
    const due = addDays(start, task.offsetDays)
    due.setHours(17, 0, 0, 0)
    return {
      ...task,
      deadline: format(due, "yyyy-MM-dd'T'17:00:00"),
    }
  })
}

export function filterTemplates(
  templates: PlanningTemplate[],
  query: string,
  category: TemplateCategory | 'all',
): PlanningTemplate[] {
  const q = query.trim().toLowerCase()
  return templates.filter((t) => {
    if (category !== 'all' && t.category !== category) return false
    if (!q) return true
    return (
      t.name.toLowerCase().includes(q) ||
      t.tagline.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    )
  })
}

export function totalTemplateMinutes(template: PlanningTemplate): number {
  return template.tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0)
}