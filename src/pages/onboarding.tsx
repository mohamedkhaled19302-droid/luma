import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, CalendarClock, Moon, Plus, Repeat, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Logo } from '@/components/common/logo'
import { Spinner, SpinnerScreen } from '@/components/common/loading'
import { EmptyState } from '@/components/common/states'
import { useAuth } from '@/hooks/use-auth'
import { useProfileMutations, useSettingsUpdate } from '@/hooks/mutations'
import { cn, formatError } from '@/lib/utils'

interface SubjectRow {
  name: string
  color: string
}

interface OnboardingState {
  full_name: string
  school_year: string
  subjects: SubjectRow[]
  wake_time: string
  bed_time: string
  preferred_study_start: string
  preferred_study_end: string
  max_session_minutes: string
  sleep_target_hours: string
}

const SUBJECT_COLORS = ['#4f46e5', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#db2777', '#7c3aed']
const SCHOOL_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'College', 'Masters', 'Other']
const STEP_TITLES = ['About you', 'Your subjects', 'Your typical week', 'Almost done']
const STEP_DESCRIPTIONS = [
  'Tell us a little about you so LUMA can plan around your real life.',
  'The subjects you\u2019re studying this term. Color-code them so your plan is easy to read at a glance.',
  'LUMA builds your day around your natural rhythm. Tweak these whenever you like.',
  'One last look before LUMA quietly holds the details.',
]
const STEP_COUNT = STEP_TITLES.length

const CREATE_SUMMARY = [
  { icon: CalendarClock, text: 'Keep every deadline in view' },
  { icon: Repeat, text: 'Build habits that actually stick' },
  { icon: Zap, text: 'Protect your energy across the day' },
  { icon: Moon, text: 'Make sure you truly rest' },
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const profileMutation = useProfileMutations(user?.id ?? '')
  const settingsMutation = useSettingsUpdate(user?.id ?? '')

  const [step, setStep] = useState(0)
  const [state, setState] = useState<OnboardingState>({
    full_name: '',
    school_year: '',
    subjects: [],
    wake_time: '07:00',
    bed_time: '23:00',
    preferred_study_start: '08:00',
    preferred_study_end: '20:00',
    max_session_minutes: '90',
    sleep_target_hours: '8',
  })
  const [saving, setSaving] = useState(false)

  if (loading) return <SpinnerScreen label="Loading your space" />
  if (!user) return <Navigate to="/auth/sign-in" replace />

  function setField<K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) {
    setState((prev) => ({ ...prev, [key]: value }))
  }

  function addSubject() {
    setState((prev) => ({
      ...prev,
      subjects: [
        ...prev.subjects,
        { name: '', color: SUBJECT_COLORS[prev.subjects.length % SUBJECT_COLORS.length] ?? '#4f46e5' },
      ],
    }))
  }

  function updateSubject(index: number, patch: Partial<SubjectRow>) {
    setState((prev) => ({
      ...prev,
      subjects: prev.subjects.map((subject, i) => (i === index ? { ...subject, ...patch } : subject)),
    }))
  }

  function removeSubject(index: number) {
    setState((prev) => ({
      ...prev,
      subjects: prev.subjects.filter((_, i) => i !== index),
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
      await profileMutation.mutateAsync({
        full_name: state.full_name.trim(),
        school_year: state.school_year || null,
      })
      await settingsMutation.mutateAsync({
        wake_time: state.wake_time,
        bed_time: state.bed_time,
        preferred_study_start: state.preferred_study_start,
        preferred_study_end: state.preferred_study_end,
        max_session_minutes: Number(state.max_session_minutes),
        sleep_target_hours: Number(state.sleep_target_hours),
        onboarded: true,
      })
      toast.success('Welcome to LUMA')
      navigate('/dashboard')
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setSaving(false)
    }
  }

  const nextDisabled = step === 0 && state.full_name.trim().length === 0

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <Card>
          <CardHeader className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Setting up your life</span>
                <span className="font-medium">
                  Step {step + 1} of {STEP_COUNT}
                </span>
              </div>
              <Progress value={((step + 1) / STEP_COUNT) * 100} />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl">{STEP_TITLES[step]}</CardTitle>
              <CardDescription>{STEP_DESCRIPTIONS[step]}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 0 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
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
                  <Label>School year</Label>
                  <Select
                    value={state.school_year || undefined}
                    onValueChange={(value) => setField('school_year', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick your year" />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHOOL_YEARS.map((year) => (
                        <SelectItem key={year} value={year}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                {state.subjects.length === 0 ? (
                  <EmptyState
                    icon={<Plus className="h-6 w-6" />}
                    title="Add the subjects you're studying this term."
                    action={
                      <Button size="sm" onClick={addSubject}>
                        <Plus className="h-4 w-4" />
                        Add a subject
                      </Button>
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    {state.subjects.map((subject, index) => (
                      <div key={index} className="flex items-start gap-3 rounded-lg border p-3">
                        <span
                          className="mt-2.5 h-4 w-4 shrink-0 rounded-full"
                          style={{ backgroundColor: subject.color }}
                        />
                        <div className="flex-1 space-y-2">
                          <Input
                            value={subject.name}
                            placeholder="e.g. Biology"
                            onChange={(event) => updateSubject(index, { name: event.target.value })}
                          />
                          <div className="flex flex-wrap items-center gap-1.5">
                            {SUBJECT_COLORS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                aria-label={`Use color ${color}`}
                                className={cn(
                                  'h-5 w-5 rounded-full transition',
                                  subject.color === color && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
                                )}
                                style={{ backgroundColor: color }}
                                onClick={() => updateSubject(index, { color })}
                              />
                            ))}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove subject"
                          onClick={() => removeSubject(index)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" onClick={addSubject}>
                      <Plus className="h-4 w-4" />
                      Add another subject
                    </Button>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wakeTime">Wake time</Label>
                  <Input
                    id="wakeTime"
                    type="time"
                    value={state.wake_time}
                    onChange={(event) => setField('wake_time', event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bedTime">Bed time</Label>
                  <Input
                    id="bedTime"
                    type="time"
                    value={state.bed_time}
                    onChange={(event) => setField('bed_time', event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studyStart">Study start</Label>
                  <Input
                    id="studyStart"
                    type="time"
                    value={state.preferred_study_start}
                    onChange={(event) => setField('preferred_study_start', event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studyEnd">Study end</Label>
                  <Input
                    id="studyEnd"
                    type="time"
                    value={state.preferred_study_end}
                    onChange={(event) => setField('preferred_study_end', event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxSession">Session length (max, minutes)</Label>
                  <Input
                    id="maxSession"
                    type="number"
                    min={15}
                    step={15}
                    value={state.max_session_minutes}
                    onChange={(event) => setField('max_session_minutes', event.target.value)}
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
                    value={state.sleep_target_hours}
                    onChange={(event) => setField('sleep_target_hours', event.target.value)}
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  You&rsquo;ve done the hard part. From here, LUMA quietly takes care of the rest
                  &mdash; so you can stop juggling it all in your head and get on with living your
                  life.
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
              </div>
            )}

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