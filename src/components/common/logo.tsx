import { cn } from '@/lib/utils'

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-primary">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary-foreground" fill="none" aria-hidden="true">
          <path
            d="M4 19V9m5.5 10V6.5m5.5 12.5V4m5 15V9"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="18.5" cy="4" r="1.4" fill="currentColor" />
        </svg>
      </span>
      {withWordmark && (
        <span className="text-lg font-bold tracking-tight">
          LUMA
        </span>
      )}
    </span>
  )
}