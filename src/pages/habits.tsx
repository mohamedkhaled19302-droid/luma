import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Check,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Repeat,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useHabitLogsToday, useHabits } from '@/hooks/queries'
import { useHabitMutations } from '@/hooks/mutations'
import { formatDayKey } from '@/scheduler/time'
import type { Habit, HabitFrequency } from '@/types/models'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/states'
import { Spinner } from '@/components/common/loading'
import { cn, formatError } from '@/lib/utils'

const COLOR_PALETTE = [
  '#8b5cf6',
  '#4f46e5',
  '#0891b2',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#db2777',
  '#0ea5e9',
]

interface HabitFormValues {
  name: string
  description: string
  frequency: HabitFrequency
  target_per_week: string
  preferred_time: string
  estimated_minutes: string
  color: string
}

function HabitFormDialog({
  open,
  onOpenChange,
  habit,
  submitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  habit: Habit | null
  submitting: boolean
  onSubmit: (values: HabitFormValues) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [frequency, setFrequency] = useState<HabitFrequency>('daily')
  const [targetPerWeek, setTargetPerWeek] = useState('7')
  const [preferredTime, setPreferredTime] = useState('')
  const [estimatedMinutes, setEstimatedMinutes] = useState('15')
  const [color, setColor] = useState(COLOR_PALETTE[0] ?? '#8b5cf6')

  useEffect(() => {
    if (!open) return
    setName(habit?.name ?? '')
    setDescription(habit?.description ?? '')
    setFrequency(habit?.frequency ?? 'daily')
    setTargetPerWeek(String(habit?.target_per_week ?? 7))
    setPreferredTime(habit?.preferred_time ?? '')
    setEstimatedMinutes(String(habit?.estimated_minutes ?? 15))
    setColor(habit?.color ?? (COLOR_PALETTE[0] ?? '#8b5cf6'))
  }, [open, habit])

  const handleFrequencyChange = (value: string) => {
    const next = value as HabitFrequency
    setFrequency(next)
    setTargetPerWeek(next === 'daily' ? '7' : '3')
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit({
      name,
      description,
      frequency,
      target_per_week: targetPerWeek,
      preferred_time: preferredTime,
      estimated_minutes: estimatedMinutes,
      color,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{habit ? 'Edit habit' : 'New habit'}</DialogTitle>
          <DialogDescription>
            {habit ? 'Tweak the details and keep the streak alive.' : 'Small, repeatable — that is how change happens.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="habit-name">Name</Label>
            <Input
              id="habit-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Read for 15 minutes"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="habit-description">Description</Label>
            <Textarea
              id="habit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="A little why goes a long way."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={handleFrequencyChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="habit-target">Target per week</Label>
              <Input
                id="habit-target"
                type="number"
                min={1}
                value={targetPerWeek}
                onChange={(event) => setTargetPerWeek(event.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="habit-time">Preferred time</Label>
              <Input
                id="habit-time"
                type="time"
                value={preferredTime}
                onChange={(event) => setPreferredTime(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="habit-minutes">Estimated minutes</Label>
              <Input
                id="habit-minutes"
                type="number"
                min={1}
                value={estimatedMinutes}
                onChange={(event) => setEstimatedMinutes(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PALETTE.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={`Choose color ${swatch}`}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110',
                    color === swatch
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-border',
                  )}
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || name.trim() === ''}>
              {submitting && <Spinner className="h-4 w-4" />}
              {habit ? 'Save changes' : 'Create habit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function HabitsPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const habits = useHabits(userId)
  const hm = useHabitMutations(userId)
  const logsToday = useHabitLogsToday(userId, new Date())
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; habit: Habit } | null>(null)

  const allHabits = habits.data ?? []
  const activeHabits = allHabits.filter((habit) => habit.active)
  const todayKey = formatDayKey(new Date())
  const logMap = new Map(
    (logsToday.data ?? []).map((log) => [log.habit_id, log.completed] as [string, boolean]),
  )

  const doneToday = (habit: Habit) => logMap.get(habit.id) === true

  const toggleLog = (habit: Habit) => {
    const current = doneToday(habit)
    hm.log.mutate(
      { habit_id: habit.id, log_date: todayKey, completed: !current },
      {
        onSuccess: () => toast.success(current ? 'Marked undone.' : 'Nice one — logged for today!'),
        onError: (error) => toast.error(formatError(error)),
      },
    )
  }

  const toggleActive = (habit: Habit) =>
    hm.update.mutate(
      { id: habit.id, fields: { active: !habit.active } },
      {
        onSuccess: () =>
          toast.success(habit.active ? 'Habit paused. It will wait for you.' : 'Habit activated. Welcome back!'),
        onError: (error) => toast.error(formatError(error)),
      },
    )

  const deleteHabit = (habit: Habit) =>
    hm.remove.mutate(
      { id: habit.id },
      {
        onSuccess: () => toast.success('Habit deleted.'),
        onError: (error) => toast.error(formatError(error)),
      },
    )

  const submitCreate = (values: HabitFormValues) => {
    hm.create.mutate(
      {
        name: values.name,
        description: values.description.trim() || null,
        frequency: values.frequency,
        target_per_week: Number(values.target_per_week) || (values.frequency === 'daily' ? 7 : 3),
        preferred_time: values.preferred_time || null,
        color: values.color,
        estimated_minutes: Number(values.estimated_minutes) || 15,
      },
      {
        onSuccess: () => {
          toast.success('Habit created. Small steps, big change.')
          setDialog(null)
        },
        onError: (error) => toast.error(formatError(error)),
      },
    )
  }

  const submitEdit = (values: HabitFormValues) => {
    if (dialog?.mode !== 'edit') return
    const habit = dialog.habit
    hm.update.mutate(
      {
        id: habit.id,
        fields: {
          name: values.name,
          description: values.description.trim() || null,
          frequency: values.frequency,
          target_per_week: Number(values.target_per_week) || habit.target_per_week,
          preferred_time: values.preferred_time || null,
          color: values.color,
          estimated_minutes: Number(values.estimated_minutes) || habit.estimated_minutes,
        },
      },
      {
        onSuccess: () => {
          toast.success('Habit updated.')
          setDialog(null)
        },
        onError: (error) => toast.error(formatError(error)),
      },
    )
  }

  if (!userId) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <EmptyState title="Sign in to build your habits" />
      </div>
    )
  }

  if (habits.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Habits</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tiny rituals that compound into who you want to be.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New habit
        </Button>
      </div>

      {activeHabits.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-semibold">Today</p>
            <ul className="space-y-1">
              {activeHabits.map((habit) => {
                const done = doneToday(habit)
                return (
                  <li
                    key={habit.id}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: habit.color }} />
                    <span className={cn('min-w-0 flex-1 truncate text-sm', done && 'text-muted-foreground line-through')}>
                      {habit.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleLog(habit)}
                      aria-label={done ? `Mark ${habit.name} as not done` : `Mark ${habit.name} done`}
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                        done ? 'border-transparent text-white' : 'border-input text-transparent hover:border-primary',
                      )}
                      style={done ? { backgroundColor: habit.color } : undefined}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {allHabits.length === 0 ? (
        <EmptyState
          icon={<Repeat className="h-6 w-6" aria-hidden="true" />}
          title="No habits yet"
          description="Start with one tiny habit and let it grow."
          action={
            <Button onClick={() => setDialog({ mode: 'create' })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New habit
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {allHabits.map((habit) => {
            const done = doneToday(habit)
            return (
              <Card key={habit.id} className={cn(!habit.active && 'opacity-70')}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: habit.color }}
                      />
                      <p className="truncate text-sm font-medium">{habit.name}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Actions for ${habit.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDialog({ mode: 'edit', habit })}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(habit)}>
                          <Power className="h-4 w-4" aria-hidden="true" />
                          {habit.active ? 'Pause' : 'Activate'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteHabit(habit)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {habit.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{habit.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {habit.frequency}
                    </Badge>
                    <Badge variant="secondary">{habit.target_per_week}× / week</Badge>
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Done today
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not yet</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {dialog?.mode === 'create' && (
        <HabitFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
          habit={null}
          submitting={hm.create.isPending}
          onSubmit={submitCreate}
        />
      )}
      {dialog?.mode === 'edit' && (
        <HabitFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
          habit={dialog.habit}
          submitting={hm.update.isPending}
          onSubmit={submitEdit}
        />
      )}
    </div>
  )
}