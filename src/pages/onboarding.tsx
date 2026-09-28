import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Moon,
  Plus,
  Repeat,
  Trash2,
  Zap,
} from 'lucide-react'
import { addDays, format, set } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Logo } from '@/components/common/logo'
import { Spinner, SpinnerScreen } from '@/components/common/loading'
import { EmptyState } from '@/components/common/states'
import { useAuth } from '@/hooks/use-auth'
import { useProfileMutations, useSettingsUpdate } from '@/hooks/mutations'
import { createCategoriesBulk } from '@/services/category-service'
import { createEvent } from '@/services/event-service'
import { upsertCheckin } from '@/services/wellbeing-service'
import { BRAND } from '@/lib/brand'
import { formatDayKey } from '@/scheduler/time'
import { cn, formatError } from '@/lib/utils'
import type { OnboardingData } from '@/types/models'

const CATEGORY_COLORS = ['#6366f1', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#db2777', '#8b5cf6']

/** Sensible starting points — a mix of work, health, home and personal. */
const CATEGORY_IDEAS = ['Work', 'Health', 'Home', 'Learning', 'Family', 'Side project', 'Money', 'Errands']

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

const STEP_TITLES = ['About you', 'Your categories', 'Your week', 'Almost done']
const STEP_DESCRIPTIONS = [
  `Tell us a little about you so ${BRAND.name} can plan around your real life.`,
  'The areas of your life you want to keep separate. Colour-code them so your plan is easy to read at a glance.',
  `${BRAND.name} builds your day around your natural rhythm. Tweak these whenever you like.`,
  'One last look before we quietly take care of the rest.',
]
const STEP_COUNT = STEP_TITLES.length

const CREATE_SUMMARY = [
  { icon: CalendarClock, text: 'Keep every deadline in view' },
  { icon: Repeat, text: 'Build habits that actually stick' },
  { icon: Zap, text: 'Protect your energy across the day' },
  { icon: Moon, text: 'Make sure you truly rest' },
]

type EditableCommitment = OnboardingData['commitments'][number]

const DEFAULT_STATE: OnboardingData = {
  full_name: '',
  categories: [
    { name: 'Work', color: CATEGORY_COLORS[0] ?? '#6366f1' },
    { name: 'Health', color: CATEGORY_COLORS[2] ?? '#16a34a' },
    { name: 'Home', color: CATEGORY_COLORS[1] ?? '#0891b2' },
  ],
  availableStart: '08:00',
  availableEnd: '20:00',
  focusStart: '09:00',
  focusEnd: '18:00',
  sleepTarget: 8,
  maxSessionMinutes: 90,
  commitments: [],
  energy: null,
  stress: null,
}

/** Repeat the coming week's occurrence of `weekday` as a concrete date. */
function upcomingDateFor(weekday: number, offsetWeeks = 0): Date {
  const today = new Date()
  const todayWeekday = today.getDay()
  const delta = (weekday - todayWeekday + 7) % 7
  return addDays(today, offsetWeeks * 7 + delta)
}

function occurrenceAt(weekday: number, time: string, offsetWeeks = 0): string {
  const [hour = 0, minute = 0] = time.split(':').map(Number)
  return set(upcomingDateFor(weekday, offsetWeeks), {
    hours: hour,
    minutes: minute,
    seconds: 0,
    milliseconds: 0,
  }).toISOString()
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const profileMutation = useProfileMutations(user?.id ?? '')
  const settingsMutation = useSettingsUpdate(user?.id ?? '')

  const [step, setStep] = useState(0)
  const [state, setState] = useState<OnboardingData>(DEFAULT_STATE)
  const [saving, setSaving] = useState(false)

  if (loading) return <SpinnerScreen label="Loading your space" />
  if (!user) return <Navigate to="/auth/sign-in" replace />

  function setField<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  function nextCategoryColor(count: number): string {
    return CATEGORY_COLORS[count % CATEGORY_COLORS.length] ?? '#6366f1'
  }

  function appendCategory(name: string, color?: string) {
    setState((prev) => ({
      ...prev,
      categories: [
        ...prev.categories,
        { name, color: color ?? nextCategoryColor(prev.categories.length) },
      ],
    }))
  }

  function addCategory() {
    appendCategory('')
  }

  function updateCategory(index: number, patch: Partial<OnboardingData['categories'][number]>) {
    setState((prev) => ({
      ...prev,
      categories: prev.categories.map((category, i) =>
        i === index ? { ...category, ...patch } : category,
      ),
    }))
  }

  function removeCategory(index: number) {
    setState((prev) => ({
      ...prev,
      categories: prev.categories.filter((_, i) => i !== index),
    }))
  }

  function addCommitment() {
    setState((prev) => ({
      ...prev,
      commitments: [...prev.commitments, { title: '', weekday: 1, start: '09:00', end: '10:00' }],
    }))
  }

  function updateCommitment(index: number, patch: Partial<EditableCommitment>) {
    setState((prev) => ({
      ...prev,
      commitments: prev.commitments.map((commitment, i) =>
        i === index ? { ...commitment, ...patch } : commitment,
      ),
    }))
  }

  function removeCommitment(index: number) {
    setState((prev) => ({
      ...prev,
      commitments: prev.commitments.filter((_, i) => i !== index),
    }))
  }

  function goBack() {
    if (step > 0) setStep(step - 1)
  }

  function goNext() {
    if (step < STEP_COUNT - 1) setStep(step + 1)
  }

  async function handleSubmit() {
    if (!user) return
    setSaving(true)
    try {
      await profileMutation.mutateAsync({ full_name: state.full_name.trim() })

      const namedCategories = state.categories.filter((category) => category.name.trim() !== '')
      if (namedCategories.length > 0) {
        await createCategoriesBulk(
          user.id,
          namedCategories.map((category) => ({
            name: category.name.trim(),
            color: category.color,
          })),
        )
      }

      for (const commitment of state.commitments) {
        if (commitment.title.trim() === '') continue
        // Lay the first four occurrences down as locked events so the scheduler
        // has something concrete to plan around for the next few weeks.
        for (let week = 0; week < 4; week += 1) {
          await createEvent(user.id, {
            title: commitment.title.trim(),
            description: null,
            start_at: occurrenceAt(commitment.weekday, commitment.start, week),
            end_at: occurrenceAt(commitment.weekday, commitment.end, week),
            all_day: false,
            event_type: 'fixed',
            locked: true,
            location: null,
            color: '#10b981',
          })
        }
      }

      await settingsMutation.mutateAsync({
        wake_time: state.availableStart,
        bed_time: state.availableEnd,
        focus_start: state.focusStart,
        focus_end: state.focusEnd,
        max_session_minutes: Number(state.maxSessionMinutes),
        sleep_target_hours: Number(state.sleepTarget),
        onboarded: true,
      })

      if (state.energy != null || state.stress != null) {
        await upsertCheckin(user.id, {
          checkin_date: formatDayKey(new Date()),
          energy: state.energy,
          stress: state.stress,
          sleep_hours: null,
          note: null,
        })
      }

      toast.success(`Welcome to ${BRAND.name}`)
      navigate('/dashboard')
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setSaving(false)
    }
  }

  const nextDisabled = step === 0 && state.full_name.trim().length === 0

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <Card className="shadow-soft-lg">
          <CardHeader className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Setting up your life</span>
                <span className="font-medium">
                  Step {step + 1} of {STEP_COUNT}
                </span>
              </div>
              <Progress value={((step + 1) / STEP_COUNT) * 100} className="h-2" />
            </div>
            <div key={step} className="animate-fade-up space-y-1">
              <CardTitle className="text-2xl">{STEP_TITLES[step]}</CardTitle>
              <CardDescription>{STEP_DESCRIPTIONS[step]}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div key={`step-${step}`} className="animate-fade-up">
              {step === 0 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">What should we call you?</Label>
                    <Input
                      id="fullName"
                      type="text"
                      autoComplete="name"
                      placeholder="Ava Chen"
                      value={state.full_name}
                      onChange={(event) => setField('full_name', event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="energy">How is your energy right now?</Label>
                    <div className="flex items-center gap-3">
                      <input
                        id="energy"
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        className="h-2 flex-1 accent-primary"
                        value={state.energy ?? 5}
                        onChange={(event) => setField('energy', Number(event.target.value))}
                      />
                      <span className="w-12 text-right text-sm font-medium text-muted-foreground">
                        {state.energy ?? 5}/10
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      You can skip this — it just helps {BRAND.name} get the tone right on day one.
                    </p>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  {state.categories.length === 0 ? (
                    <EmptyState
                      icon={<Plus className="h-6 w-6" />}
                      title="Add the areas of your life you want to keep separate."
                      description="Work, health, home, a side project — whatever fits."
                      action={
                        <Button size="sm" onClick={addCategory}>
                          <Plus className="h-4 w-4" />
                          Add a category
                        </Button>
                      }
                    />
                  ) : (
                    <div className="space-y-3">
                      {state.categories.map((category, index) => (
                        <div key={index} className="flex items-start gap-3 rounded-lg border p-3">
                          <span
                            className="mt-2.5 h-4 w-4 shrink-0 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          <div className="flex-1 space-y-2">
                            <Input
                              value={category.name}
                              placeholder="e.g. Deep work"
                              onChange={(event) => updateCategory(index, { name: event.target.value })}
                            />
                            <div className="flex flex-wrap items-center gap-1.5">
                              {CATEGORY_COLORS.map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  aria-label={`Use color ${color}`}
                                  className={cn(
                                    'h-5 w-5 rounded-full transition',
                                    category.color === color &&
                                      'ring-2 ring-ring ring-offset-2 ring-offset-background',
                                  )}
                                  style={{ backgroundColor: color }}
                                  onClick={() => updateCategory(index, { color })}
                                />
                              ))}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove category"
                            onClick={() => removeCategory(index)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-1.5">
                        {CATEGORY_IDEAS.filter(
                          (idea) => !state.categories.some((c) => c.name.toLowerCase() === idea.toLowerCase()),
                        ).map((idea) => (
                          <button
                            key={idea}
                            type="button"
                            onClick={() => appendCategory(idea)}
                            className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                          >
                            <Plus className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                            {idea}
                          </button>
                        ))}
                      </div>
                      <Button type="button" variant="outline" onClick={addCategory}>
                        <Plus className="h-4 w-4" />
                        Add another category
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="availableStart">Day starts</Label>
                      <Input
                        id="availableStart"
                        type="time"
                        value={state.availableStart}
                        onChange={(event) => setField('availableStart', event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="availableEnd">Day ends</Label>
                      <Input
                        id="availableEnd"
                        type="time"
                        value={state.availableEnd}
                        onChange={(event) => setField('availableEnd', event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="focusStart">Focus hours start</Label>
                      <Input
                        id="focusStart"
                        type="time"
                        value={state.focusStart}
                        onChange={(event) => setField('focusStart', event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="focusEnd">Focus hours end</Label>
                      <Input
                        id="focusEnd"
                        type="time"
                        value={state.focusEnd}
                        onChange={(event) => setField('focusEnd', event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="maxSession">Session length (max, minutes)</Label>
                      <Input
                        id="maxSession"
                        type="number"
                        min={15}
                        step={15}
                        value={String(state.maxSessionMinutes)}
                        onChange={(event) => setField('maxSessionMinutes', Number(event.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sleepTarget">Sleep target (hours)</Label>
                      <Input
                        id="sleepTarget"
                        type="number"
                        min={1}
                        max={12}
                        step={1}
                        value={String(state.sleepTarget)}
                        onChange={(event) => setField('sleepTarget', Number(event.target.value))}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Fixed commitments</p>
                        <p className="text-xs text-muted-foreground">
                          Anything recurring you can&apos;t move: work, training, family, appointments.
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={addCommitment}>
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>
                    {state.commitments.length === 0 ? (
                      <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                        None yet — you can add these any time from the planner.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {state.commitments.map((commitment, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-12 items-end gap-2 rounded-lg border p-3"
                          >
                            <div className="col-span-12 space-y-1.5 sm:col-span-5">
                              <Label className="text-xs" htmlFor={`commitment-title-${index}`}>
                                What
                              </Label>
                              <Input
                                id={`commitment-title-${index}`}
                                value={commitment.title}
                                placeholder="Standup"
                                onChange={(event) =>
                                  updateCommitment(index, { title: event.target.value })
                                }
                              />
                            </div>
                            <div className="col-span-4 space-y-1.5 sm:col-span-3">
                              <Label className="text-xs" htmlFor={`commitment-day-${index}`}>
                                Day
                              </Label>
                              <select
                                id={`commitment-day-${index}`}
                                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                value={commitment.weekday}
                                onChange={(event) =>
                                  updateCommitment(index, { weekday: Number(event.target.value) })
                                }
                              >
                                {WEEKDAYS.map((day) => (
                                  <option key={day.value} value={day.value}>
                                    {day.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="col-span-4 space-y-1.5">
                              <Label className="text-xs" htmlFor={`commitment-start-${index}`}>
                                From
                              </Label>
                              <Input
                                id={`commitment-start-${index}`}
                                type="time"
                                value={commitment.start}
                                onChange={(event) =>
                                  updateCommitment(index, { start: event.target.value })
                                }
                              />
                            </div>
                            <div className="col-span-3 space-y-1.5">
                              <Label className="text-xs" htmlFor={`commitment-end-${index}`}>
                                To
                              </Label>
                              <Input
                                id={`commitment-end-${index}`}
                                type="time"
                                value={commitment.end}
                                onChange={(event) =>
                                  updateCommitment(index, { end: event.target.value })
                                }
                              />
                            </div>
                            <div className="col-span-1 flex justify-end pb-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove ${commitment.title || 'commitment'}`}
                                onClick={() => removeCommitment(index)}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    You&apos;ve done the hard part. From here, {BRAND.name} quietly takes care of the rest
                    — so you can stop juggling it all in your head and get on with living your life.
                  </p>
                  <ul className="space-y-3">
                    {CREATE_SUMMARY.map(({ icon: Icon, text }) => (
                      <li key={text} className="flex items-center gap-3 text-sm">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                        </span>
                        {text}
                      </li>
                    ))}
                  </ul>
                  <div className="rounded-lg bg-muted/50 px-3.5 py-3 text-xs text-muted-foreground">
                    Starting {format(new Date(), 'EEEE d MMMM')} · {state.categories.length}{' '}
                    categor{state.categories.length === 1 ? 'y' : 'ies'} · focus window{' '}
                    {state.focusStart}–{state.focusEnd}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                disabled={step === 0 || saving}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              {step < STEP_COUNT - 1 ? (
                <Button onClick={goNext} disabled={nextDisabled || saving}>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving && <Spinner className="h-4 w-4" />}
                  Start planning my life
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
