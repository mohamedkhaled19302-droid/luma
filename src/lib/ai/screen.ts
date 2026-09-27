/**
 * Explicit, self-tearing-down screen capture.
 *
 * Privacy contract:
 *  - nothing here runs unless the user presses the "ask about my screen" button;
 *  - the browser's own "sharing this tab" indicator is shown, because the picker
 *    and the OS indicator cannot be suppressed;
 *  - exactly one frame is grabbed, handed to the vision provider, and the track
 *    is stopped immediately afterwards — there is no background or periodic
 *    capture anywhere in Morrow;
 *  - every capture ends in a `finally`, so a failed or cancelled request can
 *    never leave the microphone-style indicator running.
 */

export type ScreenCaptureError = 'unsupported' | 'denied' | 'no-surface' | 'failed'

export class ScreenCaptureFailure extends Error {
  constructor(readonly reason: ScreenCaptureError, message: string) {
    super(message)
    this.name = 'ScreenCaptureFailure'
  }
}

export interface ScreenFrame {
  dataUrl: string
  capturedAt: string
  width: number
  height: number
}

interface CaptureTarget {
  stream: MediaStream
  track: MediaStreamTrack
}

/** True when the browser exposes a screen picker at all. */
export function isScreenCaptureSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getDisplayMedia)
  )
}

/**
 * Ask the user to share a screen or window. Resolves with a single frame and
 * then releases the track. Rejects with a typed reason on denial.
 */
export async function captureScreenFrame(): Promise<ScreenFrame> {
  if (!isScreenCaptureSupported()) {
    throw new ScreenCaptureFailure(
      'unsupported',
      'This browser cannot capture the screen. You can still describe what is on it instead.',
    )
  }

  let target: CaptureTarget | null = null
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false,
    })
    const track = stream.getVideoTracks()[0]
    if (!track) {
      throw new ScreenCaptureFailure('no-surface', 'No screen or window was shared.')
    }
    target = { stream, track }

    const frame = await grabFrame(target)
    return { ...frame, capturedAt: new Date().toISOString() }
  } catch (error) {
    if (error instanceof ScreenCaptureFailure) throw error
    const name = (error as { name?: string } | null)?.name
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new ScreenCaptureFailure('denied', 'Screen sharing was declined.')
    }
    throw new ScreenCaptureFailure('failed', 'Could not read the shared screen.')
  } finally {
    // Always release, whatever happened above.
    stopCapture(target)
  }
}

/** Stop any capture tracks. Safe to call with null. */
export function stopCapture(target: CaptureTarget | null): void {
  if (!target) return
  try {
    target.stream.getTracks().forEach((t) => t.stop())
  } catch {
    /* the stream may already be closed */
  }
}

/**
 * Read a single frame off the track. Uses an <img> decode rather than
 * `ImageCapture` so it works on Firefox, which does not implement grabFrame yet.
 */
async function grabFrame(target: CaptureTarget): Promise<Omit<ScreenFrame, 'capturedAt'>> {
  const track = target.track
  const video = document.createElement('video')
  video.srcObject = target.stream
  video.muted = true
  video.playsInline = true

  try {
    await video.play()
  } catch {
    throw new ScreenCaptureFailure('failed', 'Could not start reading the shared screen.')
  }

  const settings = track.getSettings?.()
  const width = settings?.width ?? video.videoWidth ?? 1280
  const height = settings?.height ?? video.videoHeight ?? 720

  // Very large screens produce huge base64 payloads. Downscale to keep the
  // request small enough for a free vision model.
  const MAX_WIDTH = 1280
  const scale = width > MAX_WIDTH ? MAX_WIDTH / width : 1
  const targetWidth = Math.round(width * scale)
  const targetHeight = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (!context) {
    throw new ScreenCaptureFailure('failed', 'Could not process the shared screen.')
  }
  context.drawImage(video, 0, 0, targetWidth, targetHeight)

  const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
  if (!dataUrl.startsWith('data:image/')) {
    throw new ScreenCaptureFailure('failed', 'Could not read the shared screen.')
  }

  return { dataUrl, width: targetWidth, height: targetHeight }
}

/** Rough payload size of a data URL, for the consent copy. */
export function estimateFrameBytes(dataUrl: string): number {
  return Math.round(((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3) / 4)
}
