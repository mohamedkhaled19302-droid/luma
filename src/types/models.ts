export type Priority = 'low' | 'medium' | 'high' | 'critical'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'missed'
export type PlanningStyleId = 'structured' | 'flexible' | 'balanced' | 'goal-focused' | 'minimal'
export type PlanningDetail = 'simple' | 'normal' | 'detailed'

/**
 * A block the user cannot move: a work shift, a class, a training slot, an
 * appointment. Anything immovable that the scheduler has to plan around.
 */
export type BlockType =
  | 'fixed'
  | 'task'
  | 'focus'
  | 'habit'
  | 'break'
  | 'appointment'
  | 'free'
  | 'sleep'

/** `fixed` is recurring/structured, `milestone` is a one-off hard deadline. */
export type EventType = 'fixed' | 'appointment' | 'milestone' | 'other'

export type HabitFrequency = 'daily' | 'weekly'
export type GoalStatus = 'active' | 'achieved' | 'abandoned'
export type NotificationType =
  | 'deadline'
  | 'task'
  | 'schedule_change'
  | 'missed_task'
  | 'habit'
  | 'system'

export interface Profile {
  id: string
  full_name: string
  created_at: string
  updated_at: string
}

/**
 * A colour-coded label for organising tasks: "Work", "Health", "Side project",
 * "Home", "Learning" — whatever fits the way that person actually lives.
 */
export interface Category {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

export interface CategoryWithCount extends Category {
  task_count: number
}

export interface Task {
  id: string
  user_id: string
  category_id: string | null
  title: string
  description: string | null
  priority: Priority
  difficulty: Difficulty
  estimated_minutes: number
  remaining_minutes: number
  deadline: string | null
  can_split: boolean
  status: TaskStatus
  locked: boolean
  scheduled_start: string | null
  scheduled_end: string | null
  completed_at: string | null
  parent_task_id: string | null
  created_at: string
  updated_at: string
}

export interface TaskSession {
  id: string
  task_id: string
  user_id: string
  start_at: string
  end_at: string
  duration_minutes: number
  completed: boolean
  created_at: string
}

export interface CalendarEvent {
  id: string
  user_id: string
  title: string
  description: string | null
  start_at: string
  end_at: string
  all_day: boolean
  event_type: EventType
  locked: boolean
  location: string | null
  color: string
  created_at: string
}

export interface Habit {
  id: string
  user_id: string
  name: string
  description: string | null
  frequency: HabitFrequency
  target_per_week: number
  preferred_time: string | null
  estimated_minutes: number
  color: string
  active: boolean
  created_at: string
}

export interface HabitLog {
  id: string
  user_id: string
  habit_id: string
  log_date: string
  completed: boolean
  created_at: string
}

export interface Goal {
  id: string
  user_id: string
  title: string
  description: string | null
  target_date: string | null
  status: GoalStatus
  created_at: string
}

export interface DailyPlan {
  id: string
  user_id: string
  plan_date: string
  balance_score: number
  generated_at: string | null
}

export interface ScheduleBlock {
  id: string
  user_id: string
  plan_date: string
  block_type: BlockType
  title: string
  task_id: string | null
  event_id: string | null
  habit_id: string | null
  start_at: string
  end_at: string
  locked: boolean
  completed: boolean
  skipped: boolean
  note: string | null
  color: string | null
  created_at: string
}

export interface WellbeingCheckin {
  id: string
  user_id: string
  checkin_date: string
  energy: number | null
  stress: number | null
  sleep_hours: number | null
  note: string | null
  created_at: string
}

export interface AppNotification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string
  data: Record<string, unknown> | null
  read: boolean
  key: string | null
  deadline_at: string | null
  created_at: string
}

export type DeadlineReminderKind = 'task' | 'habit' | 'block' | 'event'
export type DeadlineUrgency = 'overdue' | 'due-today' | 'due-tomorrow' | 'upcoming'

/**
 * Assistant, voice and privacy preferences.
 *
 * The defaults are the private ones: the microphone is not held open, screens
 * are never watched, and conversations are not kept unless asked for.
 */
export interface AssistantPrefs {
  enabled: boolean
  speak_replies: boolean
  wake_word: boolean
  wake_phrase: string
  screen_awareness: boolean
  keep_conversations: boolean
  conversation_days: number
  /** Let the model call tools directly instead of only proposing changes. */
  tools_enabled: boolean
  /** Preferred free model id, or null to let the server choose. */
  model: string | null
  planning_style: PlanningStyleId
  planning_detail: PlanningDetail
}

export interface DeadlineReminder {
  id: string
  title: string
  kind: DeadlineReminderKind
  due_at: string
  urgency: DeadlineUrgency
  color: string
}

export interface Settings {
  user_id: string
  sleep_target_hours: number
  break_every_minutes: number
  break_minutes: number
  /** The hours the user actually wants to plan demanding work in. */
  focus_start: string
  focus_end: string
  max_session_minutes: number
  wake_time: string
  bed_time: string
  energy_pref: boolean
  notification_prefs: {
    deadlines: boolean
    tasks: boolean
    schedule_change: boolean
    missed_task: boolean
    habits: boolean
  }
  theme: 'light' | 'dark' | 'system'
  onboarded: boolean
  onboarding_completed_at: string | null
  assistant_prefs: AssistantPrefs
  updated_at: string
}

export interface OnboardingData {
  full_name: string
  categories: Array<{ name: string; color: string }>
  availableStart: string
  availableEnd: string
  focusStart: string
  focusEnd: string
  sleepTarget: number
  maxSessionMinutes: number
  commitments: Array<{
    title: string
    weekday: number
    start: string
    end: string
  }>
  energy: number | null
  stress: number | null
}

export interface DashboardSummary {
  greeting: string
  today: { date: string; blocks: ScheduleBlock[]; balance: number }
  upcomingDeadlines: Task[]
  openTasks: Task[]
  activeHabits: Habit[]
  wellbeingToday: WellbeingCheckin | null
}
