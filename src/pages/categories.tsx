import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useCategories } from '@/hooks/queries'
import { useCategoryMutations } from '@/hooks/mutations'
import type { Category } from '@/types/models'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Spinner } from '@/components/common/loading'
import { cn, formatError } from '@/lib/utils'

const COLOR_PALETTE = [
  '#6366f1',
  '#8b5cf6',
  '#0ea5e9',
  '#0891b2',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#db2777',
]

/** Starting points that fit most people's lives, not just one kind of life. */
const SUGGESTIONS = ['Work', 'Health', 'Home', 'Learning', 'Side project', 'Family', 'Money', 'Errands']

function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  submitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category | null
  submitting: boolean
  onSubmit: (values: { name: string; color: string }) => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLOR_PALETTE[0] ?? '#6366f1')

  useEffect(() => {
    if (!open) return
    setName(category?.name ?? '')
    setColor(category?.color ?? (COLOR_PALETTE[0] ?? '#6366f1'))
  }, [open, category])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit({ name, color })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle>
          <DialogDescription>
            {category
              ? 'Tweak the details and save.'
              : 'Give each area of your life a colour so plans are easy to read at a glance.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Deep work"
              required
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setName(suggestion)}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PALETTE.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`Colour ${option}`}
                  onClick={() => setColor(option)}
                  className={cn(
                    'h-8 w-8 rounded-full transition-transform',
                    color === option && 'scale-110 ring-2 ring-ring ring-offset-2',
                  )}
                  style={{ backgroundColor: option }}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || name.trim() === ''}>
              {submitting && <Spinner className="h-4 w-4" />}
              {category ? 'Save changes' : 'Create category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function CategoriesPage() {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const categories = useCategories(userId)
  const cm = useCategoryMutations(userId)
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; category: Category } | null>(null)

  const allCategories = categories.data ?? []

  if (!userId) {
    return (
      <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
        <EmptyState title="Sign in to manage your categories" />
      </div>
    )
  }

  const submitCreate = (values: { name: string; color: string }) => {
    cm.create.mutate(values, {
      onSuccess: () => {
        toast.success('Category added.')
        setDialog(null)
      },
      onError: (error) => toast.error(formatError(error)),
    })
  }

  const submitEdit = (values: { name: string; color: string }) => {
    if (dialog?.mode !== 'edit') return
    cm.update.mutate(
      { id: dialog.category.id, ...values },
      {
        onSuccess: () => {
          toast.success('Category updated.')
          setDialog(null)
        },
        onError: (error) => toast.error(formatError(error)),
      },
    )
  }

  const removeCategory = (category: Category) =>
    cm.remove.mutate(
      { id: category.id },
      {
        onSuccess: () => toast.success('Category deleted.'),
        onError: (error) => toast.error(formatError(error)),
      },
    )

  if (categories.isError) {
    return (
      <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
        <ErrorState message={formatError(categories.error)} onRetry={() => void categories.refetch()} />
      </div>
    )
  }

  return (
    <div className="stagger-fade mx-auto max-w-3xl space-y-5 px-4 py-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-bold tracking-tight text-2xl sm:text-3xl">Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Name the areas of your life you want to keep separate — work, health, home, whatever
            fits.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New category
        </Button>
      </header>

      {categories.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : allCategories.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-6 w-6" aria-hidden="true" />}
          title="No categories yet"
          description="Add the areas of your life you want your plan to keep track of."
          action={
            <Button onClick={() => setDialog({ mode: 'create' })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add your first category
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-lg">Your categories</CardTitle>
              <CardDescription>
                {allCategories.length} categor{allCategories.length === 1 ? 'y' : 'ies'}
              </CardDescription>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft">
              <Tag className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {allCategories.map((category) => (
              <div
                key={category.id}
                className="group flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3.5 py-2.5 transition-colors hover:border-primary/25 hover:bg-muted/60"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
                    style={{ backgroundColor: category.color }}
                    aria-hidden="true"
                  >
                    {category.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate font-medium">{category.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`Edit ${category.name}`}
                    onClick={() => setDialog({ mode: 'edit', category })}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete ${category.name}`}
                    onClick={() => removeCategory(category)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <CategoryFormDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
        category={dialog?.mode === 'edit' ? dialog.category : null}
        submitting={cm.create.isPending || cm.update.isPending}
        onSubmit={dialog?.mode === 'edit' ? submitEdit : submitCreate}
      />
    </div>
  )
}
