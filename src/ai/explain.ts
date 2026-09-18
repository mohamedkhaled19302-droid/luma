import { format, differenceInCalendarDays } from 'date-fns'
import type { ScheduleBlock, Task } from '@/types/models'
import { PRIORITY_WEIGHT, DIFFICULTY_WEIGHT } from '@/scheduler/types'
import { deadlineUrgency } from '@/scheduler/score'
import type { DeterministicRationale } from './types'

const BLOCK_TYPE_LABEL: Record<string, string> = {
  school: 'school',
  task: 'study session',
  study: 'study session',
  habit: 'habit',
  break: 'break',
  commitment: 'commitment',
  free: 'free time',
  sleep: 'sleep',
}

/**
 * Deterministic, human-readable explanation for why LUMA placed a task where
 * it did. Uses the same scoring rules as the scheduler - no AI required.
 */
export function explainTaskPlacement(
  task: Task,
  block: ScheduleBlock,
  now: Date,
  energy: number | null,
): DeterministicRationale {
  const priority = PRIORITY_WEIGHT[task.priority]
  const difficulty = DIFFICULTY_WEIGHT[task.difficulty]
  const urgency = Math.round(deadlineUrgency(task, now))

  const factors: Array<{ key: string; value: string }> = []
  factors.push({ key: 'Priority', value: `${task.priority} (weight ${priority})` })

  if (task.deadline) {
    const days = differenceInCalendarDays(new Date(task.deadline), now)
    const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
    factors.push({ key: 'Deadline', value: `${format(new Date(task.deadline), 'MMM d')} (${when}, urgency ${urgency})` })
  } else {
    factors.push({ key: 'No deadline', value: 'scheduled flexibly' })
  }

  factors.push({ key: 'Difficulty', value: `${task.difficulty} (weight ${difficulty})` })

  if (energy != null) {
    const match =
      (task.difficulty === 'easy' && energy <= 3) ||
      (task.difficulty === 'hard' && energy >= 4)
        ? 'good match'
        : 'acceptable'
    factors.push({ key: 'Energy', value: `level ${energy}/5 (${match})` })
  }

  const startHour = new Date(block.start_at).getHours()
  const partOfDay =
    startHour < 12 ? 'morning' : startHour < 17 ? 'afternoon' : 'evening'
  factors.push({ key: 'Time', value: `placed in the ${partOfDay} in free time` })

  const language = [
    `This is a ${task.priority}-priority ${BLOCK_TYPE_LABEL[block.block_type] ?? 'session'} for "${task.title}".`,
    `LUMA placed it ${blockTitleSentence(block)}, a slot that was free around your other commitments.`,
  ]
  if (task.deadline) {
    const days = differenceInCalendarDays(new Date(task.deadline), now)
    language.push(
      days <= 1
        ? 'The deadline is imminent, so it takes scheduling priority.'
        : `Its deadline is ${days} days away, raising its priority over flexible work.`,
    )
  }
  if (energy != null) {
    language.push(
      (task.difficulty === 'hard' && energy >= 4) || (task.difficulty === 'easy' && energy <= 3)
        ? 'The energy match is good for this difficulty level.'
        : 'The placement balances difficulty with your reported energy.',
    )
  }
  language.push('You can move, lock or reject any block - nothing changes without you.')

  const score = Math.round(priority + difficulty + urgency + (energy ?? 3) * 2)

  return {
    taskId: task.id,
    taskTitle: task.title,
    language: language.join(' '),
    factors,
    score,
  }
}

function blockTitleSentence(block: ScheduleBlock): string {
  const start = format(new Date(block.start_at), 'h:mm a')
  const end = format(new Date(block.end_at), 'h:mm a')
  return `${start} - ${end}`
}

export function explainEntireDay(blocks: ScheduleBlock[], energy: number | null): string {
  const study = blocks.filter((b) => b.block_type === 'task' || b.block_type === 'study')
  const habits = blocks.filter((b) => b.block_type === 'habit')
  const breaks = blocks.filter((b) => b.block_type === 'break')
  const free = blocks.filter((b) => b.block_type === 'free')

  const studyMin = study.reduce(
    (sum, b) => sum + (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000,
    0,
  )
  const freeMin = free.reduce(
    (sum, b) => sum + (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000,
    0,
  )

  const parts: string[] = []
  if (studyMin >= 60) parts.push(`About ${Math.round(studyMin / 60 * 10) / 10} hours of study time are scheduled.`)
  else if (studyMin > 0) parts.push(`${Math.round(studyMin)} minutes of study time are scheduled.`)
  else parts.push('No study sessions are scheduled today.')

  if (habits.length > 0) parts.push(`${habits.length} habit${habits.length === 1 ? '' : 's'} are built into the day.`)
  if (breaks.length > 0) parts.push(`There ${breaks.length === 1 ? 'is' : 'are'} ${breaks.length} scheduled break${breaks.length === 1 ? '' : 's'}.`)
  if (freeMin >= 60) parts.push(`Around ${Math.round(freeMin / 60)} hours are left free.`)

  if (energy != null && energy <= 2) {
    parts.push('Your reported energy is low, so shorter sessions were preferred.')
  }

  return parts.join(' ')
}