import { BRAND } from '@/lib/brand'
import { useState } from 'react'
import { ArrowRight, BookMarked, Clock, ListChecks, Search, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatError, initials } from '@/lib/utils'
import { playSound } from '@/lib/sound'
import { TEMPLATE_CATEGORIES } from '@/lib/planning-templates'
import {
  getSharedTemplates,
  searchSharedTemplates,
  templateTotalMinutes,
  type TemplateRow,
} from '@/services/template-service'
import { formatTotalTime } from '@/components/templates/template-utils'

export function CommunityGallery({
  userId,
  onApply,
  onCopy,
}: {
  userId: string
  onApply: (template: TemplateRow) => void
  onCopy: (template: TemplateRow) => void
}) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const [copyingId, setCopyingId] = useState<string | null>(null)

  const shared = useQuery({
    queryKey: ['templates', 'shared', trimmed],
    queryFn: () => (trimmed ? searchSharedTemplates(trimmed) : getSharedTemplates(userId)),
    staleTime: 30_000,
    retry: 2,
    enabled: Boolean(userId),
  })

  const templates = shared.data ?? []

  const apply = (template: TemplateRow) => {
    if (!onApply) return
    playSound('whoosh')
    onApply(template)
  }

  const copy = (template: TemplateRow) => {
    if (!onCopy) return
    setCopyingId(template.id)
    playSound('confirm')
    onCopy(template)
    // optimistic copy feedback so the gallery stays snappy
    setTimeout(() => setCopyingId(null), 1200)
    toast.success(`“${template.name}” copied to your templates`, {
      description: 'It is private until you make it public.',
    })
  }

  if (!userId) {
    return <EmptyState icon={<Users className="h-5 w-5" aria-hidden="true" />} title="Sign in to browse the community gallery" />
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search shared templates…"
          className="pl-9"
          aria-label="Search shared templates"
        />
      </div>

      {shared.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : shared.isError ? (
        <ErrorState message={formatError(shared.error)} onRetry={() => void shared.refetch()} />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          title={trimmed ? `No shared templates match “${trimmed}”` : 'No public templates yet'}
          description={
            trimmed
              ? 'Try a different search — or share your own plan to kick things off.'
              : 'Be the first to share your study plan with the community.'
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map((template) => {
            const category = TEMPLATE_CATEGORIES.find((c) => c.id === template.category)
            return (
              <Card key={template.id} className="card-lift group flex flex-col">
                <CardHeader className="pb-2">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border bg-brand-soft text-2xl shadow-sm transition-transform duration-300 group-hover:scale-105">
                      <span aria-hidden="true">{template.emoji || '📘'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 border" aria-label={template.author_name}>
                        <AvatarFallback className="bg-brand-soft text-[10px] font-bold text-primary">
                          {initials(template.author_name) || 'LU'}
                        </AvatarFallback>
                      </Avatar>
                      <Badge variant="secondary" className="shrink-0 capitalize">
                        {category?.label}
                      </Badge>
                    </div>
                  </div>
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  <CardDescription className="capitalize">
                    {template.author_name || 'Anonymous member'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {template.description ?? `A template shared with the ${BRAND.name} community.`}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                      {template.tasks.length} tasks
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      ≈ {formatTotalTime(templateTotalMinutes(template.tasks))}
                    </span>
                    <span
                      className={cn(
                        'ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                        'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                      Public
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="flex-1" onClick={() => apply(template)}>
                    Use template <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    onClick={() => copy(template)}
                    disabled={copyingId === template.id}
                    title="Save a private copy in My templates"
                  >
                    <BookMarked className="h-4 w-4" aria-hidden="true" />
                    Save a copy
                  </Button>
                </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <p className="rounded-lg border border-dashed border-primary/20 bg-brand-soft px-3 py-2 text-xs text-muted-foreground">
        These templates come from the shared gallery, not the built-in library. Applying one goes
        through the same non-overlapping scheduler as every other plan.
      </p>
    </div>
  )
}