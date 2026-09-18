import type { Difficulty, Priority } from '@/types/models'
import type { BlockType } from '@/types/models'

export type AiPlannerMode = 'parse-task' | 'explain-schedule' | 'refine-schedule'

export interface ParsedTask {
  title: string
  description?: string
  estimated_minutes: number
  deadline?: string | null
  priority?: Priority
  difficulty?: Difficulty
  confidence: number
}

export interface ScheduleAction {
  action: 'place_task' | 'move_task' | 'remove_task_block' | 'add_break' | 'add_habit'
  task_id?: string | null
  habit_id?: string | null
  start?: string
  end?: string
  reason: string
  confidence: number
}

export interface ExplainRequestItem {
  title: string
  block_type: BlockType
  start: string
  end: string
  priority?: Priority
  difficulty?: Difficulty
  deadline?: string | null
}

export interface ExplainScheduleResponse {
  explanation: string
  perBlock: Array<{ title: string; block_type: BlockType; start: string; reason: string }>
}

export interface RefineRequest {
  schedule: Array<{
    title: string
    block_type: BlockType
    start: string
    end: string
    locked: boolean
    task_id?: string | null
  }>
  tasks: Array<{
    id: string
    title: string
    priority: Priority
    difficulty: Difficulty
    remaining_minutes: number
    deadline?: string | null
  }>
  problemStatement: string
}

export interface InvokeAiResult<T> {
  ok: boolean
  data?: T
  error?: string
}

export interface DeterministicRationale {
  taskId: string
  taskTitle: string
  language: string
  factors: Array<{ key: string; value: string }>
  score: number
}