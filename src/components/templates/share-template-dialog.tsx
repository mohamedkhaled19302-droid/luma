import { BRAND } from '@/lib/brand'
import { useEffect, useState, type FormEvent } from 'react'
import { Globe, Lock, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useTemplateMutations } from '@/hooks/mutations'
import { cn, formatError } from '@/lib/utils'
import { playSound } from '@/lib/sound'
import {
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
  type TemplateTask,
} from '@/lib/planning-templates'
import type { Difficulty, Priority } from '@/types/models'
import {
  formatSharePreview,
  type TemplateInsert,
} from '@/services/template-service'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/common/loading'

const PRIORITY_OPTIONS: Priority[] = ['low', 'medium', 'high', 'critical']
const DIFFICULTY_OPTIONS: Difficulty[] = ['easy', 'medium', 'hard']

function blankTask(): TemplateTask {
  return {
    title: '',
    offsetDays: 0,
    estimatedMinutes: 60,
    priority: 'medium',
    difficulty: 'medium',
  }
}

export interface ShareTemplateInitial {
  id?: string
  name: string
  emoji: string
  description: string
  category: TemplateCategory
  tasks: TemplateTask[]
  isPublic: boolean
}

export function ShareTemplateDialog({
  open,
  onOpenChange,
  initial,
  authorName,
  userId,
  online,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: ShareTemplateInitial | null
  authorName: string
  userId: string
  online: boolean
}) {
  const templates = useTemplateMutations(userId)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TemplateCategory>('focus')
  const [isPublic, setIsPublic] = useState(false)
  const [tasks, setTasks] = useState<TemplateTask[]>([])

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setEmoji(initial?.emoji ?? '')
    setDescription(initial?.description ?? '')
    setCategory(initial?.category ?? 'focus')
    setIsPublic(initial?.isPublic ?? false)
    setTasks(initial?.tasks?.length ? initial.tasks.map((task) => ({ ...task })) : [blankTask()])
  }, [open, initial])

  const saving = templates.create.isPending || templates.update.isPending

  const updateTask = (index: number, patch: Partial<TemplateTask>) => {
    setTasks((current) => current.map((task, i) => (i === index ? { ...task, ...patch } : task)))
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!userId || name.trim() === '') return

    const validTasks = tasks
      .map((task) => ({ ...task, title: task.title.trim() }))
      .filter((task) => task.title !== '')

    const fields: TemplateInsert = {
      name: name.trim(),
      emoji: emoji.trim() || '📘',
      description: description.trim() || null,
      category,
      tasks: validTasks,
      author_name: authorName,
      is_public: isPublic,
    }

    const onSaved = {
      onSuccess: () => {
        playSound('confirm')
        toast.success(
          isPublic
            ? 'Template shared — visible to everyone.'
            : 'Template saved — just for you.',
          { description: `${fields.name} · ${formatSharePreview(fields.tasks)}` },
        )
        onOpenChange(false)
      },
      onError: (error: unknown) => toast.error(formatError(error)),
    }

    if (initial?.id) {
      templates.update.mutate({ id: initial.id, fields }, onSaved)
    } else {
      templates.create.mutate({ fields }, onSaved)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" aria-hidden="true" />
            {initial?.id ? 'Edit template' : 'Share a template'}
          </DialogTitle>
          <DialogDescription>
            {initial?.id
              ? 'Tweak the details — visibility and content update everywhere instantly.'
              : 'Share a plan with everyone, or keep it just for you.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div className="space-y-2">
              <Label htmlFor="tpl-share-emoji">Emoji</Label>
              <Input
                id="tpl-share-emoji"
                value={emoji}
                onChange={(event) => setEmoji(event.target.value)}
                placeholder="🎯"
                className="w-full sm:w-20 sm:text-center"
                aria-label="Emoji"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-share-name">Name</Label>
              <Input
                id="tpl-share-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="7-Day Deadline Sprint"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-share-description">Description</Label>
            <Textarea
              id="tpl-share-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this plan for, and who should use it?"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-share-category">Category</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as TemplateCategory)}
            >
              <SelectTrigger id="tpl-share-category" aria-label="Category">
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label htmlFor="tpl-tasks">Tasks in this template</Label>
                <p className="text-xs text-muted-foreground">
                  Name each task, pick which day it lands on, and how long it takes.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setTasks((current) => [...current, blankTask()])}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add task
              </Button>
            </div>
            <div className="space-y-2">
              {tasks.map((task, index) => (
                <div
                  key={index}
                  className="space-y-2 rounded-lg border bg-muted/30 p-3"
                  aria-label={`Task ${index + 1}`}
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={task.title}
                      onChange={(event) => updateTask(index, { title: event.target.value })}
                      placeholder={`Task ${index + 1} — e.g. Review chapter 4`}
                      aria-label={`Task ${index + 1} title`}
                      className="flex-1"
                      maxLength={120}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove task ${index + 1}`}
                      onClick={() => setTasks((current) => current.filter((_, i) => i !== index))}
                      disabled={tasks.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label htmlFor={`tpl-t-day-${index}`} className="text-[11px]">
                        Day
                      </Label>
                      <Input
                        id={`tpl-t-day-${index}`}
                        type="number"
                        min={0}
                        max={90}
                        value={task.offsetDays}
                        onChange={(event) =>
                          updateTask(index, { offsetDays: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })
                        }
                        aria-label={`Task ${index + 1} day`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`tpl-t-min-${index}`} className="text-[11px]">
                        Minutes
                      </Label>
                      <Input
                        id={`tpl-t-min-${index}`}
                        type="number"
                        min={5}
                        max={600}
                        step={5}
                        value={task.estimatedMinutes}
                        onChange={(event) =>
                          updateTask(index, { estimatedMinutes: Math.max(5, Number.parseInt(event.target.value, 10) || 60) })
                        }
                        aria-label={`Task ${index + 1} minutes`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Priority</Label>
                      <Select
                        value={task.priority}
                        onValueChange={(value) => updateTask(index, { priority: value as Priority })}
                      >
                        <SelectTrigger aria-label={`Task ${index + 1} priority`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((p) => (
                            <SelectItem key={p} value={p} className="capitalize">
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Difficulty</Label>
                      <Select
                        value={task.difficulty}
                        onValueChange={(value) => updateTask(index, { difficulty: value as Difficulty })}
                      >
                        <SelectTrigger aria-label={`Task ${index + 1} difficulty`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DIFFICULTY_OPTIONS.map((d) => (
                            <SelectItem key={d} value={d} className="capitalize">
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                {isPublic ? (
                  <Globe className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                {isPublic ? 'Shared & visible to everyone' : 'Just for you — private'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isPublic
                  ? `Anyone signed into ${BRAND.name} can browse and apply it.`
                  : 'Only you can see use this template.'}
              </p>
            </div>
            <Switch
              checked={isPublic}
              onCheckedChange={(checked) => {
                playSound('toggle')
                setIsPublic(checked)
              }}
              aria-label="Public template"
              disabled={!online || saving}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tasks.some((task) => task.title.trim()) ? (
              <Badge variant="secondary">{formatSharePreview(tasks.filter((t) => t.title.trim()))}</Badge>
            ) : (
              <Badge variant="secondary">No tasks yet — add at least one task above.</Badge>
            )}
            <span className={cn('ml-auto text-xs', isPublic ? 'text-primary' : 'text-muted-foreground')}>
              {isPublic ? 'Public' : 'Private'}
            </span>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !online || name.trim() === ''}>
              {saving && <Spinner className="h-4 w-4" />}
              {saving ? 'Saving…' : initial?.id ? 'Save changes' : 'Share template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}