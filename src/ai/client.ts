import { supabase } from '@/database/client'
import type { AiPlannerMode, InvokeAiResult } from './types'

const DEFAULT_TIMEOUT_MS = 45_000

/**
 * Calls the `ai-planner` Supabase Edge Function. The function never touches
 * the database directly - it only returns structured JSON that the client
 * validates before proposing changes. Timeout and abort are handled here so
 * the UI never freezes.
 */
export async function invokeAiPlanner<T>(
  mode: AiPlannerMode,
  payload: Record<string, unknown>,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<InvokeAiResult<T>> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const external = options?.signal ?? null
  if (external) {
    if (external.aborted) return { ok: false, error: 'Request cancelled.' }
    external.addEventListener('abort', () => controller.abort(), { once: true })
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const { data, error } = await supabase.functions.invoke('ai-planner', {
      body: { mode, ...payload },
      signal: controller.signal,
    })
    if (error) throw error
    return { ok: true, data: data as T }
  } catch (error) {
    const message =
      (error as { message?: string })?.message ??
      (error as string) ??
      'AI service is unavailable.'
    const isAbort = controller.signal.aborted
    return {
      ok: false,
      error: isAbort
        ? 'The request took too long and was cancelled.'
        : message,
    }
  } finally {
    clearTimeout(timer)
  }
}