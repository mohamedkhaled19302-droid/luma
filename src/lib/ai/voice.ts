/**
 * Browser voice plumbing for the Morrow assistant: wake-word listening, speech
 * recognition and spoken replies. Everything degrades silently when the browser
 * has no Web Speech support, so the planner never depends on it.
 */

import { BRAND } from '@/lib/brand'

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: {
    length: number
    [index: number]: { isFinal: boolean; length: number; [alt: number]: { transcript: string } }
  }
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isVoiceSupported(): boolean {
  return recognitionCtor() !== null && typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * Wake phrases that open the assistant. The current brand comes first, then the
 * previous one so anyone who already says "Hey LUMA" out of habit keeps working.
 *
 * Matching happens in the browser against the on-device recogniser. Ambient
 * audio is never sent anywhere; only a phrase that already contains a wake word
 * is ever turned into a command.
 */
export const WAKE_PHRASES: readonly string[] = [
  `hey ${BRAND.name.toLowerCase()}`,
  `hi ${BRAND.name.toLowerCase()}`,
  `hello ${BRAND.name.toLowerCase()}`,
  BRAND.name.toLowerCase(),
  'hey luma',
  'hi luma',
  'hello luma',
  'luma',
]

export function stripWakePhrase(text: string): { woke: boolean; rest: string } {
  const normalised = text.trim().toLowerCase()
  const match = WAKE_PHRASES.find((phrase) => normalised.startsWith(phrase))
  if (!match) return { woke: false, rest: text.trim() }
  return { woke: true, rest: text.trim().slice(match.length).replace(/^[\s,.:!?-]+/, '') }
}

export interface VoiceListenerHandlers {
  /** Called with each finalised phrase. */
  onPhrase: (text: string) => void
  onPartial?: (text: string) => void
  onError?: (error: string) => void
  onEnd?: () => void
}

/**
 * A continuously-running recognition session. Used either as a wake-word
 * listener or as a one-shot command capture.
 */
export class VoiceListener {
  private recognition: SpeechRecognitionLike | null = null
  private running = false

  constructor(private readonly handlers: VoiceListenerHandlers) {}

  get isRunning(): boolean {
    return this.running
  }

  start(mode: 'wake' | 'command'): boolean {
    const Ctor = recognitionCtor()
    if (!Ctor) {
      this.handlers.onError?.('unsupported')
      return false
    }
    if (this.running) this.stop()
    const recognition = new Ctor()
    recognition.continuous = mode === 'wake'
    recognition.interimResults = mode === 'command'
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (!result) continue
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) {
          const text = transcript.trim()
          if (text) this.handlers.onPhrase(text)
        } else {
          interim += transcript
        }
      }
      if (interim) this.handlers.onPartial?.(interim)
    }
    recognition.onerror = (event) => {
      if (event.error && event.error !== 'aborted' && event.error !== 'no-speech') {
        this.handlers.onError?.(event.error)
      }
    }
    recognition.onend = () => {
      this.running = false
      this.handlers.onEnd?.()
    }

    this.recognition = recognition
    try {
      recognition.start()
      this.running = true
      return true
    } catch {
      this.running = false
      this.handlers.onError?.('start-failed')
      return false
    }
  }

  stop(): void {
    if (!this.recognition) return
    try {
      this.recognition.stop()
    } catch {
      /* already stopped */
    }
    this.running = false
  }

  dispose(): void {
    if (!this.recognition) return
    try {
      this.recognition.abort()
    } catch {
      /* already gone */
    }
    this.recognition = null
    this.running = false
  }
}

let currentUtterance: SpeechSynthesisUtterance | null = null

/** Speaks a reply, cancelling anything already being spoken. */
export function speak(text: string, enabled: boolean): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const clean = text.replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim()
  if (!clean) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(clean)
  utterance.rate = 1.02
  utterance.pitch = 1
  const voices = window.speechSynthesis.getVoices()
  const preferred =
    voices.find((voice) => /en[-_]GB/i.test(voice.lang) && /female|samantha|zira|karen/i.test(voice.name)) ??
    voices.find((voice) => /^en/i.test(voice.lang))
  if (preferred) utterance.voice = preferred
  currentUtterance = utterance
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  currentUtterance = null
}

export function isSpeaking(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  return window.speechSynthesis.speaking || currentUtterance !== null
}
