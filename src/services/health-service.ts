import { supabase } from '@/database/client'
import type { HealthConnection, HealthMetric, HealthSample, HealthSource } from '@/types/models'
import { unitFor } from '@/lib/health-metrics'

/**
 * Persistence for wearable data.
 *
 * Health data is the most sensitive thing this app holds, so this module is
 * deliberately dull: owner-scoped rows, no caching of credentials, and no
 * analytics. Reads are always filtered by `user_id` on top of RLS, so a mistake
 * here still cannot return somebody else's health history.
 */

const CONNECTION_COLUMNS =
  'id, user_id, source, device_name, device_handle, status, connected_at, last_sample_at, meta, created_at'

const SAMPLE_COLUMNS =
  'id, user_id, metric, value, unit, recorded_at, received_at, source, device_name, session_id, note, created_at'

export interface HealthSampleDraft {
  metric: HealthMetric
  value: number
  recordedAt?: string
  source?: HealthSource
  deviceName?: string | null
  sessionId?: string | null
  note?: string | null
}

/** Map a draft onto a row, deriving the unit from the metric so it cannot drift. */
function toRow(userId: string, draft: HealthSampleDraft) {
  return {
    user_id: userId,
    metric: draft.metric,
    value: draft.value,
    unit: unitFor(draft.metric),
    recorded_at: draft.recordedAt ?? new Date().toISOString(),
    source: draft.source ?? 'bluetooth',
    device_name: draft.deviceName ?? null,
    session_id: draft.sessionId ?? null,
    note: draft.note ?? null,
  }
}

export async function listSamples(
  userId: string,
  options: { from?: string; to?: string; metric?: HealthMetric; limit?: number } = {},
): Promise<HealthSample[]> {
  let query = supabase.from('health_samples').select(SAMPLE_COLUMNS).eq('user_id', userId)
  if (options.from) query = query.gte('recorded_at', options.from)
  if (options.to) query = query.lte('recorded_at', options.to)
  if (options.metric) query = query.eq('metric', options.metric)
  query = query.order('recorded_at', { ascending: true }).limit(options.limit ?? 2000)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/**
 * Write a batch of samples.
 *
 * Bulk insert rather than one request per reading: a live session collects a
 * sample a second, and a request each would be both slow and easy to rate-limit.
 * Upsert is deliberately not used — samples are immutable, so a duplicate write
 * is a bug worth surfacing rather than papering over.
 */
export async function insertSamples(
  userId: string,
  drafts: HealthSampleDraft[],
): Promise<HealthSample[]> {
  if (drafts.length === 0) return []
  const rows = drafts.map((draft) => toRow(userId, draft))
  const { data, error } = await supabase.from('health_samples').insert(rows).select(SAMPLE_COLUMNS)
  if (error) throw error
  return data ?? []
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('health_samples')
    .delete()
    .eq('user_id', userId)
    .eq('session_id', sessionId)
  if (error) throw error
}

export async function listConnections(userId: string): Promise<HealthConnection[]> {
  const { data, error } = await supabase
    .from('health_connections')
    .select(CONNECTION_COLUMNS)
    .eq('user_id', userId)
    .order('connected_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function upsertConnection(
  userId: string,
  input: {
    deviceName: string
    deviceHandle?: string | null
    status?: HealthConnection['status']
    meta?: Record<string, unknown>
    lastSampleAt?: string | null
  },
): Promise<HealthConnection> {
  const row = {
    user_id: userId,
    source: 'bluetooth' as const,
    device_name: input.deviceName,
    device_handle: input.deviceHandle ?? null,
    status: input.status ?? ('connected' as const),
    last_sample_at: input.lastSampleAt ?? null,
    meta: input.meta ?? {},
  }
  const { data, error } = await supabase
    .from('health_connections')
    .upsert(row, { onConflict: 'user_id,device_name' })
    .select(CONNECTION_COLUMNS)
    .single()
  if (error) throw error
  return data
}

export async function markConnectionStatus(
  userId: string,
  deviceName: string,
  status: HealthConnection['status'],
  lastSampleAt?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (lastSampleAt) patch.last_sample_at = lastSampleAt
  const { error } = await supabase
    .from('health_connections')
    .update(patch)
    .eq('user_id', userId)
    .eq('device_name', deviceName)
  if (error) throw error
}

export async function disconnectDevice(userId: string, deviceName: string): Promise<void> {
  const { error } = await supabase
    .from('health_connections')
    .update({ status: 'disconnected' })
    .eq('user_id', userId)
    .eq('device_name', deviceName)
  if (error) throw error
}
