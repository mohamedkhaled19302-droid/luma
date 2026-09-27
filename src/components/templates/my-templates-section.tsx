import { Globe, Lock, Pencil, Plus, Trash2, BookMarked } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTemplateMutations } from '@/hooks/mutations'
import { cn, formatError } from '@/lib/utils'
import { playSound } from '@/lib/sound'
import { TEMPLATE_CATEGORIES } from '@/lib/planning-templates'
import {
  listMyTemplates,
  formatSharePreview,
  type TemplateRow,
} from '@/services/template-service'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Skeleton } from '@/components/ui/skeleton'
import { initials } from '@/lib/utils'

export function MyTemplatesSection({
  userId,
  authorName,
  onNew,
  onEdit,
}: {
  userId: string
  authorName: string
  onNew: () => void
  onEdit: (template: TemplateRow) => void
}) {
  const queryClient = useQueryClient()
  const mine = useQuery({
    queryKey: ['templates', 'mine', userId],
    queryFn: () => listMyTemplates(userId),
    staleTime: 30_000,
    retry: 2,
    enabled: Boolean(userId),
  })
  const templates = useTemplateMutations(userId)

  const templatesList = mine.data ?? []

  const flipVisibility = (template: TemplateRow) => {
    const next = !template.is_public
    playSound('toggle')
    queryClient.setQueryData<TemplateRow[]>(['templates', 'mine', userId], (old) =>
      old ? old.map((row) => (row.id === template.id ? { ...row, is_public: next } : row)) : old,
    )
    templates.setVisibility.mutate(
      { id: template.id, isPublic: next },
      {
        onSuccess: () =>
          toast.success(
            next ? 'Now public — shared with the community.' : 'Now private — just for you.',
          ),
        onError: (error) => {
          toast.error(formatError(error))
          void queryClient.invalidateQueries({ queryKey: ['templates', 'mine', userId] })
        },
      },
    )
  }

  const remove = (template: TemplateRow) => {
    playSound('delete')
    templates.remove.mutate(
      { id: template.id },
      {
        onSuccess: () => toast.success(`“${template.name}” removed.`),
        onError: (error) => toast.error(formatError(error)),
      },
    )
  }

  if (!userId) {
    return (
      <EmptyState
        icon={<BookMarked className="h-5 w-5" aria-hidden="true" />}
        title="Sign in to save templates"
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Templates you’ve saved — flip any of them public to share it with the community.
        </p>
        <Button size="sm" onClick={onNew} className="shrink-0">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Save my plan
        </Button>
      </div>

      {mine.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : mine.isError ? (
        <ErrorState message={formatError(mine.error)} onRetry={() => void mine.refetch()} />
      ) : templatesList.length === 0 ? (
        <EmptyState
          icon={<BookMarked className="h-5 w-5" aria-hidden="true" />}
          title="No saved templates yet"
          description="Save a plan from the Library or Share a template, and manage it right here."
          action={
            <Button onClick={onNew} size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create your first template
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-lg">My templates</CardTitle>
              <CardDescription>
                {templatesList.length} {templatesList.length === 1 ? 'template' : 'templates'} ·
                {templatesList.filter((t) => t.is_public).length} public
              </CardDescription>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft">
              <BookMarked className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {templatesList.map((template) => {
              const category = TEMPLATE_CATEGORIES.find((c) => c.id === template.category)
              return (
                <div
                  key={template.id}
                  className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/30 px-3.5 py-3 transition-colors hover:border-primary/25 hover:bg-muted/60"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-brand-soft text-lg">
                      <span aria-hidden="true">{template.emoji || '📘'}</span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{template.name}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="capitalize">{category?.label}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatSharePreview(template.tasks)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs">
                      {template.is_public ? (
                        <Globe
                          className="h-3.5 w-3.5 text-primary"
                          aria-hidden="true"
                        />
                      ) : (
                        <Lock
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      <span className={cn(template.is_public ? 'text-primary' : 'text-muted-foreground')}>
                        {template.is_public ? 'Public' : 'Private'}
                      </span>
                    </span>
                    <Switch
                      checked={template.is_public}
                      onCheckedChange={() => flipVisibility(template)}
                      aria-label={`Make ${template.name} ${template.is_public ? 'private' : 'public'}`}
                      disabled={templates.setVisibility.isPending}
                    />
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Edit ${template.name}`}
                      onClick={() => onEdit(template)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Delete ${template.name}`}
                      onClick={() => remove(template)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Avatar className="h-4 w-4 border" aria-hidden="true">
          <AvatarFallback className="bg-brand-soft text-[8px] font-bold text-primary">
            {initials(authorName) || 'LU'}
          </AvatarFallback>
        </Avatar>
        Your templates are authored under “{authorName || 'Member'}” in the gallery.
      </p>
    </div>
  )
}