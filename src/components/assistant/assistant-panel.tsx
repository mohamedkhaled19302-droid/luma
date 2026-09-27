/**
 * The assistant surface, shared by the floating launcher and the /assistant page.
 *
 * Design rules this component enforces:
 *  - nothing is ever written without a deliberate tap. Proposals render as
 *    cards with Accept / Change / Skip, and destructive ones additionally demand
 *    an explicit confirmation that names the consequence;
 *  - the "thinking" state is always cancellable, and Stop is never hidden;
 *  - when the screen is being read, the panel says so in plain words instead of
 *    leaving a browser-only indicator to explain the state;
 *  - if the person has not opted in, the panel explains what it would send
 *    before offering to turn it on.
 */

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  Eraser,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  Pencil,
  Send,
  Sparkles,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'
import type { AiProposal } from '@/lib/ai/types'
import { useAssistant, type AssistantTurn } from './use-assistant'

const SCREEN_COPY: Record<string, string> = {
  capturing: 'Waiting for you to pick a screen…',
  reading: 'Reading that one screenshot…',
  error: 'Screen capture failed. Nothing was shared.',
}

export interface AssistantPanelProps {
  userId: string
  /** 'full' for the /assistant page, 'floating' for the docked panel. */
  variant?: 'full' | 'floating'
  onClose?: () => void
}

export function AssistantPanel({ userId, variant = 'full', onClose }: AssistantPanelProps) {
  const a = useAssistant(userId)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const floating = variant === 'floating'

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [a.turns, a.partial, a.phase])

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void a.ask(text)
  }

  const submitScreen = () => {
    const text = draft.trim() || 'What am I looking at, and what should I do next?'
    setDraft('')
    void a.askAboutScreen(text)
  }

  const empty = a.turns.length === 0

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col border-border/60 bg-background/95 backdrop-blur-xl',
        floating ? 'h-[min(70vh,34rem)] w-full rounded-2xl border shadow-2xl' : 'h-full w-full',
      )}
    >
      {/* ------------------------------ header ------------------------------ */}
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <Sparkles className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{BRAND.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {a.enabled
              ? a.busy
                ? 'Thinking…'
                : a.phase === 'listening'
                  ? a.partial || 'Listening…'
                  : 'Free models only · nothing happens without your say-so'
              : 'Off'}
          </p>
        </div>

        {a.enabled && a.models && a.models.models.length > 0 ? (
          <Select
            value={a.prefs?.model ?? a.models.defaultModel ?? ''}
            onValueChange={(value) => {
              const next = value === '__auto' ? null : value
              void a.savePrefs({ model: next })
            }}
          >
            <SelectTrigger className="h-8 w-auto max-w-[9.5rem] text-xs" aria-label="Assistant model">
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto">Auto (best free)</SelectItem>
              {a.models.models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {onClose ? (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close assistant">
            <X />
          </Button>
        ) : null}
      </header>

      {/* ------------------------------ body -------------------------------- */}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!a.enabled ? (
          <OptIn onEnable={() => void a.savePrefs({ enabled: true })} />
        ) : empty ? (
          <Welcome firstName={a.firstName} onPick={(text) => void a.ask(text)} />
        ) : null}

        {a.turns.map((turn) => (
          <TurnBlock
            key={turn.id}
            turn={turn}
            onApply={(proposal) => void a.apply(turn.id, proposal)}
            onEdit={(proposal) => a.edit(turn.id, proposal)}
            onCancel={(proposal) => a.cancel(turn.id, proposal.id)}
            onConfirm={() => void a.confirmDestructive(turn.id)}
            onDismiss={() => a.dismissConfirmation(turn.id)}
          />
        ))}

        {a.phase === 'listening' && a.partial ? (
          <p className="text-sm italic text-muted-foreground">{a.partial}</p>
        ) : null}
        {a.busy ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Working on it…
          </p>
        ) : null}
      </div>

      {/* --------------------------- screen state --------------------------- */}
      {a.screenState !== 'off' ? (
        <div className="shrink-0 border-t border-warning/30 bg-warning/10 px-4 py-2 text-xs text-foreground">
          <span className="inline-flex items-center gap-2">
            {a.screenState === 'error' ? <TriangleAlert className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />}
            {SCREEN_COPY[a.screenState]}
          </span>
        </div>
      ) : null}

      {/* ----------------------------- composer ----------------------------- */}
      {a.enabled ? (
        <div className="shrink-0 space-y-2 border-t px-4 py-3">
          {a.pendingEdit ? (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
              <Pencil className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <p className="flex-1">{a.pendingEdit}</p>
              <button
                type="button"
                onClick={() => a.setPendingEdit(null)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Discard change"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}

          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            rows={2}
            placeholder={
              a.pendingEdit
                ? 'Describe the change…'
                : `Ask ${BRAND.name} to plan, summarise, or reorganise…`
            }
            className="resize-none text-sm"
            disabled={a.busy}
          />

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={a.phase === 'listening' ? a.stopListening : a.startListening}
              disabled={a.busy}
              aria-label={a.phase === 'listening' ? 'Stop listening' : 'Talk to the assistant'}
              title={a.phase === 'listening' ? 'Stop listening' : 'Talk'}
            >
              {a.phase === 'listening' ? <MicOff /> : <Mic />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={submitScreen}
              disabled={a.busy || !a.screenSupported || a.screenState !== 'off'}
              aria-label="Ask about this screen"
              title={
                a.screenSupported
                  ? 'Share one screenshot and ask about it'
                  : 'This browser cannot capture the screen'
              }
            >
              <MonitorUp />
            </Button>

            <div className="flex-1" />

            {a.busy || a.phase === 'listening' ? (
              <Button variant="outline" size="sm" onClick={a.stop}>
                <Square /> Stop
              </Button>
            ) : (
              <Button size="sm" onClick={submit} disabled={!draft.trim()}>
                <Send /> Send
              </Button>
            )}
          </div>

          {/* Privacy switches, kept visible so nothing is on by surprise. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5 text-xs text-muted-foreground">
            <label className="inline-flex items-center gap-1.5">
              <Switch
                checked={a.wakeArmed}
                onCheckedChange={a.toggleWakeWord}
                disabled={!a.voiceSupported}
                aria-label="Wake word"
              />
              <Mic className="size-3" />
              {a.wakeArmed ? 'Listening for wake word' : 'Wake word off'}
            </label>
            <label className="inline-flex items-center gap-1.5">
              <Switch
                checked={a.prefs?.speak_replies ?? true}
                onCheckedChange={(value) => void a.savePrefs({ speak_replies: value })}
                aria-label="Speak replies"
              />
              Speak replies
            </label>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-2 text-xs"
              onClick={a.clear}
              disabled={a.turns.length === 0}
            >
              <Eraser className="size-3" /> Clear
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function OptIn({ onEnable }: { onEnable: () => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-dashed p-4 text-sm">
      <p className="font-medium">The assistant is turned off</p>
      <p className="text-muted-foreground">
        Turning it on lets {BRAND.name} read your tasks, habits, goals and today&rsquo;s schedule so it can
        help you plan. It only ever <em>suggests</em> changes, and nothing is saved until you tap accept.
        Conversations are not kept unless you ask for that.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onEnable}>
          Turn on the assistant
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link to="/settings">Privacy settings</Link>
        </Button>
      </div>
    </div>
  )
}

function Welcome({ firstName, onPick }: { firstName: string; onPick: (text: string) => void }) {
  const starters = [
    'How does today look?',
    'What should I drop if I am running late?',
    'Plan my evening around a 90 minute focus block.',
  ]
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Hi {firstName}. I can see your tasks, habits, goals and today&rsquo;s schedule, and I can suggest
        changes — you stay in control of every one of them.
      </p>
      <div className="flex flex-wrap gap-2">
        {starters.map((text) => (
          <Button key={text} size="sm" variant="outline" onClick={() => onPick(text)}>
            {text}
          </Button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

interface TurnBlockProps {
  turn: AssistantTurn
  onApply: (proposal: AiProposal) => void
  onEdit: (proposal: AiProposal) => void
  onCancel: (proposal: AiProposal) => void
  onConfirm: () => void
  onDismiss: () => void
}

function TurnBlock({ turn, onApply, onEdit, onCancel, onConfirm, onDismiss }: TurnBlockProps) {
  const isUser = turn.role === 'user'
  const resolved = new Set(turn.resolved ?? [])

  return (
    <div className={cn('flex flex-col gap-2', isUser && 'items-end')}>
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : turn.fromScreen
              ? 'border border-warning/30 bg-warning/5'
              : 'bg-muted',
        )}
      >
        {turn.fromScreen && !isUser ? (
          <Badge variant="secondary" className="mb-1.5 text-[10px]">
            <MonitorUp className="size-3" /> From your screen
          </Badge>
        ) : null}
        {turn.text}
      </div>

      {turn.notice ? (
        <p className="text-xs text-muted-foreground">{turn.notice}</p>
      ) : null}

      {turn.cancelledConfirmation ? (
        <p className="text-xs text-muted-foreground">Cancelled — nothing was changed.</p>
      ) : null}

      {turn.confirmation ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <TriangleAlert className="size-4" />
            {turn.confirmation.title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{turn.confirmation.detail}</p>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" variant="destructive" onClick={onConfirm}>
              <Check /> Yes, do it
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}

      {turn.proposals && turn.proposals.length > 0 ? (
        <div className="space-y-2">
          {turn.proposals.map((proposal) => {
            const done = resolved.has(proposal.id)
            return (
              <div
                key={proposal.id}
                className={cn(
                  'rounded-xl border bg-card p-3 text-sm transition-opacity',
                  proposal.destructive ? 'border-destructive/40' : 'border-border',
                  done && 'opacity-55',
                )}
              >
                <p className="font-medium">
                  {proposal.title}
                  {proposal.destructive ? (
                    <Badge variant="destructive" className="ml-2 text-[10px]">
                      Deletes data
                    </Badge>
                  ) : null}
                </p>
                {proposal.summary ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{proposal.summary}</p>
                ) : null}
                {done ? (
                  <p className="mt-2 text-xs text-muted-foreground">Handled.</p>
                ) : (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => onApply(proposal)}>
                      <Check /> Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onEdit(proposal)}>
                      <Pencil /> Change
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onCancel(proposal)}>
                      Skip
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
