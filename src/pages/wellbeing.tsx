import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { endOfDay, format, startOfDay, subDays } from 'date-fns'
import { Heart, Moon, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useWellbeing, useWellbeingRange } from '@/hooks/queries'
import { useWellbeingMutations } from '@/hooks/mutations'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatError } from '@/lib/utils'
import { formatDayKey } from '@/scheduler/time'

const REMINDERS = [
  'Rest counts as progress. Protect your pause.',
  'Energy follows rhythm. A steady week beats a heroic one.',
  'Be kind to yourself — you are doing better than you think.',
]

function energyDotClass(energy: number | null): string {
  if (energy == null) return 'bg-muted'
  if (energy >= 7) return 'bg-emerald-500'
  if (energy >= 4) return 'bg-amber-400'
  return 'bg-orange-500'
}

function stressDotClass(stress: number | null): string {
  if (stress == null) return 'bg-muted'
  if (stress <= 3) return 'bg-red-200'
  if (stress <= 6) return 'bg-red-400'
  return 'bg-red-600'
}

export default function WellbeingPage() {
  const { user } = useAuth()
  const userId = user?.id

  const today = new Date()
  const { data: todayCheckin, isLoading } = useWellbeing(userId ?? '', today)
  const { data: weekCheckins, isLoading: rangeLoading } = useWellbeingRange(
    userId ?? '',
    startOfDay(subDays(today, 6)),
    endOfDay(today),
  )
  const mutation = useWellbeingMutations(userId ?? '')

  const [energy, setEnergy] = useState(5)
  const [stress, setStress] = useState(5)
  const [sleepHours, setSleepHours] = useState('')
  const [note, setNote] = useState('')
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    if (!todayCheckin || synced) return
    setEnergy(todayCheckin.energy ?? 5)
    setStress(todayCheckin.stress ?? 5)
    setSleepHours(todayCheckin.sleep_hours != null ? String(todayCheckin.sleep_hours) : '')
    setNote(todayCheckin.note ?? '')
    setSynced(true)
  }, [todayCheckin, synced])

  if (!user) return <Navigate to="/auth/sign-in" replace />

  if (isLoading || rangeLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  const checkinByDay = new Map(weekCheckins?.map((checkin) => [checkin.checkin_date, checkin]))
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => subDays(today, 6 - index))
  const reminder = REMINDERS[new Date().getDate() % REMINDERS.length]

  const handleSave = () => {
    mutation.mutate(
      {
        checkin_date: formatDayKey(new Date()),
        energy,
        stress,
        sleep_hours: sleepHours !== '' ? Number(sleepHours) : null,
        note: note.trim() !== '' ? note.trim() : null,
      },
      {
        onSuccess: () => {
          setSynced(true)
          toast.success('Check-in saved. Breathe easy.')
        },
        onError: (error) => toast.error(formatError(error)),
      },
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Wellbeing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your energy is your most precious resource.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Today&apos;s check-in
          </CardTitle>
          <CardDescription>A minute for you, a clearer day ahead.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="energy">Energy</Label>
              <span className="text-sm font-medium text-foreground">{energy}/10</span>
            </div>
            <input
              id="energy"
              type="range"
              min={0}
              max={10}
              step={1}
              value={energy}
              onChange={(event) => setEnergy(Number(event.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="stress">Stress</Label>
              <span className="text-sm font-medium text-foreground">{stress}/10</span>
            </div>
            <input
              id="stress"
              type="range"
              min={0}
              max={10}
              step={1}
              value={stress}
              onChange={(event) => setStress(Number(event.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="sleep" className="flex items-center gap-1.5">
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                Sleep hours
              </Label>
              {sleepHours !== '' && <span className="text-sm font-medium">{sleepHours}h</span>}
            </div>
            <Input
              id="sleep"
              type="number"
              min={0}
              max={12}
              step={0.5}
              value={sleepHours}
              onChange={(event) => setSleepHours(event.target.value)}
              placeholder="e.g. 7.5"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Anything on your mind?"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : "Save today's check-in"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last 7 days</CardTitle>
          <CardDescription>A gentle look back at how you have been.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {lastSevenDays.map((day) => {
              const checkin = checkinByDay.get(formatDayKey(day))
              return (
                <div key={formatDayKey(day)} className="rounded-xl border bg-card p-3">
                  <p className="text-xs font-medium text-foreground">{format(day, 'EEE d')}</p>
                  {checkin ? (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn('h-2.5 w-2.5 shrink-0 rounded-full', energyDotClass(checkin.energy))}
                        />
                        <span className="text-xs text-muted-foreground">
                          Energy {checkin.energy ?? '-'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn('h-2.5 w-2.5 shrink-0 rounded-full', stressDotClass(checkin.stress))}
                        />
                        <span className="text-xs text-muted-foreground">
                          Stress {checkin.stress ?? '-'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {checkin.sleep_hours ?? '-'}h sleep
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No check-in</p>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-3 p-5">
          <Heart className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm text-foreground/90">{reminder}</p>
        </CardContent>
      </Card>
    </div>
  )
}