import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { toast } from 'sonner'
import {
  Activity,
  BatteryCharging,
  Bluetooth,
  HeartPulse,
  Loader2,
  Pause,
  Play,
  Sparkles,
  Unplug,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useProfile, useSettings } from '@/hooks/queries'
import { useHealthWatch } from '@/hooks/use-health-watch'
import { listConnections, listSamples } from '@/services/health-service'
import { buildOverview, describeOverview, heartRateZone, heartRateZoneLabel } from '@/lib/health-metrics'
import { SUPPORTED_SERVICES } from '@/lib/health-bluetooth'
import { sendHealthGuidance } from '@/lib/ai/client'
import type { AiChatResponse } from '@/lib/ai/types'
import type { HealthSample } from '@/types/models'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * Wearable data and the guidance drawn from it.
 *
 * Two rules shape this page. First, honesty about what is not happening: if the
 * browser cannot read Bluetooth, or no strap is connected, it says so plainly
 * rather than showing an empty chart that looks like bad news. Second, the
 * numbers go to the model as aggregates over a chosen window, never as a stream
 * of raw readings.
 */

const WINDOW_DAYS = 7
const ZONE_COLOURS: Record<string, string> = {
  Rest: 'bg-sky-400',
  Light: 'bg-emerald-400',
  Moderate: 'bg-amber-400',
  Vigorous: 'bg-orange-500',
  Peak: 'bg-rose-500',
}

export default function HealthPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const { data: settings } = useSettings(userId)
  const { data: profile } = useProfile(userId)

  const [question, setQuestion] = useState('')
  const [guidance, setGuidance] = useState<AiChatResponse | null>(null)
  const [asking, setAsking] = useState(false)

  const from = useMemo(() => subDays(new Date(), WINDOW_DAYS).toISOString(), [])

  const samplesQuery = useQuery({
    queryKey: ['health-samples', userId, WINDOW_DAYS],
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: async () => listSamples(userId, { from, limit: 5000 }),
  })

  const connectionsQuery = useQuery({
    queryKey: ['health-connections', userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => listConnections(userId),
  })

  const samples: HealthSample[] = useMemo(() => samplesQuery.data ?? [], [samplesQuery.data])
  const hasDevice = (connectionsQuery.data ?? []).some((c) => c.status === 'connected')

  const { status, unavailable, connect, disconnect, startRecording, stopRecording, logManual } =
    useHealthWatch({ userId })

  const overview = useMemo(
    () => buildOverview(samples, { windowDays: WINDOW_DAYS, hasDevice }),
    [samples, hasDevice],
  )

  const liveZone = status.bpm != null ? heartRateZone(status.bpm, overview.restingHeartRate.average) : null

  const askGuide = useCallback(async () => {
    if (!userId || overview.totalSamples === 0) return
    setAsking(true)
    try {
      const response = await sendHealthGuidance({
        summary: {
          windowDays: overview.windowDays,
          heartRate: {
            average: overview.heartRate.average,
            min: overview.heartRate.min,
            max: overview.heartRate.max,
            count: overview.heartRate.count,
          },
          restingHeartRate: { average: overview.restingHeartRate.average },
          steps: { total: overview.steps.total },
          sleepMinutes: { total: overview.sleep.total },
          activeMinutes: { total: overview.activeMinutes.total },
          zones: overview.zones.map((z) => ({ label: z.label, minutes: z.minutes, share: z.share })),
          sampleCount: overview.totalSamples,
        },
        question: question.trim() || undefined,
        context: {
          displayName: profile?.full_name || undefined,
          planningStyle: settings?.assistant_prefs?.planning_style ?? 'balanced',
          planningDetail: settings?.assistant_prefs?.planning_detail ?? 'normal',
          dayLabel: format(new Date(), 'EEEE, d MMMM'),
          nowLocal: format(new Date(), 'HH:mm'),
          awakeStart: settings?.wake_time,
          awakeEnd: settings?.bed_time,
        },
        toolsEnabled: false,
      })
      setGuidance(response)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reach the health guide.')
    } finally {
      setAsking(false)
    }
  }, [overview, profile?.full_name, question, settings, userId])

  const loading = samplesQuery.isPending && userId.length > 0

  return (
    <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
      <header className="text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Readings from your own strap, on your own account. Guidance is general information, not
          medical advice.
        </p>
      </header>

      {/* ---- Connection ------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bluetooth className="h-4 w-4" aria-hidden="true" />
              Strap connection
            </CardTitle>
            <ConnectionBadge state={status.state} />
          </div>
          <CardDescription>
            {status.deviceName ??
              unavailable?.message ??
              'Pair and wear your strap first, then connect.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {unavailable ? (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
              <p className="font-medium">Bluetooth isn&apos;t available in this browser</p>
              <p className="mt-1 text-muted-foreground">{unavailable.message}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                You can still log readings by hand below.
              </p>
            </div>
          ) : null}

          {status.state === 'connected' ? (
            <>
              <div className="flex items-center justify-center gap-6 rounded-xl border bg-brand-soft p-6">
                <div className="text-center">
                  <p className="font-display text-5xl font-bold tabular-nums text-primary">
                    {status.bpm ?? '--'}
                  </p>
                  <p className="text-xs text-muted-foreground">bpm</p>
                </div>
                <div className="space-y-1 text-sm">
                  {liveZone && (
                    <Badge variant="secondary">{heartRateZoneLabel(liveZone)}</Badge>
                  )}
                  {status.watts != null && (
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <BatteryCharging className="h-3.5 w-3.5" aria-hidden="true" />
                      {status.watts} W
                    </p>
                  )}
                  {status.pending > 0 && (
                    <p className="text-xs text-muted-foreground">{status.pending} queued</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {status.recording ? (
                  <Button onClick={() => void stopRecording()} variant="outline">
                    <Pause className="h-4 w-4" aria-hidden="true" />
                    Stop recording
                  </Button>
                ) : (
                  <Button onClick={startRecording} disabled={status.bpm == null}>
                    <Play className="h-4 w-4" aria-hidden="true" />
                    Record session
                  </Button>
                )}
                <Button onClick={() => void disconnect()} variant="ghost">
                  <Unplug className="h-4 w-4" aria-hidden="true" />
                  Disconnect
                </Button>
              </div>

              {status.lastFlushError && (
                <p className="text-xs text-destructive">{status.lastFlushError}</p>
              )}
            </>
          ) : (
            <Button
              onClick={() => void connect()}
              disabled={Boolean(unavailable) || status.state === 'connecting'}
            >
              {status.state === 'connecting' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Bluetooth className="h-4 w-4" aria-hidden="true" />
              )}
              {status.state === 'connecting' ? 'Connecting…' : 'Connect strap'}
            </Button>
          )}

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">
              What this reads ({SUPPORTED_SERVICES.map((s) => s.name).join(', ')})
            </summary>
            <p className="mt-2 leading-relaxed">
              A chest strap speaking the standard Bluetooth Heart Rate service. Nothing leaves your
              machine except the totals shown below, and only when you ask the guide a question.
            </p>
          </details>
        </CardContent>
      </Card>

      {/* ---- Manual entry ----------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Log a reading by hand</CardTitle>
          <CardDescription>No strap, or you just want to add today&apos;s resting rate.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void logManual('resting_heart_rate', Number(prompt('Resting heart rate (bpm)', '58')))
            }
          >
            Resting HR
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void logManual('steps', Number(prompt('Steps today', '8000')))}
          >
            Steps
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void logManual('sleep_minutes', Number(prompt('Sleep (minutes)', '450')))}
          >
            Sleep
          </Button>
        </CardContent>
      </Card>

      {/* ---- Trends ------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Last {WINDOW_DAYS} days</CardTitle>
          <CardDescription>
            {overview.totalSamples > 0
              ? `${overview.totalSamples} ${overview.totalSamples === 1 ? 'reading' : 'readings'}`
              : 'Nothing recorded in this window yet.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading readings…</p>
          ) : samplesQuery.isError ? (
            <ErrorState message="We couldn't load your readings." onRetry={() => void samplesQuery.refetch()} />
          ) : overview.totalSamples === 0 ? (
            <EmptyState
              icon={<HeartPulse className="h-6 w-6" />}
              title="No readings yet"
              description="Connect a strap or log one reading by hand and your trends will appear here."
            />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Avg HR" value={fmt(overview.heartRate.average, 'bpm')} />
                <Stat label="Resting" value={fmt(overview.restingHeartRate.average, 'bpm')} />
                <Stat label="Steps" value={overview.steps.total != null ? overview.steps.total.toLocaleString() : '—'} />
                <Stat label="Sleep" value={fmt(overview.sleep.total != null ? overview.sleep.total / 60 : null, 'h', 1)} />
              </div>

              {overview.zones.some((zone) => zone.minutes > 0) && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Time in zones</p>
                  <div className="flex h-3 w-full overflow-hidden rounded-full border">
                    {overview.zones
                      .filter((zone) => zone.minutes > 0)
                      .map((zone) => (
                        <div
                          key={zone.zone}
                          className={cn(ZONE_COLOURS[zone.label] ?? 'bg-muted')}
                          style={{ width: `${zone.share}%` }}
                          title={`${zone.label}: ${zone.minutes} min`}
                        />
                      ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {overview.zones
                      .filter((zone) => zone.minutes > 0)
                      .map((zone) => (
                        <span key={zone.zone} className="flex items-center gap-1.5">
                          <span
                            className={cn('h-2 w-2 rounded-full', ZONE_COLOURS[zone.label] ?? 'bg-muted')}
                          />
                          {zone.label} {zone.minutes} min
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- AI guidance -------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Ask about these numbers
          </CardTitle>
          <CardDescription>
            Sends only the totals above, never the raw readings. It won't diagnose anything or
            advise on medication.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Is my training load sensible, and what should I change?"
            rows={3}
          />
          <Button onClick={() => void askGuide()} disabled={asking || overview.totalSamples === 0}>
            {asking ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Activity className="h-4 w-4" aria-hidden="true" />
            )}
            {asking ? 'Thinking…' : 'Get guidance'}
          </Button>

          {overview.totalSamples === 0 && (
            <p className="text-xs text-muted-foreground">Record something first.</p>
          )}

          {guidance && (
            <div className="space-y-2 rounded-lg border bg-brand-soft p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{guidance.reply}</p>
              <p className="text-xs text-muted-foreground">
                {guidance.free ? 'Free model' : 'Model'} · {guidance.model}
              </p>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">What was sent to the model</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words font-mono">
                  {describeOverview(overview)}
                </pre>
              </details>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ConnectionBadge({ state }: { state: string }) {
  if (state === 'connected') {
    return (
      <Badge className="gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Live
      </Badge>
    )
  }
  if (state === 'connecting') return <Badge variant="secondary">Connecting</Badge>
  if (state === 'error') return <Badge variant="destructive">Error</Badge>
  if (state === 'unsupported') return <Badge variant="outline">Unavailable</Badge>
  if (state === 'disconnected') return <Badge variant="outline">Out of range</Badge>
  return <Badge variant="outline">Not connected</Badge>
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function fmt(value: number | null, unit: string, places = 0): string {
  if (value == null) return '—'
  return `${value.toFixed(places)}${places > 0 ? unit : ` ${unit}`}`
}

/** Minimal prompt helper so manual entry needs no extra form state. */
function prompt(label: string, fallback: string): string {
  const value = globalThis.prompt?.(label, fallback)
  return value && Number.isFinite(Number(value)) ? value : fallback
}
