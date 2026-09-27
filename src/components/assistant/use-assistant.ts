/**
 * All assistant behaviour in one hook.
 *
 * The floating panel and the full /assistant page both mount this, so the
 * conversation, the tool proposals, the confirmation gate, voice and screen
 * awareness behave identically wherever the person uses them.
 *
 * Guarantees enforced here:
 *  - a proposal is applied only on an explicit tap, never automatically;
 *  - a destructive action goes through the server's confirmation round trip and
 *    is re-validated before it is written;
 *  - every in-flight request is abortable, and "stop" really stops;
 *  - the microphone, the speaker and the screen share are all released on
 *    unmount, on stop, and on error.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  useBlocksForDay,
  useCategories,
  useGoals,
  useHabits,
  useHabitLogsToday,
  useOpenTasks,
  useProfile,
  useSettings,
} from '@/hooks/queries'
import { applyProposal as runTool } from '@/lib/ai/apply'
import { AiRequestError, sendAiChat } from '@/lib/ai/client'
import { defaultProviders, matchWakePhrase } from '@/lib/ai/providers'
import { captureScreenFrame, isScreenCaptureSupported, ScreenCaptureFailure } from '@/lib/ai/screen'
import type {
  AiChatMessage,
  AiConfirmationRequest,
  AiModelsResponse,
  AiPlanningContext,
  AiProposal,
  AiToolName,
  VoiceSession,
} from '@/lib/ai/types'
import { updateAssistantPrefs } from '@/services/settings-service'
import { BRAND } from '@/lib/brand'
import type { AssistantPrefs } from '@/types/models'

export type AssistantPhase = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface AssistantTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Suggestions attached to this assistant turn. */
  proposals?: AiProposal[]
  /** Ids of proposals already handled, so they stop being actionable. */
  resolved?: string[]
  /** Held destructive action awaiting approval. */
  confirmation?: AiConfirmationRequest
  cancelledConfirmation?: boolean
  notice?: string
  model?: string
  /** True when this turn was about a screenshot the person shared. */
  fromScreen?: boolean
}

export type ScreenState = 'off' | 'capturing' | 'reading' | 'error'

const SPEECH_ERRORS: Record<string, string> = {
  'not-allowed': `Microphone permission was blocked. Allow it in your browser to talk to ${BRAND.name}.`,
  'service-not-allowed': 'Speech recognition is unavailable in this browser.',
  network: 'Speech recognition needs a network connection.',
  unsupported: 'This browser has no speech recognition. Try Chrome or Edge.',
  'audio-capture': 'No microphone was found.',
  'start-failed': 'The microphone could not be started.',
}

/** Friendly, actionable copy per upstream error code. */
function explainError(error: unknown): string {
  if (!(error instanceof AiRequestError)) {
    return 'I could not reach the planning assistant. Check your connection and try again.'
  }
  switch (error.code) {
    case 'unauthorized':
      return 'Your session expired. Sign in again to use the assistant.'
    case 'missing_key':
    case 'not_configured':
      return 'The assistant is not set up yet. Add OPENROUTER_API_KEY on the server and reload.'
    case 'invalid_key':
      return 'The server rejected the OpenRouter key. Check that it is still valid.'
    case 'rate_limited':
      return 'OpenRouter is rate limiting us right now. Try again in a minute.'
    case 'free_daily_limit':
      return 'The free-model daily limit was reached. Try again tomorrow or choose another model.'
    case 'no_free_model':
      return 'No free model is available right now, so I cannot answer that.'
    case 'model_unavailable':
      return 'That model was busy. Try again and I will use a different one.'
    case 'timeout':
      return 'That took too long. Try a shorter question.'
    case 'network':
      return 'I could not reach the server. Check your connection.'
    default:
      return error.message || 'Something went wrong on the server.'
  }
}

/** Which reference bucket a tool's primary entity belongs to. */
function focusBucketFor(tool: AiToolName): 'taskIds' | 'blockIds' | 'habitIds' | 'goalIds' | null {
  if (tool.includes('task')) return 'taskIds'
  if (tool.includes('block') || tool === 'reschedule_day' || tool === 'add_break') return 'blockIds'
  if (tool.includes('habit')) return 'habitIds'
  if (tool.includes('goal')) return 'goalIds'
  return null
}

export interface UseAssistant {
  turns: AssistantTurn[]
  phase: AssistantPhase
  partial: string
  busy: boolean
  /** False until the person opts in. The panel renders an opt-in state. */
  enabled: boolean
  firstName: string
  prefs: AssistantPrefs | undefined
  prefsLoading: boolean
  savePrefs: (patch: Partial<AssistantPrefs>) => Promise<void>
  voiceSupported: boolean
  wakeArmed: boolean
  toggleWakeWord: () => void
  models: AiModelsResponse | null
  modelsLoading: boolean
  refreshModels: () => void
  screenSupported: boolean
  screenState: ScreenState
  ask: (text: string) => Promise<void>
  stop: () => void
  startListening: () => void
  stopListening: () => void
  apply: (turnId: string, proposal: AiProposal) => Promise<void>
  edit: (turnId: string, proposal: AiProposal) => void
  cancel: (turnId: string, proposalId: string) => void
  confirmDestructive: (turnId: string) => Promise<void>
  dismissConfirmation: (turnId: string) => void
  askAboutScreen: (question: string) => Promise<void>
  clear: () => void
  pendingEdit: string | null
  setPendingEdit: (value: string | null) => void
}

export function useAssistant(userId: string): UseAssistant {
  const queryClient = useQueryClient()
  const today = useMemo(() => new Date(), [])

  const { data: profile } = useProfile(userId)
  const { data: settings, isLoading: prefsLoading } = useSettings(userId)
  const { data: openTasks = [] } = useOpenTasks(userId)
  const { data: habits = [] } = useHabits(userId, true)
  const { data: habitLogs = [] } = useHabitLogsToday(userId, today)
  const { data: goals = [] } = useGoals(userId)
  const { data: categories = [] } = useCategories(userId)
  const { data: blocks = [] } = useBlocksForDay(userId, today)

  const [turns, setTurns] = useState<AssistantTurn[]>([])
  const [phase, setPhase] = useState<AssistantPhase>('idle')
  const [partial, setPartial] = useState('')
  const [wakeArmed, setWakeArmed] = useState(false)
  const [models, setModels] = useState<AiModelsResponse | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [screenState, setScreenState] = useState<ScreenState>('off')
  const [pendingEdit, setPendingEdit] = useState<string | null>(null)

  const historyRef = useRef<AiChatMessage[]>([])
  const focusRef = useRef<AiPlanningContext['recentFocus']>(undefined)
  const abortRef = useRef<AbortController | null>(null)
  const seqRef = useRef(0)
  const commandSessionRef = useRef<VoiceSession | null>(null)
  const wakeSessionRef = useRef<VoiceSession | null>(null)
  /** Set for the rest of the conversation after a screenshot is shared. */
  const screenFlagRef = useRef(false)

  const prefs = settings?.assistant_prefs
  // A missing prefs object means the row predates the column; treat it as off
  // until the person opts in, rather than assuming consent.
  const enabled = prefs?.enabled === true
  const voiceSupported = defaultProviders.stt.isSupported()
  const screenSupported = isScreenCaptureSupported()

  const firstName = useMemo(
    () => (profile?.full_name || '').trim().split(/\s+/)[0] || 'there',
    [profile?.full_name],
  )

  const doneHabits = useMemo(() => {
    const set = new Set<string>()
    for (const log of habitLogs) if (log.completed) set.add(log.habit_id)
    return set
  }, [habitLogs])

  const categoryName = useCallback(
    (id: string | null) => (id ? (categories.find((c) => c.id === id)?.name ?? undefined) : undefined),
    [categories],
  )

  /**
   * The snapshot the model reasons over.
   *
   * Only what the assistant needs: ids, titles, times and statuses. No email, no
   * account identifiers, and no raw timestamps that would leak a timezone.
   */
  const planningContext = useCallback((): AiPlanningContext => {
    const now = new Date()
    return {
      displayName: profile?.full_name || undefined,
      planningStyle: prefs?.planning_style ?? 'balanced',
      planningDetail: prefs?.planning_detail ?? 'normal',
      dayLabel: format(now, 'EEEE, d MMMM'),
      nowLocal: format(now, 'HH:mm'),
      awakeStart: settings?.wake_time,
      awakeEnd: settings?.bed_time,
      focusStart: settings?.focus_start,
      focusEnd: settings?.focus_end,
      lifeAreas: categories.map((c) => c.name).slice(0, 12),
      tasks: openTasks.slice(0, 25).map((task) => ({
        id: task.id,
        title: task.title,
        due: task.deadline ?? undefined,
        priority: task.priority,
        minutes: task.remaining_minutes,
        status: task.status,
        area: categoryName(task.category_id),
      })),
      blocks: blocks.slice(0, 25).map((block) => ({
        id: block.id,
        title: block.title,
        start: format(new Date(block.start_at), 'HH:mm'),
        end: format(new Date(block.end_at), 'HH:mm'),
        kind: block.block_type,
        completed: block.completed,
      })),
      habits: habits.slice(0, 12).map((habit) => ({
        id: habit.id,
        name: habit.name,
        doneToday: doneHabits.has(habit.id),
      })),
      goals: goals.slice(0, 12).map((goal) => ({
        id: goal.id,
        title: goal.title,
        targetDate: goal.target_date ?? undefined,
      })),
      ...(focusRef.current ? { recentFocus: focusRef.current } : {}),
      ...(screenFlagRef.current ? { screenShareActive: true } : {}),
    }
  }, [
    blocks,
    categories,
    categoryName,
    doneHabits,
    goals,
    habits,
    openTasks,
    prefs?.planning_detail,
    prefs?.planning_style,
    profile?.full_name,
    settings?.bed_time,
    settings?.focus_end,
    settings?.focus_start,
    settings?.wake_time,
  ])

  /** Refresh every query a tool could have changed. */
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries()
  }, [queryClient])

  const appendTurn = useCallback((turn: Omit<AssistantTurn, 'id'>) => {
    seqRef.current += 1
    const id = `${turn.role === 'user' ? 'u' : 'a'}-${seqRef.current}`
    setTurns((prev) => [...prev, { ...turn, id }])
    return id
  }, [])

  const updateTurn = useCallback((turnId: string, patch: Partial<AssistantTurn>) => {
    setTurns((prev) => prev.map((turn) => (turn.id === turnId ? { ...turn, ...patch } : turn)))
  }, [])

  const markResolved = useCallback((turnId: string, proposalId: string) => {
    setTurns((prev) =>
      prev.map((turn) =>
        turn.id === turnId
          ? { ...turn, resolved: [...(turn.resolved ?? []), proposalId] }
          : turn,
      ),
    )
  }, [])

  const unmarkResolved = useCallback((turnId: string, proposalId: string) => {
    setTurns((prev) =>
      prev.map((turn) =>
        turn.id === turnId
          ? { ...turn, resolved: (turn.resolved ?? []).filter((id) => id !== proposalId) }
          : turn,
      ),
    )
  }, [])

  const speak = useCallback(
    (text: string) => {
      if (prefs?.speak_replies !== false) defaultProviders.tts.speak(text)
    },
    [prefs?.speak_replies],
  )

  /* ---------------------------------------------------------------- *
   * Sending
   * ---------------------------------------------------------------- */

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      if (!enabled) {
        toast('Turn on the assistant in Settings to use it.', { duration: 2500 })
        return
      }

      historyRef.current = [...historyRef.current, { role: 'user', content: trimmed }]
      appendTurn({ role: 'user', text: trimmed })

      const controller = new AbortController()
      abortRef.current = controller
      setPhase('thinking')
      setPartial('')

      try {
        const response = await sendAiChat(
          {
            messages: historyRef.current.slice(-14),
            context: planningContext(),
            toolsEnabled: prefs?.tools_enabled ?? true,
            ...(prefs?.model ? { model: prefs.model } : {}),
          },
          controller.signal,
        )

        historyRef.current = [...historyRef.current, { role: 'assistant', content: response.reply }]

        // Carry the ids this reply leaned on so a follow-up "it" resolves.
        const referenced = collectFocus(response.proposals)
        if (referenced) focusRef.current = referenced

        appendTurn({
          role: 'assistant',
          text: response.reply,
          proposals: response.proposals,
          ...(response.confirmation ? { confirmation: response.confirmation } : {}),
          ...(response.notice ? { notice: response.notice } : {}),
          model: response.model,
        })

        if (response.notice) toast.info(response.notice, { duration: 3000 })
        if (response.confirmation) {
          // Held for approval: do not speak past the question.
          defaultProviders.tts.stop()
          setPhase('idle')
        } else {
          setPhase('speaking')
          speak(response.reply)
        }
      } catch (error) {
        if (controller.signal.aborted) {
          setPhase('idle')
          return
        }
        const message = explainError(error)
        appendTurn({ role: 'assistant', text: message })
        setPhase('idle')
        if (error instanceof AiRequestError && (error.code === 'rate_limited' || error.code === 'free_daily_limit')) {
          toast.warning(message)
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    },
    [appendTurn, enabled, planningContext, prefs?.model, prefs?.tools_enabled, speak],
  )

  const ask = useCallback((text: string) => send(text), [send])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    commandSessionRef.current?.stop()
    commandSessionRef.current = null
    defaultProviders.tts.stop()
    setPhase('idle')
    setPartial('')
  }, [])

  /* ---------------------------------------------------------------- *
   * Voice
   * ---------------------------------------------------------------- */

  const startListening = useCallback(() => {
    if (!voiceSupported) {
      toast.error(SPEECH_ERRORS.unsupported)
      return
    }
    commandSessionRef.current?.stop()
    setPhase('listening')
    commandSessionRef.current = defaultProviders.stt.start('command', {
      onPhrase: (phrase) => {
        commandSessionRef.current?.stop()
        commandSessionRef.current = null
        void send(phrase)
      },
      onPartial: (text) => setPartial(text),
      onError: (code) => {
        setPhase('idle')
        setPartial('')
        toast.error(SPEECH_ERRORS[code] ?? 'I could not hear that. Try again.')
      },
      onEnd: () => setPhase((current) => (current === 'listening' ? 'idle' : current)),
    })
  }, [send, voiceSupported])

  const stopListening = useCallback(() => {
    commandSessionRef.current?.stop()
    commandSessionRef.current = null
    setPartial('')
    setPhase((current) => (current === 'listening' ? 'idle' : current))
  }, [])

  const toggleWakeWord = useCallback(() => {
    if (wakeArmed) {
      wakeSessionRef.current?.stop()
      wakeSessionRef.current = null
      setWakeArmed(false)
      toast('Wake word off', { duration: 1600 })
      return
    }
    if (!voiceSupported) {
      toast.error(SPEECH_ERRORS.unsupported)
      return
    }
    if (!prefs?.wake_word) {
      toast.error('Turn on the wake word in Settings first.')
      return
    }
    const provider = defaultProviders.wakeWord
    // Refuse to arm anything that would stream ambient audio off-device.
    if (!provider.local) {
      toast.error('This wake word provider would have to upload audio, so it is disabled.')
      return
    }
    wakeSessionRef.current = defaultProviders.stt.start('wake', {
      onPhrase: (phrase) => {
        const { woke, rest } = matchWakePhrase(phrase)
        if (!woke) return
        defaultProviders.tts.stop()
        window.setTimeout(() => {
          if (rest) void send(rest)
          else startListening()
        }, 250)
      },
      onError: (code) => {
        setWakeArmed(false)
        toast.error(SPEECH_ERRORS[code] ?? 'Wake word listening stopped.')
      },
    })
    setWakeArmed(true)
    toast(`Listening for “${prefs?.wake_phrase ?? 'Hey Morrow'}”`, { duration: 2200 })
  }, [prefs?.wake_phrase, prefs?.wake_word, send, startListening, voiceSupported, wakeArmed])

  /* ---------------------------------------------------------------- *
   * Proposals
   * ---------------------------------------------------------------- */

  const apply = useCallback(
    async (turnId: string, proposal: AiProposal) => {
      markResolved(turnId, proposal.id)
      const result = await runTool(userId, proposal)
      invalidate()
      if (result.ok) {
        toast.success(result.message)
        speak(result.message)
        // A follow-up "it" should now mean what was just created or changed.
        const bucket = focusBucketFor(proposal.kind)
        if (bucket && result.focus.length > 0) {
          focusRef.current = { ...focusRef.current, [bucket]: result.focus }
        }
      } else {
        toast.error(result.error)
        unmarkResolved(turnId, proposal.id)
      }
    },
    [invalidate, markResolved, speak, unmarkResolved, userId],
  )

  /** Seeds the composer with an editable instruction rather than a fake editor. */
  const edit = useCallback(
    (turnId: string, proposal: AiProposal) => {
      const describe = Object.entries(proposal.payload)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
        .join(', ')
      setPendingEdit(`Change that (${proposal.kind.replace(/_/g, ' ')} — ${describe}). Instead:`)
      markResolved(turnId, proposal.id)
    },
    [markResolved],
  )

  const cancel = useCallback((turnId: string, proposalId: string) => {
    markResolved(turnId, proposalId)
  }, [markResolved])

  /* ---------------------------------------------------------------- *
   * Destructive confirmation
   * ---------------------------------------------------------------- */

  const confirmDestructive = useCallback(
    async (turnId: string) => {
      const confirmation = turns.find((item) => item.id === turnId)?.confirmation
      if (!confirmation) return

      // Ask the server to re-validate and hand back an executable proposal. A
      // tampered client gains nothing: the tool must still pass the allowlist.
      const controller = new AbortController()
      abortRef.current = controller
      setPhase('thinking')
      try {
        const response = await sendAiChat(
          {
            messages: historyRef.current.slice(-14),
            context: planningContext(),
            confirm: {
              confirmationId: confirmation.confirmationId,
              tool: confirmation.tool,
              args: confirmation.params,
            },
          },
          controller.signal,
        )
        const approved = response.proposals[0]
        if (!approved) {
          toast.error('That action could not be prepared.')
          return
        }
        const result = await runTool(userId, approved)
        invalidate()
        if (result.ok) {
          toast.success(result.message)
          speak(result.message)
          updateTurn(turnId, { confirmation: undefined })
        } else {
          toast.error(result.error)
        }
      } catch (error) {
        toast.error(explainError(error))
      } finally {
        abortRef.current = null
        setPhase('idle')
      }
    },
    [invalidate, planningContext, speak, turns, updateTurn, userId],
  )

  const dismissConfirmation = useCallback(
    (turnId: string) => {
      updateTurn(turnId, { confirmation: undefined, cancelledConfirmation: true })
      defaultProviders.tts.stop()
    },
    [updateTurn],
  )

  /* ---------------------------------------------------------------- *
   * Screen awareness
   * ---------------------------------------------------------------- */

  const askAboutScreen = useCallback(
    async (question: string) => {
      const trimmed = question.trim()
      if (!trimmed) return
      if (!prefs?.screen_awareness) {
        toast.error('Turn on screen awareness in Settings first.')
        return
      }
      if (!screenSupported) {
        toast.error('This browser cannot capture the screen.')
        return
      }

      setScreenState('capturing')
      let frame: Awaited<ReturnType<typeof captureScreenFrame>>
      try {
        // One frame only. captureScreenFrame stops the track in its own finally
        // block, so the browser indicator disappears as soon as the shot is taken.
        frame = await captureScreenFrame()
      } catch (error) {
        setScreenState('error')
        if (error instanceof ScreenCaptureFailure && error.reason === 'denied') {
          toast('Screen sharing declined.', { duration: 2000 })
          return
        }
        toast.error(error instanceof Error ? error.message : 'Could not read the screen.')
        return
      }

      setScreenState('reading')
      appendTurn({ role: 'user', text: trimmed, fromScreen: true })
      try {
        const answer = await defaultProviders.vision.describe(
          { dataUrl: frame.dataUrl, capturedAt: frame.capturedAt },
          trimmed,
        )
        // Let the planner reason about what was on screen on later turns too.
        screenFlagRef.current = true
        appendTurn({ role: 'assistant', text: answer, fromScreen: true })
        speak(answer)
        setScreenState('off')
      } catch (error) {
        setScreenState('error')
        appendTurn({
          role: 'assistant',
          text: error instanceof Error ? error.message : 'Screen understanding failed.',
          fromScreen: true,
        })
      }
    },
    [appendTurn, prefs?.screen_awareness, screenSupported, speak],
  )

  /* ---------------------------------------------------------------- *
   * Model list
   * ---------------------------------------------------------------- */

  const refreshModels = useCallback(() => {
    setModelsLoading(true)
    defaultProviders.ai
      .listModels()
      .then(setModels)
      .catch(() => setModels(null))
      .finally(() => setModelsLoading(false))
  }, [])

  useEffect(() => {
    if (models) return
    refreshModels()
  }, [models, refreshModels])

  /* ---------------------------------------------------------------- *
   * Preferences
   * ---------------------------------------------------------------- */

  const savePrefs = useCallback(
    async (patch: Partial<AssistantPrefs>) => {
      if (!userId) return
      await updateAssistantPrefs(userId, patch)
      invalidate()
    },
    [invalidate, userId],
  )

  const clear = useCallback(() => {
    stop()
    setTurns([])
    historyRef.current = []
    focusRef.current = undefined
    screenFlagRef.current = false
  }, [stop])

  // Release the microphone, the speaker and the abort controller on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      commandSessionRef.current?.stop()
      wakeSessionRef.current?.stop()
      defaultProviders.tts.stop()
    }
  }, [])

  return {
    turns,
    phase,
    partial,
    busy: phase === 'thinking',
    enabled,
    firstName,
    prefs,
    prefsLoading,
    savePrefs,
    voiceSupported,
    wakeArmed,
    toggleWakeWord,
    models,
    modelsLoading,
    refreshModels,
    screenSupported,
    screenState,
    ask,
    stop,
    startListening,
    stopListening,
    apply,
    edit,
    cancel,
    confirmDestructive,
    dismissConfirmation,
    askAboutScreen,
    clear,
    pendingEdit,
    setPendingEdit,
  }
}

/** Ids the model actually referenced, so follow-up pronouns resolve. */
function collectFocus(proposals: AiProposal[]): AiPlanningContext['recentFocus'] | undefined {
  const focus: NonNullable<AiPlanningContext['recentFocus']> = {}
  for (const proposal of proposals) {
    const id =
      proposal.payload['task_id'] ??
      proposal.payload['block_id'] ??
      proposal.payload['habit_id'] ??
      proposal.payload['goal_id']
    if (typeof id !== 'string' || !id) continue
    const bucket = focusBucketFor(proposal.kind)
    if (!bucket) continue
    ;(focus[bucket] ??= []).push(id)
  }
  return Object.keys(focus).length > 0 ? focus : undefined
}
