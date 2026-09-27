import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Coffee,
  Flame,
  MoonStar,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  SlidersHorizontal,
  Target,
  Timer,
  TrendingUp,
  Volume2,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { format, isSameDay, subDays } from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useFocusStats } from '@/hooks/use-focus-stats'
import {
  DEFAULT_PRESET,
  FOCUS_PRESETS,
  formatClock,
  loadTimerState,
  nextPhase,
  phaseDurationMs,
  remainingMsAt,
  resolvePreset,
  saveTimerState,
  snapshotPreset,
  type FocusPreset,
  type TimerPhase,
  type TimerSnapshot,
} from '@/lib/focus-timer'
import {
  addCustomPreset,
  loadCustomPresets,
  removeCustomPreset,
} from '@/lib/custom-presets'
import { getSoundsEnabled, setSoundsEnabled, playSound } from '@/lib/sound'
import { usePointerReactive } from '@/lib/use-pointer-reactive'
import { logFocusSession } from '@/services/focus-service'
import type { DayStat } from '@/lib/focus-stats'
import { EmptyState } from '@/components/common/states'
import { SpinnerScreen } from '@/components/common/loading'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const PHASE_META: Record<TimerPhase, { label: string; icon: typeof Zap; ring: string }> = {
  focus: { label: 'Focus', icon: Zap, ring: 'text-indigo-500' },
  shortBreak: { label: 'Short break', icon: Coffee, ring: 'text-emerald-500' },
  longBreak: { label: 'Long break', icon: MoonStar, ring: 'text-sky-500' },
}

function CustomPresetDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (preset: Omit<FocusPreset, 'id'>) => void
}) {
  const [name, setName] = useState('')
  const [focusMinutes, setFocusMinutes] = useState('90')
  const [shortBreak, setShortBreak] = useState('10')
  const [longBreak, setLongBreak] = useState('20')
  const [rounds, setRounds] = useState('3')

  const focus = clampInt(focusMinutes, 1, 720)
  const focusedLabel =
    focus >= 60 ? `${Math.floor(focus / 60)}h${focus % 60 ? ` ${focus % 60}m` : ''}` : `${focus} min`

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Give your focus session a name first.')
      return
    }
    onSave({
      label: `${trimmed} ${focusedLabel}`,
      focusMinutes: focus,
      shortBreakMinutes: clampInt(shortBreak, 0, 120),
      longBreakMinutes: clampInt(longBreak, 0, 240),
      rounds: clampInt(rounds, 1, 12),
    })
    setName('')
    setFocusMinutes('90')
    setShortBreak('10')
    setLongBreak('20')
    setRounds('3')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Build a focus session</DialogTitle>
          <DialogDescription>
            Create your own session with any length you like — from 10 minutes to a full 12-hour deep work block.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fp-name">Name</Label>
            <Input
              id="fp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Deep study, Math marathon"
              maxLength={40}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fp-focus">Focus (min)</Label>
              <Input
                id="fp-focus"
                type="number"
                min={1}
                max={720}
                step={5}
                value={focusMinutes}
                onChange={(e) => setFocusMinutes(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fp-short">Short break (min)</Label>
              <Input
                id="fp-short"
                type="number"
                min={0}
                max={120}
                step={5}
                value={shortBreak}
                onChange={(e) => setShortBreak(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fp-long">Long break (min)</Label>
              <Input
                id="fp-long"
                type="number"
                min={0}
                max={240}
                step={5}
                value={longBreak}
                onChange={(e) => setLongBreak(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fp-rounds">Long break every</Label>
              <Input
                id="fp-rounds"
                type="number"
                min={1}
                max={12}
                value={rounds}
                onChange={(e) => setRounds(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save &amp; start</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function clampInt(value: string, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return min
  return Math.min(max, Math.max(min, parsed))
}

function freshSnapshot(preset: FocusPreset): TimerSnapshot {
  return {
    status: 'idle',
    phase: 'focus',
    remainingMs: phaseDurationMs(preset, 'focus'),
    endsAt: null,
    completedFocusSessions: 0,
    presetId: preset.id,
    preset,
    savedAt: Date.now(),
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
      </span>
      <p className={cn('mt-2.5 text-lg font-semibold leading-none', accent && 'gradient-brand-text')}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function shortMinutes(minutes: number): string {
  const m = Math.round(minutes)
  const hours = Math.floor(m / 60)
  const rest = m % 60
  if (hours > 0 && rest > 0) return `${hours}h ${rest}m`
  if (hours > 0) return `${hours}h`
  return `${m}m`
}

function weekdayLabel(dateKey: string): string {
  return format(new Date(`${dateKey}T12:00:00`), 'EEE')
}

function sessionWhen(iso: string): string {
  const date = new Date(iso)
  if (isSameDay(date, new Date())) return `Today · ${format(date, 'h:mm a')}`
  if (isSameDay(date, subDays(new Date(), 1))) return `Yesterday · ${format(date, 'h:mm a')}`
  return format(date, 'MMM d · h:mm a')
}

function WeeklyBars({ days, reducedMotion }: { days: DayStat[]; reducedMotion: boolean }) {
  const max = days.reduce((top, day) => Math.max(top, day.minutes), 0)
  return (
    <div
      className="flex items-end gap-2 sm:gap-3"
      role="img"
      aria-label="Focused minutes per day over the last 7 days"
    >
      {days.map((day) => {
        const percent = max > 0 ? (day.minutes / max) * 100 : 0
        const visible = day.minutes > 0 ? Math.max(percent, 4) : 0
        return (
          <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {shortMinutes(day.minutes)}
            </span>
            <div className="flex h-24 w-full items-end justify-center">
              <div
                className={cn(
                  'w-full max-w-8 rounded-t-md bg-primary',
                  !reducedMotion && 'transition-[height] duration-500 ease-out',
                )}
                style={{ height: `${visible}%` }}
                aria-label={`${weekdayLabel(day.date)}: ${shortMinutes(day.minutes)}`}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{weekdayLabel(day.date)}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function FocusPage() {
  const { user } = useAuth()
  const userId = user?.id ?? 'anonymous'
  const queryClient = useQueryClient()
  const { stats, sessions, isLoading: statsLoading } = useFocusStats()
  const [snapshot, setSnapshot] = useState<TimerSnapshot>(() => loadTimerState(userId) ?? freshSnapshot(DEFAULT_PRESET))
  const [, forceTick] = useState(0)
  const intervalRef = useRef<number | null>(null)
  const { reducedMotion } = usePointerReactive()
  const [soundsEnabled, setSoundsEnabledState] = useState(() => getSoundsEnabled())
  const [customPresets, setCustomPresets] = useState<FocusPreset[]>(() => loadCustomPresets())
  const [showBuilder, setShowBuilder] = useState(false)

  const preset = useMemo(() => snapshotPreset(snapshot, customPresets), [snapshot, customPresets])
  const allPresets = useMemo(() => [...customPresets, ...FOCUS_PRESETS], [customPresets])
  const remaining = remainingMsAt(snapshot, Date.now())
  const total = phaseDurationMs(preset, snapshot.phase)
  const progress = total > 0 ? ((total - remaining) / total) * 100 : 0
  const meta = PHASE_META[snapshot.phase]
  const round =
    snapshot.phase === 'focus' ? (snapshot.completedFocusSessions % preset.rounds) + 1 : null

  const toggleSounds = (next: boolean) => {
    setSoundsEnabled(next)
    setSoundsEnabledState(next)
    if (next) playSound('confirm')
  }

  // Persist on every meaningful change
  useEffect(() => {
    saveTimerState(userId, { ...snapshot, savedAt: Date.now() })
  }, [snapshot, userId])

  // Tick: wall-clock based so background tab throttling can't drift the timer
  useEffect(() => {
    if (snapshot.status !== 'running') return
    intervalRef.current = window.setInterval(() => {
      forceTick((n) => n + 1)
      const left = remainingMsAt(snapshot, Date.now())
      if (left <= 0) {
        finishPhase()
      }
    }, 500)
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.status, snapshot.endsAt])

  const finishPhase = () => {
    setSnapshot((prev) => {
      const completed =
        prev.phase === 'focus' ? prev.completedFocusSessions + 1 : prev.completedFocusSessions
      const following = nextPhase(preset, prev.phase, completed)
      return {
        ...prev,
        status: 'done',
        phase: following,
        remainingMs: phaseDurationMs(preset, following),
        endsAt: null,
        completedFocusSessions: completed,
      }
    })
    if (snapshot.phase === 'focus') {
      playSound('celebrate')
      toast.success('Focus session complete! Take a breather.', {
        description: `Session ${snapshot.completedFocusSessions + 1} done.`,
      })
      logFocusSession(userId, {
        presetId: preset.id,
        name: preset.label,
        durationMinutes: preset.focusMinutes,
        completedAt: Date.now(),
      })
      void queryClient.invalidateQueries({ queryKey: ['focus-sessions'] })
    } else {
      playSound('confirm')
      toast('Break over — ready for the next round?', { icon: '⏰' })
    }
  }

  const start = () => {
    playSound('confirm')
    setSnapshot((prev) => {
      const duration = prev.status === 'paused' ? prev.remainingMs : phaseDurationMs(preset, prev.phase)
      return {
        ...prev,
        status: 'running',
        remainingMs: duration,
        endsAt: Date.now() + duration,
      }
    })
  }

  const pause = () => {
    playSound('click')
    setSnapshot((prev) => ({
      ...prev,
      status: 'paused',
      remainingMs: remainingMsAt(prev, Date.now()),
      endsAt: null,
    }))
  }

  const reset = () => {
    playSound('click')
    setSnapshot({
      ...freshSnapshot(preset),
      completedFocusSessions: 0,
    })
  }

  const skip = () => {
    playSound('toggle')
    setSnapshot((prev) => {
      const following = nextPhase(preset, prev.phase, prev.completedFocusSessions)
      return {
        ...prev,
        status: 'idle',
        phase: following,
        remainingMs: phaseDurationMs(preset, following),
        endsAt: null,
      }
    })
  }

  const choosePreset = (next: FocusPreset) => {
    playSound('toggle')
    setSnapshot((prev) => ({ ...freshSnapshot(next), completedFocusSessions: prev.completedFocusSessions }))
  }

  const saveCustomPreset = (draft: Omit<FocusPreset, 'id'>) => {
    const created = addCustomPreset(draft)
    if (!created) {
      toast.error('Could not save that focus session.')
      return
    }
    setCustomPresets(loadCustomPresets())
    setShowBuilder(false)
    choosePreset(created)
    toast.success(`“${created.label}” is ready — press start.`)
    playSound('confirm')
  }

  const deleteCustomPreset = (id: string) => {
    removeCustomPreset(id)
    setCustomPresets(loadCustomPresets())
    playSound('toggle')
  }

  const running = snapshot.status === 'running'
  const done = snapshot.status === 'done'

  const PhaseIcon = meta.icon
  const bestDayLabel = stats.bestDay
    ? `${format(new Date(`${stats.bestDay.date}T12:00:00`), 'MMM d')} · ${shortMinutes(stats.bestDay.minutes)}`
    : '—'

  return (
    <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
      <header className="text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Focus Studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A Pomodoro timer that respects your rhythm. Session counts stay on this device —
          it doesn&apos;t log task minutes.
        </p>
      </header>

      <div className="relative">
        <div
          className="pointer-events-none absolute -top-16 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-10 right-2 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl"
          aria-hidden="true"
        />
        <Card className="relative overflow-hidden">
          <div className="gradient-brand absolute inset-x-0 top-0 h-1" aria-hidden="true" />
          <CardHeader className="items-center space-y-1 pt-7 text-center">
            <Badge variant="secondary" className="gap-1.5 px-3 py-1">
              <PhaseIcon className={cn('h-3.5 w-3.5', meta.ring)} aria-hidden="true" />
              {meta.label}
              {round !== null && (
                <span className="text-muted-foreground">
                  · {round}/{preset.rounds}
                </span>
              )}
            </Badge>
            <CardTitle
              className={cn(
                'font-display text-6xl font-bold tracking-tight tabular-nums transition-colors sm:text-8xl',
                done && 'text-primary',
                done && !reducedMotion && 'animate-pulse',
              )}
              aria-live="polite"
              aria-label={`${meta.label}, ${formatClock(remaining)} remaining`}
            >
              {formatClock(remaining)}
            </CardTitle>
            <CardDescription>
              {done
                ? snapshot.phase === 'focus'
                  ? 'Break done — dive back in when you’re ready.'
                  : 'Session complete — enjoy your break.'
                : running
                  ? 'Keep going. You’ve got this.'
                  : 'Press start when you’re ready.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Progress value={progress} className="h-2.5" aria-hidden="true" />

            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="icon-lg" onClick={reset} aria-label="Reset timer">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </Button>
              {running ? (
                <Button size="lg" onClick={pause} className="w-32 gap-2">
                  <Pause className="h-4 w-4" aria-hidden="true" /> Pause
                </Button>
              ) : (
                <Button size="lg" onClick={start} className="w-32 gap-2">
                  <Play className="h-4 w-4" aria-hidden="true" />
                  {snapshot.status === 'paused' ? 'Resume' : snapshot.status === 'done' ? 'Start next' : 'Start'}
                </Button>
              )}
              <Button variant="outline" size="icon-lg" onClick={skip} aria-label="Skip to next phase">
                <SkipForward className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="flex items-center justify-center gap-1.5" aria-label={`${snapshot.completedFocusSessions} focus sessions completed`}>
              {Array.from({ length: preset.rounds }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    'h-2.5 w-2.5 rounded-full transition-colors',
                    i < snapshot.completedFocusSessions % preset.rounds ||
                      (snapshot.completedFocusSessions > 0 &&
                        snapshot.completedFocusSessions % preset.rounds === 0)
                      ? 'bg-primary'
                      : 'bg-muted',
                  )}
                />
              ))}
              <span className="ml-2 flex items-center gap-1 text-xs text-muted-foreground">
                <Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
                {snapshot.completedFocusSessions} session{snapshot.completedFocusSessions === 1 ? '' : 's'} today
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Presets</CardTitle>
          <CardDescription>Changing preset resets the current round. Build your own for any length of time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {allPresets.map((p) => (
              <div key={p.id} className="relative">
                <button
                  type="button"
                  onClick={() => choosePreset(p)}
                  aria-pressed={preset.id === p.id}
                  className={cn(
                    'w-full rounded-xl border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    preset.id === p.id
                      ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/30'
                      : 'bg-muted/40 hover:bg-muted/70',
                  )}
                >
                  <p className="font-display text-sm font-semibold">{p.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.focusMinutes} min focus · {p.shortBreakMinutes} min break · long break every {p.rounds}
                  </p>
                </button>
                {p.id.startsWith('custom:') && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteCustomPreset(p.id)}
                    aria-label={`Delete ${p.label}`}
                  >
                    ×
                  </Button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setShowBuilder(true)}
              className="flex flex-col items-start justify-center rounded-xl border border-dashed p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted/50 hover:shadow-soft-md"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
              </span>
              <p className="mt-2 font-display text-sm font-semibold">Build your own</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Name it, set any length — 90 min, 3 hours…</p>
            </button>
          </div>
        </CardContent>
      </Card>

      <CustomPresetDialog
        open={showBuilder}
        onOpenChange={setShowBuilder}
        onSave={saveCustomPreset}
      />

      <Card>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Volume2 className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="font-display text-sm font-semibold">Completion chimes</p>
              <p className="text-xs text-muted-foreground">
                Play UI sounds across the app — alerts for sessions &amp; breaks.
              </p>
            </div>
          </div>
          <Switch
            checked={soundsEnabled}
            onCheckedChange={toggleSounds}
            aria-label="Toggle UI sounds"
          />
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden">
        <div className="gradient-brand absolute inset-x-0 top-0 h-1" aria-hidden="true" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
            Focus analytics
          </CardTitle>
          <CardDescription>Your focus history, at a glance.</CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <SpinnerScreen label="Loading focus stats…" />
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={<Timer className="h-5 w-5" aria-hidden="true" />}
              title="No focus sessions yet"
              description="Finish your first focus round and your stats will show up here."
            />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard icon={Flame} label="You're on a day streak" value={String(stats.currentStreak)} accent />
                <StatCard icon={Timer} label="Total focus" value={shortMinutes(stats.totalMinutes)} />
                <StatCard icon={Target} label="Focused this week" value={shortMinutes(stats.weekMinutes)} />
                <StatCard icon={TrendingUp} label="Best day" value={bestDayLabel} />
              </div>

              <div className="rounded-xl border bg-card p-4 shadow-soft">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium">Last 7 days</p>
                  <span className="text-xs text-muted-foreground">
                    {shortMinutes(stats.weekMinutes)} focused this week
                  </span>
                </div>
                <WeeklyBars days={stats.lastSeven} reducedMotion={reducedMotion} />
              </div>

              <div className="rounded-xl border bg-card p-4 shadow-soft">
                <p className="mb-3 text-sm font-medium">Recent sessions</p>
                <ScrollArea className="max-h-64 pr-3">
                  <ul className="space-y-2">
                    {sessions.slice(0, 8).map((session) => (
                      <li
                        key={session.id}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{session.name ?? sessionWhen(session.endedAt)}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {session.name ? sessionWhen(session.endedAt) : resolvePreset(session.presetId, customPresets).label}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-semibold tabular-nums">
                            {shortMinutes(session.durationMinutes)}
                          </span>
                          <Badge variant="success">Completed</Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}