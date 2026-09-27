import { BRAND } from '@/lib/brand'
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  ArrowRight,
  CalendarPlus,
  Clock,
  ListChecks,
  Globe2,
  Search,
  Share2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useQueryClient } from '@tanstack/react-query'
import { createTasksBulk, type TaskInsert } from '@/services/task-service'
import {
  filterTemplates,
  instantiateTemplate,
  totalTemplateMinutes,
  PLANNING_TEMPLATES,
  TEMPLATE_CATEGORIES,
  type PlanningTemplate,
  type TemplateCategory,
} from '@/lib/planning-templates'
import { useProfile } from '@/hooks/queries'
import { useTemplateMutations } from '@/hooks/mutations'
import type { TemplateRow } from '@/services/template-service'
import { Badge } from '@/components/ui/badge'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/common/states'
import { CommunityGallery } from '@/components/templates/community-gallery'
import { MyTemplatesSection } from '@/components/templates/my-templates-section'
import {
  ShareTemplateDialog,
  type ShareTemplateInitial,
} from '@/components/templates/share-template-dialog'
import { formatTotalTime, rowToPlanningTemplate } from '@/components/templates/template-utils'
import { cn, formatError } from '@/lib/utils'
import { announce } from '@/lib/a11y'
import { playSound } from '@/lib/sound'
import type { Priority } from '@/types/models'

const priorityTokens: Record<Priority, string> = {
  critical: 'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-300',
  high: 'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-300',
  medium: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300',
  low: 'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300',
}

type TemplateTab = 'library' | 'community' | 'mine'

export default function TemplatesPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const isOnline = useOnlineStatus()
  const queryClient = useQueryClient()
  const { data: profile } = useProfile(userId)
  const authorName = profile?.full_name?.trim() || 'Someone'
  const templateMutations = useTemplateMutations(userId)

  const [activeTab, setActiveTab] = useState<TemplateTab>('library')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<TemplateCategory | 'all'>('all')
  const [selected, setSelected] = useState<PlanningTemplate | null>(null)
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [importing, setImporting] = useState(false)
  const [share, setShare] = useState<{ initial: ShareTemplateInitial } | null>(null)

  const filtered = useMemo(
    () => filterTemplates(PLANNING_TEMPLATES, query, category),
    [query, category],
  )

  const previewTasks = useMemo(
    () => (selected ? instantiateTemplate(selected, startDate) : []),
    [selected, startDate],
  )

  const applyTemplate = async () => {
    if (!user || !selected) return
    setImporting(true)
    try {
      const rows: TaskInsert[] = previewTasks.map((task) => ({
        title: task.title,
        description: task.description ?? `From template: ${selected.name}`,
        priority: task.priority,
        difficulty: task.difficulty,
        estimated_minutes: task.estimatedMinutes,
        remaining_minutes: task.estimatedMinutes,
        deadline: new Date(task.deadline).toISOString(),
        can_split: task.estimatedMinutes > 60,
        category_id: null,
        locked: false,
      }))
      await createTasksBulk(user.id, rows)
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      void queryClient.invalidateQueries({ queryKey: ['pressure'] })
      playSound('celebrate')
      announce(`Added ${rows.length} tasks from ${selected.name}.`)
      toast.success(`Added ${rows.length} tasks from “${selected.name}”`, {
        description: 'Open the planner to slot them into your week.',
      })
      setSelected(null)
    } catch {
      toast.error('Could not apply the template. Check your connection and try again.')
    } finally {
      setImporting(false)
    }
  }

  const openTemplate = (template: PlanningTemplate) => {
    playSound('whoosh')
    setSelected(template)
  }

  const shareFromLibrary = (template: PlanningTemplate) => {
    playSound('click')
    setShare({
      initial: {
        name: template.name,
        emoji: template.emoji,
        description: template.description,
        category: template.category,
        tasks: template.tasks,
        isPublic: false,
      },
    })
  }

  const shareNew = () => {
    playSound('click')
    setShare({
      initial: {
        name: '',
        emoji: '',
        description: '',
        category: 'focus',
        tasks: [],
        isPublic: false,
      },
    })
  }

  const shareEdit = (template: TemplateRow) => {
    playSound('click')
    setShare({
      initial: {
        id: template.id,
        name: template.name,
        emoji: template.emoji,
        description: template.description ?? '',
        category: template.category,
        tasks: template.tasks,
        isPublic: template.is_public,
      },
    })
  }

  const applyCommunity = (template: TemplateRow) => {
    openTemplate(rowToPlanningTemplate(template))
  }

  const copyCommunity = (template: TemplateRow) => {
    if (!user) return
    templateMutations.create.mutate(
      {
        fields: {
          name: template.name,
          emoji: template.emoji,
          description: template.description,
          category: template.category,
          tasks: template.tasks,
          author_name: authorName,
          is_public: false,
        },
      },
      {
        onError: (error) => toast.error(formatError(error)),
      },
    )
  }

  const previewTotal = previewTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0)

  return (
    <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
      <header>
        <p className="eyebrow">Template gallery</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Templates
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ready-made plans for big deadlines, projects and fresh starts — plus a gallery of
          plans other people shared. Every template applies through the same non-overlapping
          scheduler.
        </p>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as TemplateTab)
          playSound('click')
        }}
      >
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="library" className="flex-1 sm:flex-none">
            Library
          </TabsTrigger>
          <TabsTrigger value="community" className="flex-1 sm:flex-none">
            Community
          </TabsTrigger>
          <TabsTrigger value="mine" className="flex-1 sm:flex-none">
            My templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates…"
                className="pl-9"
                aria-label="Search templates"
              />
            </div>
            <div className="scrollbar-hide flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Template categories">
              {[{ id: 'all' as const, label: 'All' }, ...TEMPLATE_CATEGORIES].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={category === cat.id}
                  onClick={() => {
                    setCategory(cat.id)
                    playSound('click')
                  }}
                  className={cn(
                    'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    category === cat.id
                      ? 'gradient-brand border-transparent text-primary-foreground shadow-glow'
                      : 'border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" aria-hidden="true" />}
              title={`No templates match “${query}”`}
              description="Try a different search or browse another category."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((template) => (
                <Card key={template.id} className="card-lift group flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border bg-brand-soft text-2xl shadow-sm transition-transform duration-300 group-hover:scale-105">
                        <span aria-hidden="true">{template.emoji}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="shrink-0 capitalize">
                          {TEMPLATE_CATEGORIES.find((c) => c.id === template.category)?.label}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label={`Share ${template.name}`}
                          onClick={() => shareFromLibrary(template)}
                        >
                          <Share2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    <CardDescription>{template.tagline}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto space-y-3">
                    <p className="line-clamp-2 text-sm text-muted-foreground">{template.description}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                        {template.tasks.length} tasks
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        ≈ {formatTotalTime(totalTemplateMinutes(template))}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                        {template.spanDays}d span
                      </span>
                    </div>
                    <Button className="w-full" onClick={() => openTemplate(template)}>
                      Use template <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="community">
          <CommunityGallery userId={userId} onApply={applyCommunity} onCopy={copyCommunity} />
        </TabsContent>

        <TabsContent value="mine">
          <MyTemplatesSection
            userId={userId}
            authorName={authorName}
            onNew={shareNew}
            onEdit={shareEdit}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span aria-hidden="true">{selected.emoji}</span>
                  {selected.name}
                </DialogTitle>
                <DialogDescription>{selected.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <section className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full gradient-brand text-[10px] font-bold text-white">
                      1
                    </span>
                    <Label htmlFor="tpl-start">Start date</Label>
                  </div>
                  <Input
                    id="tpl-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Deadlines land at 5:00 PM on their scheduled day — tweak them later.
                  </p>
                </section>

                <section className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full gradient-brand text-[10px] font-bold text-white">
                      2
                    </span>
                    <h3 className="text-sm font-semibold leading-none">Review {previewTasks.length} tasks</h3>
                    <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      ≈ {formatTotalTime(previewTotal)}
                    </span>
                  </div>
                  <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border">
                    {previewTasks.map((task, i) => (
                      <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize',
                            priorityTokens[task.priority],
                          )}
                          title={`${task.priority} priority`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                          {task.priority}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{task.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(task.deadline), 'EEE, MMM d')} · {task.estimatedMinutes} min
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setSelected(null)} disabled={importing}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void applyTemplate()}
                  disabled={importing || !isOnline || !user}
                  title={!isOnline ? 'Templates need a connection so every task is saved atomically' : undefined}
                >
                  {importing ? 'Adding tasks…' : `Add ${previewTasks.length} tasks`}
                </Button>
              </DialogFooter>
              {!isOnline && (
                <p className="text-center text-xs text-amber-600 dark:text-amber-400">
                  You’re offline — templates apply all tasks at once, so they need a connection.
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <ShareTemplateDialog
        open={share !== null}
        onOpenChange={(open) => {
          if (!open) setShare(null)
        }}
        initial={share?.initial ?? null}
        authorName={authorName}
        userId={userId}
        online={isOnline}
      />

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
        Shared templates are public to everyone on {BRAND.name} — private ones stay yours alone.
      </p>
    </div>
  )
}