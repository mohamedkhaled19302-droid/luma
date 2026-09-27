import { useEffect, useState, type KeyboardEvent } from 'react'
import { useMediaQuery } from '@/lib/use-media-query'

/**
 * Screen-reader-only class. Same visual hiding technique as Tailwind's
 * `sr-only` utility but self-contained so it works regardless of the build.
 */
export const visuallyHidden =
  'absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)] border-0 p-0 [margin:-1px]'

/** True when the user prefers reduced motion. Shared by 3D scenes and animations. */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

let liveRegion: HTMLDivElement | null = null

/**
 * Pushes a message to a persistent `role="status"` live region so screen
 * readers announce background updates (e.g. a timer finishing, a plan
 * applying) without stealing focus.
 */
export function announce(message: string): void {
  if (typeof document === 'undefined') return
  if (!liveRegion) {
    const region = document.createElement('div')
    region.setAttribute('role', 'status')
    region.setAttribute('aria-live', 'polite')
    region.className = visuallyHidden
    document.body.appendChild(region)
    liveRegion = region
  }
  liveRegion.textContent = ''
  // Clear first so identical consecutive messages are announced again.
  window.requestAnimationFrame(() => {
    liveRegion!.textContent = message
  })
}

/**
 * Keyboard event props to make a clickable `div` behave like a button:
 * Enter and Space activate, matching native button semantics without
 * double-firing on synthetic events.
 */
export function keyboardHandler(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onActivate()
      }
    },
  }
}

/** Subscribe to a system preference with a clean SSR-safe default. */
export function usePrefersReducedMotion(): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return matches
}