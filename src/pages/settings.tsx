import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  Bell,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Sun,
  User,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useProfile, useSettings } from '@/hooks/queries'
import { useProfileMutations, useSettingsUpdate } from '@/hooks/mutations'
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
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { signOut } from '@/auth/auth-service'
import { useTheme, type Theme } from '@/lib/theme'
import { cn, formatError } from '@/lib/utils'
import type { Settings } from '@/types/models'

const DEFAULT_DAY_FORM = {
  wake_time: '07:00',
  bed_time: '23:00',
  preferred_study_start: '08:00',
  preferred_study_end: '22:00',
  sleep_target_hours: '8',
  break_every_minutes: '60',
  break_minutes: '10',
  max_session_minutes: '90',
  energy_pref: false,
}

type DayForm = typeof DEFAULT_DAY_FORM

const DEFAULT_NOTIF_PREFS: Settings['notification_prefs'] = {
  deadlines: true,
  tasks: true,
  schedule_change: true,
  missed_task: true,
  habits: true,
}

type NotifPrefKey = keyof Settings['notification_prefs']

const NOTIF_ROWS: Array<{ key: NotifPrefKey; title: string; description: string }> = [
  { key: 'deadlines', title: 'Deadlines', description: 'Reminders before assignments are due.' },
  { key: 'tasks', title: 'Tasks', description: 'Updates as tasks move through your plan.' },
  { key: 'schedule_change', title: 'Schedule changes', description: 'When your day shifts unexpectedly.' },
  { key: 'missed_task', title: 'Missed tasks', description: 'Gentle nudges when something slips.' },
  { key: 'habits', title: 'Habits', description: 'Streaks and habit reminders.' },
]

const THEME_OPTIONS: Array<{ value: Theme; label: string; icon: LucideIcon }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export default function SettingsPage() {
  const { user } = useAuth()
  const userId = user?.id
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()

  const { data: profile, isLoading: profileLoading } = useProfile(userId ?? '')
  const { data: settings, isLoading: settingsLoading } = useSettings(userId ?? '')
  const profileMutation = useProfileMutations(userId ?? '')
  const settingsUpdate = useSettingsUpdate(userId ?? '')

  const [profileForm, setProfileForm] = useState({ full_name: '', school_year: '' })
  const [dayForm, setDayForm] = useState<DayForm>(DEFAULT_DAY_FORM)
  const [notifPrefs, setNotifPrefs] = useState<Settings['notification_prefs']>(DEFAULT_NOTIF_PREFS)

  useEffect(() => {
    if (!profile) return
    setProfileForm({
      full_name: profile.full_name ?? '',
      school_year: profile.school_year ?? '',
    })
  }, [profile])

  useEffect(() => {
    if (!settings) return
    setDayForm({
      wake_time: settings.wake_time,
      bed_time: settings.bed_time,
      preferred_study_start: settings.preferred_study_start,
      preferred_study_end: settings.preferred_study_end,
      sleep_target_hours: String(settings.sleep_target_hours),
      break_every_minutes: String(settings.break_every_minutes),
      break_minutes: String(settings.break_minutes),
      max_session_minutes: String(settings.max_session_minutes),
      energy_pref: settings.energy_pref,
    })
  }, [settings])

  useEffect(() => {
    if (!settings) return
    setNotifPrefs(settings.notification_prefs)
  }, [settings])

  if (!user) return <Navigate to="/auth/sign-in" replace />

  if (settingsLoading || profileLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const saveProfile = () => {
    profileMutation.mutate(
      {
        full_name: profileForm.full_name,
        school_year: profileForm.school_year.trim() !== '' ? profileForm.school_year.trim() : null,
      },
      {
        onSuccess: () => toast.success('Profile updated.'),
        onError: (error) => toast.error(formatError(error)),
      },
    )
  }

  const collectDayChanges = (): Record<string, unknown> => {
    if (!settings) return {}
    const changes: Record<string, unknown> = {}
    if (dayForm.wake_time !== settings.wake_time) changes.wake_time = dayForm.wake_time
    if (dayForm.bed_time !== settings.bed_time) changes.bed_time = dayForm.bed_time
    if (dayForm.preferred_study_start !== settings.preferred_study_start) {
      changes.preferred_study_start = dayForm.preferred_study_start
    }
    if (dayForm.preferred_study_end !== settings.preferred_study_end) {
      changes.preferred_study_end = dayForm.preferred_study_end
    }
    if (dayForm.sleep_target_hours !== String(settings.sleep_target_hours)) {
      changes.sleep_target_hours = Number(dayForm.sleep_target_hours)
    }
    if (dayForm.break_every_minutes !== String(settings.break_every_minutes)) {
      changes.break_every_minutes = Number(dayForm.break_every_minutes)
    }
    if (dayForm.break_minutes !== String(settings.break_minutes)) {
      changes.break_minutes = Number(dayForm.break_minutes)
    }
    if (dayForm.max_session_minutes !== String(settings.max_session_minutes)) {
      changes.max_session_minutes = Number(dayForm.max_session_minutes)
    }
    if (dayForm.energy_pref !== settings.energy_pref) changes.energy_pref = dayForm.energy_pref
    return changes
  }

  const saveDay = () => {
    const changes = collectDayChanges()
    if (Object.keys(changes).length === 0) {
      toast.success('No changes to save.')
      return
    }
    settingsUpdate.mutate(changes, {
      onSuccess: () => toast.success('Your day preferences saved.'),
      onError: (error) => toast.error(formatError(error)),
    })
  }

  const saveNotifPrefs = () => {
    settingsUpdate.mutate(
      { notification_prefs: notifPrefs },
      {
        onSuccess: () => toast.success('Notification preferences saved.'),
        onError: (error) => toast.error(formatError(error)),
      },
    )
  }

  const selectTheme = (value: Theme) => {
    setTheme(value)
    settingsUpdate.mutate(
      { theme: value },
      {
        onSuccess: () => toast.success('Appearance updated.'),
        onError: (error) => toast.error(formatError(error)),
      },
    )
  }

  const email = String(user.email ?? '')
  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/')
    } catch {
      toast.error('Failed to sign out. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shape LUMA around the way you live.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" aria-hidden="true" />
            Profile
          </CardTitle>
          <CardDescription>How LUMA should greet you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="full-name">Full name</Label>
              <Input
                id="full-name"
                value={profileForm.full_name}
                onChange={(event) =>
                  setProfileForm({ ...profileForm, full_name: event.target.value })
                }
                placeholder="Your name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="school-year">School year</Label>
              <Input
                id="school-year"
                value={profileForm.school_year}
                onChange={(event) =>
                  setProfileForm({ ...profileForm, school_year: event.target.value })
                }
                placeholder="e.g. Sophomore"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={profileMutation.isPending}>
              {profileMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your day</CardTitle>
          <CardDescription>The rhythm you want to protect.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wake-time">Wake time</Label>
              <Input
                id="wake-time"
                type="time"
                value={dayForm.wake_time}
                onChange={(event) => setDayForm({ ...dayForm, wake_time: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bed-time">Bed time</Label>
              <Input
                id="bed-time"
                type="time"
                value={dayForm.bed_time}
                onChange={(event) => setDayForm({ ...dayForm, bed_time: event.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="focus-start">Focus starts</Label>
              <Input
                id="focus-start"
                type="time"
                value={dayForm.preferred_study_start}
                onChange={(event) =>
                  setDayForm({ ...dayForm, preferred_study_start: event.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="focus-end">Focus ends</Label>
              <Input
                id="focus-end"
                type="time"
                value={dayForm.preferred_study_end}
                onChange={(event) =>
                  setDayForm({ ...dayForm, preferred_study_end: event.target.value })
                }
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sleep-target">Sleep target (hours)</Label>
              <Input
                id="sleep-target"
                type="number"
                min={0}
                max={14}
                value={dayForm.sleep_target_hours}
                onChange={(event) =>
                  setDayForm({ ...dayForm, sleep_target_hours: event.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="break-every">Break every (minutes)</Label>
              <Input
                id="break-every"
                type="number"
                min={10}
                value={dayForm.break_every_minutes}
                onChange={(event) =>
                  setDayForm({ ...dayForm, break_every_minutes: event.target.value })
                }
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="break-length">Break length (minutes)</Label>
              <Input
                id="break-length"
                type="number"
                min={1}
                value={dayForm.break_minutes}
                onChange={(event) => setDayForm({ ...dayForm, break_minutes: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-session">Max session (minutes)</Label>
              <Input
                id="max-session"
                type="number"
                min={10}
                value={dayForm.max_session_minutes}
                onChange={(event) =>
                  setDayForm({ ...dayForm, max_session_minutes: event.target.value })
                }
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Deep work when I&apos;m most energetic</p>
              <p className="text-xs text-muted-foreground">
                Schedule demanding tasks into your energy peaks.
              </p>
            </div>
            <Switch
              checked={dayForm.energy_pref}
              onCheckedChange={(checked) => setDayForm({ ...dayForm, energy_pref: checked })}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveDay} disabled={settingsUpdate.isPending}>
              {settingsUpdate.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
            Notifications
          </CardTitle>
          <CardDescription>Choose what deserves your attention.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-0 divide-y">
            {NOTIF_ROWS.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">{row.description}</p>
                </div>
                <Switch
                  checked={notifPrefs[row.key]}
                  onCheckedChange={(checked) =>
                    setNotifPrefs((prev) => ({ ...prev, [row.key]: checked }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={saveNotifPrefs} disabled={settingsUpdate.isPending} variant="outline">
              {settingsUpdate.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" aria-hidden="true" />
            Appearance
          </CardTitle>
          <CardDescription>Pick a theme that feels like you.</CardDescription>
        </CardHeader>
        <CardContent>
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((option) => {
              const active = theme === option.value
              const OptionIcon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => selectTheme(option.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border p-4 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  <OptionIcon className="h-4 w-4" aria-hidden="true" />
                  {option.label}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" aria-hidden="true" />
            Account
          </CardTitle>
          <CardDescription>About your LUMA account.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{email || 'Signed in'}</p>
            <p className="text-xs text-muted-foreground">Your account email</p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}