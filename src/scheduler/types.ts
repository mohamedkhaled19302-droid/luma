import type { BlockType, Difficulty, Priority } from '@/types/models'

export interface SchedulerTask {
  id: string
  category_id: string | null
  category_name?: string | null
  category_color?: string | null
  title: string
  priority: Priority
  difficulty: Difficulty
  remaining_minutes: number
  deadline: string | null
  can_split: boolean
}

export interface SchedulerHabit {
  id: string
  name: string
  frequency: 'daily' | 'weekly'
  target_per_week: number
  preferred_time: string | null
  color: string
  estimated_minutes: number
  days_done_this_week: number
}

export interface SchedulerFixedEvent {
  id: string
  title: string
  start: Date
  end: Date
  block_type: BlockType
}

export interface SchedulerSettings {
  awakeStart: string
  awakeEnd: string
  preferredStart: string
  preferredEnd: string
  breakEveryMinutes: number
  breakMinutes: number
  maxSessionMinutes: number
  sleepTargetHours: number
  energyPref: boolean
}

export interface SchedulerInput {
  startAt: Date
  endAt: Date
  tasks: SchedulerTask[]
  habits: SchedulerHabit[]
  fixed: SchedulerFixedEvent[]
  settings: SchedulerSettings
  energyByDay: Map<string, number>
  typicalEnergy: number | null
  today: string
  now: Date
}

export interface PlannedBlock {
  title: string
  block_type: BlockType
  start_at: string
  end_at: string
  task_id: string | null
  habit_id: string | null
  color: string | null
  locked: boolean
}

export interface PlannedSession {
  task_id: string
  start_at: string
  end_at: string
  duration_minutes: number
}

export interface PlannedTaskUpdate {
  task_id: string
  scheduled_start: string | null
  scheduled_end: string | null
}

export interface SchedulerResult {
  blocks: PlannedBlock[]
  sessions: PlannedSession[]
  taskUpdates: PlannedTaskUpdate[]
  summary: {
    scheduledMinutes: number
    tasksScheduled: number
    remainingWorkMinutes: number
    unplaceableTasks: string[]
    overloadDays: string[]
  }
}

export interface SchedulingRationale {
  taskId: string
  taskTitle: string
  placedStart: Date
  placedEnd: Date
  slotScore: number
  factors: Record<string, number>
}

export const MIN_SESSION_MINUTES = 15
export const MIN_FREE_GAP_MINUTES = 30

export const PRIORITY_WEIGHT: Record<Priority, number> = {
  low: 10,
  medium: 30,
  high: 60,
  critical: 120,
}

export const DIFFICULTY_WEIGHT: Record<Difficulty, number> = {
  easy: 1,
  medium: 3,
  hard: 6,
}

export const BLOCK_TYPE_ORDER: BlockType[] = [
  'sleep',
  'fixed',
  'task',
  'focus',
  'appointment',
  'habit',
  'break',
  'free',
]