/**
 * Concrete provider implementations for the assistant.
 *
 * Every capability the UI needs is expressed as an interface in `./types`, and
 * the app only ever depends on those interfaces. Swapping OpenRouter for a
 * local model, or Web Speech for a hosted transcription service, means changing
 * this file — not a single component.
 *
 * Privacy rules encoded here:
 *  - the OpenRouter key never leaves the server, so the browser talks to our own
 *    `/api/ai/*` routes and never to OpenRouter directly;
 *  - the wake word is matched locally, so nothing is transmitted while idle;
 *  - screen capture is only ever started by an explicit user action and is torn
 *    down as soon as the answer is produced.
 */

import { supabase } from '@/database/client'
import {
  fetchAiModels,
  sendAiChat,
} from './client'
import type {
  AIProvider,
  AiChatResponse,
  AiCompletionRequest,
  AiModelsResponse,
  SpeechToTextProvider,
  TextToSpeechProvider,
  VisionFrame,
  VisionProvider,
  VoiceHandlers,
  VoiceSession,
  VoiceStartMode,
  WakeWordProvider,
} from './types'
import {
  isSpeaking,
  isVoiceSupported,
  speak,
  stopSpeaking,
  stripWakePhrase,
  VoiceListener,
  WAKE_PHRASES,
} from './voice'

/* ------------------------------------------------------------------ *
 * Text / reasoning
 * ------------------------------------------------------------------ */

export const openRouterAiProvider: AIProvider = {
  id: 'openrouter',
  label: 'OpenRouter (free models only)',

  async isAvailable() {
    try {
      const models = await fetchAiModels()
      return models.hasKey
    } catch {
      return false
    }
  },

  async listModels(): Promise<AiModelsResponse> {
    return fetchAiModels()
  },

  async chat(request: AiCompletionRequest): Promise<AiChatResponse> {
    return sendAiChat(
      {
        messages: request.messages,
        ...(request.model ? { model: request.model } : {}),
        ...(request.context ? { context: request.context } : {}),
        ...(request.toolsEnabled === undefined ? {} : { toolsEnabled: request.toolsEnabled }),
      },
      request.signal,
    )
  },
}

/* ------------------------------------------------------------------ *
 * Speech to text
 * ------------------------------------------------------------------ */

class WebSpeechSession implements VoiceSession {
  constructor(private readonly listener: VoiceListener) {}

  stop(): void {
    this.listener.dispose()
  }

  get active(): boolean {
    return this.listener.isRunning
  }
}

export const webSpeechToText: SpeechToTextProvider = {
  id: 'web-speech',
  label: 'Browser speech recognition (on device)',

  isSupported() {
    return isVoiceSupported()
  },

  start(mode: VoiceStartMode, handlers: VoiceHandlers): VoiceSession {
    const listener = new VoiceListener({
      onPhrase: (text) => handlers.onPhrase(text),
      ...(handlers.onPartial ? { onPartial: (text) => handlers.onPartial?.(text) } : {}),
      ...(handlers.onError ? { onError: (message) => handlers.onError?.(message) } : {}),
      ...(handlers.onEnd ? { onEnd: () => handlers.onEnd?.() } : {}),
    })
    listener.start(mode)
    return new WebSpeechSession(listener)
  },
}

/* ------------------------------------------------------------------ *
 * Text to speech
 * ------------------------------------------------------------------ */

export const webSpeechSynthesis: TextToSpeechProvider = {
  id: 'web-speech-synthesis',
  label: 'Browser speech synthesis',

  isSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  },

  speak(text: string) {
    speak(text, true)
  },

  stop() {
    stopSpeaking()
  },

  get speaking() {
    return isSpeaking()
  },
}

/* ------------------------------------------------------------------ *
 * Wake word
 *
 * Local-only by construction: the phrases are matched in the browser against
 * speech already recognised on device. There is no hosted wake-word path, and
 * `local` is true so callers can refuse to arm it in an untrusted context.
 * ------------------------------------------------------------------ */

export const webSpeechWakeWord: WakeWordProvider = {
  id: 'web-speech-wake',
  label: 'Local wake word ("Hey Morrow")',
  phrases: WAKE_PHRASES,
  local: true,
  isSupported() {
    return isVoiceSupported()
  },
}

/** Split a recognised phrase into whether it woke the assistant, and the rest. */
export function matchWakePhrase(text: string): { woke: boolean; rest: string } {
  return stripWakePhrase(text)
}

/* ------------------------------------------------------------------ *
 * Vision (screen awareness)
 * ------------------------------------------------------------------ */

export const openRouterVisionProvider: VisionProvider = {
  id: 'openrouter-vision',
  label: 'OpenRouter free vision model',

  isSupported() {
    return typeof window !== 'undefined'
  },

  async describe(frame: VisionFrame, question: string, signal?: AbortSignal) {
    // Screenshots go through the same authenticated, metered proxy as text, so
    // the caller proves who they are before a single pixel is analysed.
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    const response = await fetch('/api/ai/vision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        image: frame.dataUrl,
        question,
      }),
      ...(signal ? { signal } : {}),
    })

    const payload: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      const message = extractError(payload, 'Screen understanding is unavailable right now.')
      throw new Error(message)
    }

    const body = (payload ?? {}) as Record<string, unknown>
    const answer = typeof body['answer'] === 'string' ? body['answer'] : ''
    if (!answer) throw new Error('Screen understanding returned nothing useful.')
    return answer
  },
}

function extractError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const error = (payload as Record<string, unknown>)['error']
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>)['message']
    if (typeof message === 'string' && message) return message
  }
  if (typeof error === 'string' && error) return error
  return fallback
}

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

export interface AssistantProviders {
  ai: AIProvider
  stt: SpeechToTextProvider
  tts: TextToSpeechProvider
  wakeWord: WakeWordProvider
  vision: VisionProvider
}

/**
 * The single place the app resolves its providers. Swap an entry here to change
 * backends globally.
 */
export const defaultProviders: AssistantProviders = {
  ai: openRouterAiProvider,
  stt: webSpeechToText,
  tts: webSpeechSynthesis,
  wakeWord: webSpeechWakeWord,
  vision: openRouterVisionProvider,
}
