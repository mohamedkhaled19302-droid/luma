import { updateBlock } from './block-service'

export async function setBlockCompleted(blockId: string, completed: boolean) {
  return updateBlock(blockId, { completed })
}

export async function setBlockSkipped(blockId: string, skipped: boolean) {
  return updateBlock(blockId, { skipped })
}

export async function setBlockLocked(blockId: string, locked: boolean) {
  return updateBlock(blockId, { locked })
}

export async function moveBlock(blockId: string, startAt: string, endAt: string) {
  return updateBlock(blockId, {
    start_at: startAt,
    end_at: endAt,
    plan_date: startAt.slice(0, 10),
  })
}