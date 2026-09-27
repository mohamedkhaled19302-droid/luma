import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className="gradient-brand relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl shadow-glow">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" aria-hidden="true">
          <path
            d="M4 19V9m5.5 10V6.5m5.5 12.5V4m5 15V9"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="18.5" cy="4" r="1.4" fill="currentColor" />
        </svg>
        {/* Subtle shine */}
        <span className="absolute inset-0 bg-gradient-to-t from-transparent to-white/25" />
      </span>
      {withWordmark && (
        <span className="font-display text-lg font-bold tracking-[0.02em]">
          {BRAND.wordmark}
        </span>
      )}
    </span>
  )
}