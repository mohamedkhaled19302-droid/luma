import { BRAND } from '@/lib/brand'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  Bell,
  Download,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Sun,
  Upload,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/states'
import { signOut } from '@/auth/auth-service'
import { AssistantSettingsCard } from '@/components/assistant/assistant-settings-card'
import { supabase } from '@/database/client'
import { useTheme, type Theme } from '@/lib/theme'
import {
  downloadJson,
  exportAllData,
  importBundle,
  parseBundle,
} from '@/services/data-port-service'
import { formatError, pluralize } from '@/lib/utils'
import type { Settings } from '@/types/models'

const DEFAULT_DAY_FORM = {
  wake_time: '07:00',
  bed_time: '23:00',
  focus_start: '08:00',
  focus_end: '22:00',
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

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Could not read the backup file.'))
    reader.readAsText(file)
  })
}

function SettingsSkeleton() {
  return (
    <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

export default function SettingsPage() {
  const { user, loading } = useAuth()
  const userId = user?.id
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()

  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
    refetch: profileRefetch,
  } = useProfile(userId ?? '')
  const {
    data: settings,
    isLoading: settingsLoading,
    error: settingsError,
    refetch: settingsRefetch,
  } = useSettings(userId ?? '')
  const profileMutation = useProfileMutations(userId ?? '')
  const settingsUpdate = useSettingsUpdate(userId ?? '')

  const [profileForm, setProfileForm] = useState({ full_name: '' })
  const [dayForm, setDayForm] = useState<DayForm>(DEFAULT_DAY_FORM)
  const [notifPrefs, setNotifPrefs] = useState<Settings['notification_prefs']>(DEFAULT_NOTIF_PREFS)
  const [exporting, setExporting] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (!profile) return
    setProfileForm({
      full_name: profile.full_name ?? '',
    })
  }, [profile])

  useEffect(() => {
    if (!settings) return
    setDayForm({
      wake_time: settings.wake_time,
      bed_time: settings.bed_time,
      focus_start: settings.focus_start,
      focus_end: settings.focus_end,
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

  if (loading) {
    return <SettingsSkeleton />
  }

  if (!user) {
    return <Navigate to="/auth/sign-in" replace />
  }

  if (settingsLoading || profileLoading || !settings || !profile) {
    return <SettingsSkeleton />
  }

  if (profileError || settingsError) {
    return (
      <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
        <ErrorState
          message={formatError(profileError ?? settingsError)}
          onRetry={() => {
            void profileRefetch()
            void settingsRefetch()
          }}
        />
      </div>
    )
  }

  const saveProfile = () => {
    profileMutation.mutate(
      {
        full_name: profileForm.full_name,
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
    if (dayForm.focus_start !== settings.focus_start) {
      changes.focus_start = dayForm.focus_start
    }
    if (dayForm.focus_end !== settings.focus_end) {
      changes.focus_end = dayForm.focus_end
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

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const exportBundle = await exportAllData(supabase)
      downloadJson(exportBundle)
      toast.success('Backup downloaded.')
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async () => {
    if (!selectedFile || importing) return
    setImporting(true)
    try {
      const text = await readFileAsText(selectedFile)
      const bundle = parseBundle(text)
      const result = await importBundle(supabase, bundle)
      setImportOpen(false)
      setSelectedFile(null)
      toast.success(
        `Restored ${result.restored} ${pluralize(result.restored, 'row')} (${result.inserted} new, ${result.updated} updated).`,
      )
      if (result.errors.length > 0) {
        result.errors.forEach((message) => toast.error(message))
      }
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shape {BRAND.name} around the way you live.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-4 w-4 text-primary" aria-hidden="true" />
            Profile
          </CardTitle>
          <CardDescription>How {BRAND.name} should greet you.</CardDescription>
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
          </div>
          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={profileMutation.isPending}>
              {profileMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {settings.assistant_prefs ? (
        <AssistantSettingsCard userId={settings.user_id} prefs={settings.assistant_prefs} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your day</CardTitle>
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
                value={dayForm.focus_start}
                onChange={(event) =>
                  setDayForm({ ...dayForm, focus_start: event.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="focus-end">Focus ends</Label>
              <Input
                id="focus-end"
                type="time"
                value={dayForm.focus_end}
                onChange={(event) =>
                  setDayForm({ ...dayForm, focus_end: event.target.value })
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
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
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
          <CardTitle className="flex items-center gap-2 text-lg">
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
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="h-4 w-4 text-primary" aria-hidden="true" />
            Appearance
          </CardTitle>
          <CardDescription>Pick a theme that feels like you.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={theme}
            onValueChange={(value) => selectTheme(value as Theme)}
            aria-label="Theme"
            className="grid gap-2 sm:grid-cols-3"
          >
            {THEME_OPTIONS.map((option) => {
              const OptionIcon = option.icon
              return (
                <Label
                  key={option.value}
                  htmlFor={`theme-${option.value}`}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input bg-background/60 p-4 text-sm font-medium shadow-sm transition-colors hover:border-primary/40 hover:bg-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-70"
                >
                  <span className="flex items-center gap-2.5">
                    <OptionIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                    {option.label}
                  </span>
                  <RadioGroupItem value={option.value} id={`theme-${option.value}`} />
                </Label>
              )
            })}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden">
        <div className="gradient-brand absolute inset-x-0 top-0 h-1" aria-hidden="true" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="h-4 w-4 text-primary" aria-hidden="true" />
            Backup your data
          </CardTitle>
          <CardDescription>Download a full copy of everything {BRAND.name} keeps for you.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xs text-sm text-muted-foreground">
            A single JSON file you can restore anytime.
          </p>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export'}
          </Button>
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden">
        <div className="gradient-brand absolute inset-x-0 top-0 h-1" aria-hidden="true" />
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-4 w-4 text-primary" aria-hidden="true" />
            Restore from backup
          </CardTitle>
          <CardDescription>Bring your data back from a backup file.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xs text-sm text-muted-foreground">
            Rows you already have are updated in place, so restoring is always safe to repeat.
          </p>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Import
          </Button>
        </CardContent>
      </Card>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore from backup</DialogTitle>
            <DialogDescription>
              Choose a {BRAND.name} backup (.json) file to restore.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="backup-file">Backup file</Label>
            <Input
              id="backup-file"
              type="file"
              accept="application/json,.json"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportOpen(false)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!selectedFile || importing}>
              {importing ? 'Restoring...' : 'Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-4 w-4 text-primary" aria-hidden="true" />
            Account
          </CardTitle>
          <CardDescription>About your {BRAND.name} account.</CardDescription>
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