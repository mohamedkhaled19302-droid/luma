import { useEffect, useRef, useState } from 'react'

/**
 * Reports normalized pointer position (-1..1 on both axes) relative to the
 * viewport so 3D scenes can react to the mouse or touch. Also tracks whether
 * the user prefers reduced motion so scenes can render statically.
 */
export function usePointerReactive() {
  const pointer = useRef({ x: 0, y: 0, active: false })
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMedia = () => setReducedMotion(media.matches)
    updateMedia()
    media.addEventListener('change', updateMedia)

    const onMove = (event: PointerEvent) => {
      pointer.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: (event.clientY / window.innerHeight) * 2 - 1,
        active: true,
      }
    }
    const onLeave = () => {
      pointer.current.active = false
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)

    return () => {
      media.removeEventListener('change', updateMedia)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return { pointer, reducedMotion }
}