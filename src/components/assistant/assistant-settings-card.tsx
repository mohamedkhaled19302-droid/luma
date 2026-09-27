/**
 * Assistant, voice and privacy settings.
 *
 * Kept as its own card so the page stays readable and so every control here maps
 * to exactly one `assistant_prefs` field. Each change is written immediately
 * through `updateAssistantPrefs`, which reads-merge-writes the JSON column: the
 * settings row is upserted as a whole by the offline queue, so writing a partial
 * object straight through it would silently drop the other preferences.
 *
 * Defaults are deliberately private. The assistant is off, the microphone is not
 * held open, screens are never watched, and nothing is recorded.
 */

import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Bot,
  Brain,
  Mic,
  MonitorUp,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { fetchAiModels } from '@/lib/ai/client'
import { updateAssistantPrefs } from '@/services/settings-service'
import { formatError } from '@/lib/utils'
import { BRAND } from '@/lib/brand'
import type { AssistantPrefs, PlanningDetail, PlanningStyleId } from '@/types/models'

const STYLES: Array<{ id: PlanningStyleId; label: string; hint: string }> = [
  { id: 'structured', label: 'Structured', hint: 'Timed blocks, firm sequencing' },
  { id: 'balanced', label: 'Balanced', hint: 'A plan with breathing room' },
  { id: 'flexible', label: 'Flexible', hint: 'Priorities over timetables' },
  { id: 'goal-focused', label: 'Goal focused', hint: 'Work backwards from outcomes' },
  { id: 'minimal', label: 'Minimal', hint: 'Only the essentials' },
]

const DETAILS: Array<{ id: PlanningDetail; label: string }> = [
  { id: 'simple', label: 'Simple — short, plain answers' },
  { id: 'normal', label: 'Normal — a short paragraph' },
  { id: 'detailed', label: 'Detailed — with reasoning' },
]

export function AssistantSettingsCard({
  userId,
  prefs,
}: {
  userId: string
  prefs: AssistantPrefs
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<AssistantPrefs>(prefs)
  const [saving, setSaving] = useState(false)
  const [models, setModels] = useState<{ id: string; name: string }[] | null>(null)
  const [modelsBusy, setModelsBusy] = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(prefs)

  const patch = (value: Partial<AssistantPrefs>) => setDraft((current) => ({ ...current, ...value }))

  const save = async () => {
    setSaving(true)
    try {
      await updateAssistantPrefs(userId, draft)
      await queryClient.invalidateQueries({ queryKey: ['settings', userId] })
      toast.success('Assistant settings saved.')
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setSaving(false)
    }
  }

  const loadModels = async () => {
    setModelsBusy(true)
    try {
      const response = await fetchAiModels()
      setModels(response.models.map((m) => ({ id: m.id, name: m.name })))
      if (response.models.length === 0) {
        toast.error(response.message ?? 'No free models are available right now.')
      }
    } catch (error) {
      toast.error(formatError(error))
    } finally {
      setModelsBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
          Assistant
        </CardTitle>
        <CardDescription>
          {BRAND.name} runs on free models only, and it can only ever suggest changes — you approve every
          one.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ---------------- master switch ---------------- */}
        <Toggle
          icon={<Bot className="h-4 w-4" aria-hidden="true" />}
          label="Enable the assistant"
          hint="Off by default. When off, nothing is sent to the model."
          checked={draft.enabled}
          onChange={(value) => patch({ enabled: value })}
        />

        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <Label htmlFor="assistant-model">Model</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={draft.model ?? '__auto'}
              onValueChange={(value) => patch({ model: value === '__auto' ? null : value })}
            >
              <SelectTrigger id="assistant-model" className="h-9 min-w-[14rem]">
                <SelectValue placeholder="Automatic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto">Automatic (best available free model)</SelectItem>
                {models?.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadModels} disabled={modelsBusy}>
              {modelsBusy ? 'Checking…' : 'Refresh free models'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Morrow never falls back to a paid model. If the selected one is busy or unavailable, the
            request fails rather than spending your money.
          </p>
        </div>

        {/* ---------------- voice ---------------- */}
        <div className="space-y-4">
          <Toggle
            icon={<Mic className="h-4 w-4" aria-hidden="true" />}
            label="Speak replies aloud"
            hint="Uses your browser's own voice."
            checked={draft.speak_replies}
            onChange={(value) => patch({ speak_replies: value })}
          />
          <Toggle
            icon={<Mic className="h-4 w-4" aria-hidden="true" />}
            label="Allow “Hey Morrow” wake word"
            hint="Only match the phrase in your browser. Morrow is not told it heard anything while idle."
            checked={draft.wake_word}
            onChange={(value) => patch({ wake_word: value })}
          />
          <div className="space-y-1.5">
            <Label htmlFor="wake-phrase">Wake phrase</Label>
            <Input
              id="wake-phrase"
              value={draft.wake_phrase}
              maxLength={40}
              onChange={(event) => patch({ wake_phrase: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Use a two- or three-word phrase, e.g. “Hey Morrow”.
            </p>
          </div>
        </div>

        {/* ---------------- screen ---------------- */}
        <Toggle
          icon={<MonitorUp className="h-4 w-4" aria-hidden="true" />}
          label="Allow asking about your screen"
          hint="Off by default. When on, Morrow can still only take a single screenshot, and only after you press the button."
          checked={draft.screen_awareness}
          onChange={(value) => patch({ screen_awareness: value })}
        />

        {/* ---------------- behaviour ---------------- */}
        <div className="space-y-4">
          <Toggle
            icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            label="Let the assistant propose changes to your data"
            hint="With this off it can only read and talk. Deletions always ask again, either way."
            checked={draft.tools_enabled}
            onChange={(value) => patch({ tools_enabled: value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="planning-style">Planning style</Label>
              <Select
                value={draft.planning_style}
                onValueChange={(value) => patch({ planning_style: value as PlanningStyleId })}
              >
                <SelectTrigger id="planning-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLES.map((style) => (
                    <SelectItem key={style.id} value={style.id}>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {STYLES.find((s) => s.id === draft.planning_style)?.hint}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="planning-detail">Detail</Label>
              <Select
                value={draft.planning_detail}
                onValueChange={(value) => patch({ planning_detail: value as PlanningDetail })}
              >
                <SelectTrigger id="planning-detail">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DETAILS.map((detail) => (
                    <SelectItem key={detail.id} value={detail.id}>
                      {detail.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* ---------------- retention ---------------- */}
        <div className="space-y-4">
          <Toggle
            icon={<Brain className="h-4 w-4" aria-hidden="true" />}
            label="Keep conversation history"
            hint="Off by default: a conversation lives only in this tab and is gone when you close it."
            checked={draft.keep_conversations}
            onChange={(value) => patch({ keep_conversations: value })}
          />
          {draft.keep_conversations ? (
            <div className="space-y-1.5">
              <Label htmlFor="conversation-days">Keep for</Label>
              <Select
                value={String(draft.conversation_days)}
                onValueChange={(value) => patch({ conversation_days: Number(value) })}
              >
                <SelectTrigger id="conversation-days" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[7, 30, 90, 365].map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {days} days
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          <p className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            History is stored per account and never used to train anything.
          </p>
          <Button onClick={save} disabled={!dirty || saving}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Saving…' : 'Save assistant settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Toggle({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: ReactNode
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const id = `toggle-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="flex items-center gap-2">
          {icon}
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
