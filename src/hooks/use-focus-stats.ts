import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import { computeFocusStats, type FocusSession, type FocusStats } from '@/lib/focus-stats'
import { listFocusSessions, type FocusSessionRecord } from '@/services/focus-service'

export function useFocusStats(): {
  stats: FocusStats
  sessions: FocusSessionRecord[]
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
} {
  const { user } = useAuth()
  const userId = user?.id ?? 'anonymous'
  const query = useQuery({
    queryKey: ['focus-sessions', userId],
    queryFn: () => listFocusSessions(userId),
    enabled: Boolean(userId),
    staleTime: 0,
    retry: 1,
  })
  const rawSessions = useMemo(() => query.data ?? [], [query.data])
  const stats = useMemo(
    () => computeFocusStats(rawSessions as FocusSession[], new Date()),
    [rawSessions],
  )
  return {
    stats,
    sessions: rawSessions,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  }
}