import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className)} aria-hidden="true" />
}

export function SpinnerScreen({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <Spinner className="h-6 w-6" />
        {label && <span className="text-sm">{label}</span>}
      </div>
    </div>
  )
}