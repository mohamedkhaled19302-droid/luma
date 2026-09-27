import { useState } from 'react'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import {
  CalendarRange,
  CheckCircle2,
  Lock,
  LockOpen,
  RotateCcw,
  SkipForward,
  Sparkles,
  Trash2,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import {
  useBlocksForDay,
  useDailyPlan,
  useEvents,
  useHabits,
  useOpenTasks,
  useSettings,
} from '@/hooks/queries'
import { useBlockMutations } from '@/hooks/mutations'
import { runScheduleAndPersist } from '@/services/scheduling-service'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { endOfDay, startOfDay, toMinutesOfDay } from '@/scheduler/time'
import type { ScheduleBlock } from '@/types/models'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/states'
import { Spinner } from '@/components/common/loading'
import { cn, formatError } from '@/lib/utils'
import { blockVisual } from '@/lib/block-visuals'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const VIEW_START_IN_MINUTES = 6 * 60
const VIEW_END_IN_MINUTES = 24 * 60
const MINUTE_HEIGHT = 48 / 60

function BlockCard({ block, onClick }: { block: ScheduleBlock; onClick: () => void }) {
  const rawStart = toMinutesOfDay(new Date(block.start_at))
  const rawEnd = toMinutesOfDay(new Date(block.end_at))
  const startMinutes = Math.max(rawStart, VIEW_START_IN_MINUTES)
  let endMinutes = Math.min(rawEnd, VIEW_END_IN_MINUTES)
  if (endMinutes <= startMinutes) endMinutes = Math.min(startMinutes + 60, VIEW_END_IN_MINUTES)
  const top = (startMinutes - VIEW_START_IN_MINUTES) * MINUTE_HEIGHT
  const height = (endMinutes - startMinutes) * MINUTE_HEIGHT

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ top, height }}
      className={cn(
        'absolute left-16 right-2 overflow-hidden rounded-md border px-2 py-1 text-left text-xs shadow-sm transition-colors hover:brightness-110',
        blockVisual(block.block_type).classes,
        block.completed && 'opacity-50',
      )}
    >
      <span className="flex items-center gap-1">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: block.color ?? 'currentColor' }}
        />
        <span className={cn('truncate text-[11px] font-medium', block.completed && 'line-through')}>
          {block.title}
        </span>
        {block.locked && <Lock className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />}
      </span>
      <span className="mt-0.5 flex items-center gap-1 text-[10px] opacity-80">
        {format(parseISO(block.start_at), 'h:mm a')} – {format(parseISO(block.end_at), 'h:mm a')}
        {block.skipped && <span className="ml-auto font-medium">skipped</span>}
      </span>
    </button>
  )
}

const dayKey = (date: Date) => format(date, 'yyyy-MM-dd')

export default function PlannerPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()))
  const [generating, setGenerating] = useState(false)
  const [selectedBlock, setSelectedBlock] = useState<ScheduleBlock | null>(null)

  const { data: tasks } = useOpenTasks(userId)
  const { data: events } = useEvents(userId, startOfDay(selectedDate), endOfDay(selectedDate))
  const { data: habits } = useHabits(userId, true)
  const settings = useSettings(userId)
  const { data: blocks, isLoading } = useBlocksForDay(userId, selectedDate)
  const { data: dailyPlan } = useDailyPlan(userId, selectedDate)
  const bm = useBlockMutations(userId)

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 })
  const settingsReady = Boolean(settings.data)
  const selectedKey = dayKey(selectedDate)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await runScheduleAndPersist(userId, startOfDay(selectedDate), endOfDay(selectedDate))
      toast.success('Your day is planned')
      void queryClient.invalidateQueries({ queryKey: ['blocks'] })
      void queryClient.invalidateQueries({ queryKey: ['daily-plan'] })
      void queryClient.invalidateQueries({ queryKey: ['sessions'] })
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setGenerating(false)
    }
  }

  const toggleComplete = (block: ScheduleBlock) =>
    bm.complete.mutate(
      { id: block.id, completed: !block.completed },
      { onError: (error) => toast.error(formatError(error)) },
    )

  const toggleSkip = (block: ScheduleBlock) =>
    bm.skip.mutate(
      { id: block.id, skipped: !block.skipped },
      { onError: (error) => toast.error(formatError(error)) },
    )

  const toggleLock = (block: ScheduleBlock) =>
    bm.lock.mutate(
      { id: block.id, locked: !block.locked },
      { onError: (error) => toast.error(formatError(error)) },
    )

  const removeBlock = (block: ScheduleBlock) =>
    bm.remove.mutate(
      { id: block.id },
      {
        onSuccess: () => {
          toast.success('Block removed.')
          setSelectedBlock(null)
        },
        onError: (error) => toast.error(formatError(error)),
      },
    )

  if (!userId) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <EmptyState title="Sign in to plan your day" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Daily Planner</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          An energy-aware schedule that meets you where you are today.
        </p>
      </div>

      <div className="flex gap-2">
        {DAY_LABELS.map((label, index) => {
          const day = addDays(weekStart, index)
          const isSelected = dayKey(day) === selectedKey
          const isToday = dayKey(day) === dayKey(new Date())
          return (
            <button
              key={label}
              type="button"
              onClick={() => setSelectedDate(day)}
              className={cn(
                'flex h-11 flex-1 flex-col items-center justify-center rounded-lg border text-xs transition-colors',
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border text-muted-foreground hover:bg-muted',
              )}
            >
              <span className="font-medium">{label}</span>
              <span className={cn('text-[10px]', isSelected ? 'text-primary-foreground/80' : isToday && 'text-primary')}>
                {format(day, 'd')}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleGenerate} disabled={generating || !settingsReady}>
            {generating ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            Generate plan
          </Button>
          <Button variant="outline" onClick={() => setSelectedDate(startOfDay(new Date()))}>
            Today
          </Button>
          {!online && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
              You&apos;re offline — changes are saved locally.
            </span>
          )}
        </div>
        {dailyPlan?.balance_score != null && (
          <Badge variant="outline">
            Balance {dailyPlan.balance_score}
          </Badge>
        )}
      </div>

      {!settings.isLoading && !settings.data && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          Finish setup so your plan can match your sleep, energy and study windows.
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{format(selectedDate, 'EEEE, MMMM d')}</span> ·{' '}
        {tasks?.length ?? 0} open task{(tasks?.length ?? 1) === 1 ? '' : 's'} · {events?.length ?? 0} event
        {(events?.length ?? 1) === 1 ? '' : 's'} · {habits?.length ?? 0} habit{(habits?.length ?? 1) === 1 ? '' : 's'}{' '}
        ready to weave into your day
      </p>

      {isLoading ? (
        <Skeleton className="h-[864px] w-full rounded-xl" />
      ) : blocks && blocks.length > 0 ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="relative h-[864px]">
            {Array.from({ length: 18 }, (_, i) => i + 6).map((hour) => (
              <div
                key={hour}
                className="absolute inset-x-0 border-t border-border/60"
                style={{ top: (hour - 6) * 48 }}
              >
                <span className="absolute left-3 -top-2 text-[10px] tabular-nums text-muted-foreground">
                  {String(hour).padStart(2, '0')}:00
                </span>
              </div>
            ))}
            {blocks.map((block) => (
              <BlockCard key={block.id} block={block} onClick={() => setSelectedBlock(block)} />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<CalendarRange className="h-6 w-6" aria-hidden="true" />}
          title="No plan yet"
          description="Run the scheduler to shape your day around how you actually feel."
          action={
            <Button onClick={handleGenerate} disabled={generating || !settingsReady}>
              {generating ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              Generate today&apos;s plan
            </Button>
          }
        />
      )}

      <Dialog open={selectedBlock !== null} onOpenChange={(open) => { if (!open) setSelectedBlock(null) }}>
        {selectedBlock && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: selectedBlock.color ?? 'currentColor' }}
                />
                {selectedBlock.title}
                {selectedBlock.locked && <Lock className="h-4 w-4" aria-hidden="true" />}
              </DialogTitle>
              <DialogDescription>
                {format(parseISO(selectedBlock.start_at), 'h:mm a')} –{' '}
                {format(parseISO(selectedBlock.end_at), 'h:mm a')}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {selectedBlock.block_type}
              </Badge>
              {selectedBlock.completed && <Badge>Completed</Badge>}
              {selectedBlock.skipped && <Badge variant="secondary">Skipped</Badge>}
            </div>
            {selectedBlock.note && <p className="text-sm text-muted-foreground">{selectedBlock.note}</p>}
            <DialogFooter className="flex-wrap">
              <Button variant="outline" onClick={() => toggleComplete(selectedBlock)}>
                {selectedBlock.completed ? (
                  <>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Undo complete
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Complete
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => toggleSkip(selectedBlock)} disabled={selectedBlock.completed}>
                <SkipForward className="h-4 w-4" aria-hidden="true" />
                {selectedBlock.skipped ? 'Unskip' : 'Skip'}
              </Button>
              <Button variant="outline" onClick={() => toggleLock(selectedBlock)}>
                {selectedBlock.locked ? (
                  <>
                    <LockOpen className="h-4 w-4" aria-hidden="true" />
                    Unlock
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    Lock
                  </>
                )}
              </Button>
              <Button variant="destructive" onClick={() => removeBlock(selectedBlock)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}