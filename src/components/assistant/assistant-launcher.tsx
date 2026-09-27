/**
 * Docked assistant launcher.
 *
 * A button that opens the shared assistant panel in a floating sheet. The panel
 * is only mounted while it is open, so no query, no microphone and no speech
 * synthesis is alive behind a closed launcher.
 */

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AssistantPanel } from './assistant-panel'

export function AssistantLauncher({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // Never leave the sheet covering a page the person just navigated to.
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  // Escape closes it, matching the other dismissible surfaces in the app.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!userId) return null

  return (
    <>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Close assistant"
            className="fixed inset-0 z-40 cursor-default bg-background/40 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              'stagger-fade fixed z-50',
              // Sits above the mobile bottom nav, inside the safe area.
              'inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))]',
              'sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[24rem]',
            )}
          >
            <AssistantPanel
              userId={userId}
              variant="floating"
              onClose={() => setOpen(false)}
            />
          </div>
        </>
      ) : null}

      <Button
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        aria-expanded={open}
        className={cn(
          'fixed z-50 h-12 w-12 rounded-full shadow-lg',
          'right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:right-6 sm:bottom-6',
        )}
      >
        {open ? <X /> : <Sparkles />}
      </Button>
    </>
  )
}
