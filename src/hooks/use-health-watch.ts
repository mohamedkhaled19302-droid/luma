import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  HeartRateMonitor,
  bluetoothAvailability,
  type BluetoothState,
  type CyclingPowerReading,
  type HeartRateReading,
} from '@/lib/health-bluetooth'
import { isPlausible } from '@/lib/health-metrics'
import {
  insertSamples,
  markConnectionStatus,
  upsertConnection,
  type HealthSampleDraft,
} from '@/services/health-service'
import type { HealthSample } from '@/types/models'

/**
 * Drives one live strap session.
 *
 * The shape of the problem: readings arrive over Bluetooth whether or not the
 * app is looking, the connection drops when the strap leaves range, and a tab
 * can be closed mid-session. So the buffer is held in a ref (no render per
 * reading), flushed on an interval and on unmount, and everything is
 * plausibility-checked before it is stored.
 */

const FLUSH_INTERVAL_MS = 10_000
const MAX_BUFFER = 600

export interface HealthWatchStatus {
  state: BluetoothState
  deviceName: string | null
  message: string | null
  bpm: number | null
  watts: number | null
  rrIntervals: number[]
  /** Samples captured but not yet written to the database. */
  pending: number
  recording: boolean
  sessionId: string | null
  lastFlushError: string | null
}

export interface UseHealthWatchOptions {
  userId: string
  onSaved?: (samples: HealthSample[]) => void
}

export function useHealthWatch({ userId, onSaved }: UseHealthWatchOptions) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<BluetoothState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [bpm, setBpm] = useState<number | null>(null)
  const [watts, setWatts] = useState<number | null>(null)
  const [rrIntervals, setRrIntervals] = useState<number[]>([])
  const [recording, setRecording] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const [lastFlushError, setLastFlushError] = useState<string | null>(null)

  const monitorRef = useRef<HeartRateMonitor | null>(null)
  const bufferRef = useRef<HealthSampleDraft[]>([])
  const sessionRef = useRef<string | null>(null)
  const deviceRef = useRef<string | null>(null)
  const savedRef = useRef(onSaved)
  savedRef.current = onSaved

  const unavailable = useMemo(() => bluetoothAvailability(), [])

  const flush = useCallback(async () => {
    const drafts = bufferRef.current
    if (drafts.length === 0 || !userId) return
    // Cleared first: a failed flush must not be retried forever, and the values
    // are still in the readings list the page shows.
    bufferRef.current = []
    setPending(0)
    try {
      const saved = await insertSamples(userId, drafts)
      setLastFlushError(null)
      if (deviceRef.current) {
        await markConnectionStatus(userId, deviceRef.current, 'connected', saved[saved.length - 1]?.recorded_at)
      }
      await queryClient.invalidateQueries({ queryKey: ['health-samples', userId] })
      savedRef.current?.(saved)
    } catch (error) {
      setLastFlushError(error instanceof Error ? error.message : 'Could not save readings.')
    }
  }, [queryClient, userId])

  const addReading = useCallback(
    (metric: 'heart_rate' | 'active_minutes' | 'resting_heart_rate', value: number, recordedAt: number) => {
      if (!isPlausible(metric, value)) return
      if (bufferRef.current.length >= MAX_BUFFER) {
        bufferRef.current.shift()
      }
      bufferRef.current.push({
        metric,
        value,
        recordedAt: new Date(recordedAt).toISOString(),
        source: 'bluetooth',
        deviceName: deviceRef.current,
        sessionId: sessionRef.current,
        note: null,
      })
      setPending(bufferRef.current.length)
    },
    [],
  )

  /** Open the browser's device picker and start streaming. */
  const connect = useCallback(async () => {
    setMessage(null)
    setState('connecting')

    const monitor = new HeartRateMonitor({
      onStateChange: (next, detail) => {
        setState(next)
        if (detail) setMessage(detail)
      },
      onReading: (reading: HeartRateReading) => {
        setBpm(reading.bpm)
        setRrIntervals(reading.rrIntervals)
        if (sessionRef.current) addReading('heart_rate', reading.bpm, reading.takenAt)
      },
      onPower: (reading: CyclingPowerReading) => {
        setWatts(reading.watts)
      },
    })

    monitorRef.current = monitor
    try {
      await monitor.connect()
      const name = monitor.deviceName ?? 'Heart rate monitor'
      deviceRef.current = name
      setDeviceName(name)
      setState('connected')
      await upsertConnection(userId, {
        deviceName: name,
        deviceHandle: null,
        status: 'connected',
        meta: { transport: 'bluetooth', service: 'heart_rate' },
      })
      await queryClient.invalidateQueries({ queryKey: ['health-connections', userId] })
    } catch (error) {
      monitorRef.current = null
      const text = error instanceof Error ? error.message : 'Could not connect to the strap.'
      setState('error')
      setMessage(text)
    }
  }, [addReading, queryClient, userId])

  const disconnect = useCallback(async () => {
    monitorRef.current?.disconnect()
    monitorRef.current = null
    const name = deviceRef.current
    // Save whatever is still buffered before letting go, so a session is never
    // silently truncated by a disconnect.
    if (bufferRef.current.length > 0) await flush()
    if (name) await disconnectDeviceSafe(userId, name)
    setState('idle')
    setBpm(null)
    setWatts(null)
    setDeviceName(null)
    deviceRef.current = null
    await queryClient.invalidateQueries({ queryKey: ['health-connections', userId] })
  }, [flush, queryClient, userId])

  /** Begin capturing readings into a new session. */
  const startRecording = useCallback(() => {
    const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    sessionRef.current = id
    setSessionId(id)
    setRecording(true)
  }, [])

  /** Stop capturing, flush, and forget the session. */
  const stopRecording = useCallback(async () => {
    sessionRef.current = null
    setRecording(false)
    setSessionId(null)
    await flush()
  }, [flush])

  /** Log a single manual reading — the fallback when no strap is to hand. */
  const logManual = useCallback(
    async (metric: HealthSampleDraft['metric'], value: number) => {
      await insertSamples(userId, [
        {
          metric,
          value,
          recordedAt: new Date().toISOString(),
          source: 'manual',
          deviceName: null,
          sessionId: null,
          note: null,
        },
      ])
      await queryClient.invalidateQueries({ queryKey: ['health-samples', userId] })
    },
    [queryClient, userId],
  )

  useEffect(() => {
    if (state !== 'connected') return
    const timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [flush, state])

  // Flush on unmount so closing the tab mid-session does not lose the tail.
  useEffect(() => {
    return () => {
      monitorRef.current?.disconnect()
      if (bufferRef.current.length > 0) void flush()
    }
  }, [flush])

  const status: HealthWatchStatus = useMemo(
    () => ({
      state,
      deviceName,
      message,
      bpm,
      watts,
      rrIntervals,
      pending,
      recording,
      sessionId,
      lastFlushError,
    }),
    [state, deviceName, message, bpm, watts, rrIntervals, pending, recording, sessionId, lastFlushError],
  )

  return { status, unavailable, connect, disconnect, startRecording, stopRecording, logManual, flush }
}

async function disconnectDeviceSafe(userId: string, deviceName: string): Promise<void> {
  try {
    const { disconnectDevice } = await import('@/services/health-service')
    await disconnectDevice(userId, deviceName)
  } catch {
    /* the row is only a record; failing to update it must not break the UI */
  }
}
