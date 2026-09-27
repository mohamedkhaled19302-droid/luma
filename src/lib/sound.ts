/**
 * Tiny synthesized UI sound engine (ClickUp-style audio feedback).
 *
 * All sounds are generated with the Web Audio API — no audio files to ship,
 * nothing to download, fully offline. Sounds are opt-in and only ever play
 * after a user gesture (browsers block audio before the first interaction).
 */

export type SoundName = 'click' | 'confirm' | 'toggle' | 'celebrate' | 'whoosh' | 'delete'

import { STORAGE_KEYS } from '@/lib/brand'

const STORAGE_KEY = STORAGE_KEYS.sounds

export function getSoundsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setSoundsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* storage unavailable */
  }
}

let ctx: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface Tone {
  frequency: number
  duration: number
  delay?: number
  type?: OscillatorType
  gain?: number
  /** Slide the frequency toward this value over the tone duration */
  slideTo?: number
}

function playTones(tones: Tone[]): void {
  const audio = audioContext()
  if (!audio) return
  const now = audio.currentTime
  for (const tone of tones) {
    const osc = audio.createOscillator()
    const envelope = audio.createGain()
    const start = now + (tone.delay ?? 0)
    const peak = tone.gain ?? 0.06
    osc.type = tone.type ?? 'sine'
    osc.frequency.setValueAtTime(tone.frequency, start)
    if (tone.slideTo) {
      osc.frequency.exponentialRampToValueAtTime(tone.slideTo, start + tone.duration)
    }
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.exponentialRampToValueAtTime(peak, start + 0.012)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration)
    osc.connect(envelope).connect(audio.destination)
    osc.start(start)
    osc.stop(start + tone.duration + 0.02)
  }
}

const PRESETS: Record<SoundName, Tone[]> = {
  click: [{ frequency: 2200, duration: 0.045, type: 'square', gain: 0.02 }],
  toggle: [
    { frequency: 700, duration: 0.05, type: 'sine', gain: 0.04 },
    { frequency: 1050, duration: 0.06, delay: 0.05, type: 'sine', gain: 0.04 },
  ],
  confirm: [
    { frequency: 620, duration: 0.07, type: 'sine', gain: 0.05 },
    { frequency: 930, duration: 0.1, delay: 0.06, type: 'sine', gain: 0.05 },
  ],
  whoosh: [{ frequency: 260, duration: 0.16, type: 'triangle', gain: 0.045, slideTo: 980 }],
  celebrate: [
    { frequency: 523, duration: 0.09, type: 'sine', gain: 0.05 },
    { frequency: 659, duration: 0.09, delay: 0.08, type: 'sine', gain: 0.05 },
    { frequency: 784, duration: 0.12, delay: 0.16, type: 'sine', gain: 0.05 },
    { frequency: 1047, duration: 0.18, delay: 0.24, type: 'sine', gain: 0.055 },
  ],
  delete: [{ frequency: 420, duration: 0.12, type: 'sawtooth', gain: 0.03, slideTo: 160 }],
}

export function playSound(name: SoundName): void {
  if (!getSoundsEnabled()) return
  try {
    playTones(PRESETS[name])
  } catch {
    /* audio is a nicety — never break the app for it */
  }
}