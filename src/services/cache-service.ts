import type { QueryClient } from '@tanstack/react-query'
import { kvGetAll, kvSet } from '@/storage/indexeddb'

/** Which query root keys are valuable to keep for offline use. */
const OFFLINE_ROOT_KEYS = new Set([
  'profile',
  'settings',
  'categories',
  'tasks',
  'events',
  'blocks',
  'daily-plan',
  'habits',
  'habit-logs',
  'goals',
  'pressure',
  'dashboard-summary',
  'wellbeing',
])

const QUERY_CACHE_PREFIX = 'offline:q:'

export function shouldCacheQuery(queryKey: unknown): boolean {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return false
  const root = queryKey[0]
  return typeof root === 'string' && OFFLINE_ROOT_KEYS.has(root)
}

export async function writeQueryToCache(queryKey: unknown, data: unknown): Promise<void> {
  if (!shouldCacheQuery(queryKey)) return
  await kvSet(`${QUERY_CACHE_PREFIX}${JSON.stringify(queryKey)}`, data)
}

export async function readAllCachedQueries(): Promise<
  Array<{ queryKey: unknown; data: unknown }>
> {
  const entries = await kvGetAll(QUERY_CACHE_PREFIX)
  return entries.map((entry) => ({
    queryKey: JSON.parse(entry.key.slice(QUERY_CACHE_PREFIX.length)),
    data: entry.value,
  }))
}

export async function seedQueryClient(queryClient: QueryClient): Promise<void> {
  const cached = await readAllCachedQueries()
  for (const { queryKey, data } of cached) {
    if (!shouldCacheQuery(queryKey) || !Array.isArray(queryKey)) continue
    queryClient.setQueryData(queryKey as readonly unknown[], data)
  }
}