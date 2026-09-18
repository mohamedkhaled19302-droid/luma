import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useSubjects, useTasks } from '@/hooks/queries'
import { useTaskMutations } from '@/hooks/mutations'
import type { Difficulty, Priority, Subject, Task } from '@/types/models'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/common/states'
import { Spinner } from '@/components/common/loading'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatError } from '@/lib/utils'

type Filter = 'all' | 'open' | 'done' | 'missed'

interface TaskFormValues {
  title: string
  subject_id: string
  priority: Priority
  difficulty: Difficulty
  estimated_minutes: string
  deadline: string
  description: string
}

const priorityTokens: Record<Priority, string> = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  low: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
}

const emptyCopy: Record<Filter, { title: string; description: string }> = {
  all: { title: 'No tasks yet', description: 'Add your first task and watch your day take shape.' },
  open: { title: 'All caught up', description: 'Nothing open right now. Enjoy the space.' },
  done: { title: 'Nothing completed yet', description: 'One small win today goes a long way.' },
  missed: { title: 'No missed tasks', description: 'A clean slate — lovely.' },
}

function TaskFormDialog({
  open,
  onOpenChange,
  subjects,
  task,
  submitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subjects: Subject[]
  task: Task | null
  submitting: boolean
  onSubmit: (values: TaskFormValues) => void
}) {
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [estimatedMinutes, setEstimatedMinutes] = useState('')
  const [deadline, setDeadline] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? '')
    setSubjectId(task?.subject_id ?? '')
    setPriority(task?.priority ?? 'medium')
    setDifficulty(task?.difficulty ?? 'medium')
    setEstimatedMinutes(task ? String(task.estimated_minutes) : '')
    setDeadline(task?.deadline ? task.deadline.slice(0, 10) : '')
    setDescription(task?.description ?? '')
  }, [open, task])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit({
      title,
      subject_id: subjectId,
      priority,
      difficulty,
      estimated_minutes: estimatedMinutes,
      deadline,
      description,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>
            {task ? 'Tweak the details and save.' : 'Write it down so your brain can let go.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs doing?"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="No subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: subject.color }}
                        />
                        {subject.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['low', 'medium', 'high', 'critical'] as Priority[]).map((option) => (
                    <SelectItem key={option} value={option} className="capitalize">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={(value) => setDifficulty(value as Difficulty)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['easy', 'medium', 'hard'] as Difficulty[]).map((option) => (
                    <SelectItem key={option} value={option} className="capitalize">
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-minutes">Estimated minutes</Label>
              <Input
                id="task-minutes"
                type="number"
                min={1}
                value={estimatedMinutes}
                onChange={(event) => setEstimatedMinutes(event.target.value)}
                placeholder="30"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-deadline">Deadline</Label>
            <Input
              id="task-deadline"
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="A little context never hurts."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || title.trim() === ''}>
              {submitting && <Spinner className="h-4 w-4" />}
              {task ? 'Save changes' : 'Create task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function TasksPage() {
  const { user } = useAuth()
  const userId = user?.id
  const tasks = useTasks(userId ?? '')
  const subjects = useSubjects(userId ?? '')
  const tm = useTaskMutations(userId ?? '')
  const [filter, setFilter] = useState<Filter>('all')
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; task: Task } | null>(null)

  const isLoading = tasks.isLoading || subjects.isLoading
  const allTasks = tasks.data ?? []
  const count = allTasks.length

  const subjectMap = new Map((subjects.data ?? []).map((s) => [s.id, s] as [string, Subject]))

  const filtered = allTasks.filter((task) => {
    if (filter === 'open') return task.status === 'todo' || task.status === 'in_progress'
    if (filter === 'done') return task.status === 'done'
    if (filter === 'missed') return task.status === 'missed'
    return true
  })

  const submitCreate = (values: TaskFormValues) => {
    tm.create.mutate(
      {
        title: values.title,
        subject_id: values.subject_id || null,
        priority: values.priority,
        difficulty: values.difficulty,
        estimated_minutes: Number(values.estimated_minutes) || 30,
        deadline: values.deadline || null,
        description: values.description || null,
      },
      {
        onSuccess: () => {
          toast.success('Task created. Nice one.')
          setDialog(null)
        },
        onError: (error) => toast.error(formatError(error)),
      },
    )
  }

  const submitEdit = (values: TaskFormValues) => {
    if (dialog?.mode !== 'edit') return
    const task = dialog.task
    tm.update.mutate(
      {
        id: task.id,
        fields: {
          title: values.title,
          subject_id: values.subject_id || null,
          priority: values.priority,
          difficulty: values.difficulty,
          estimated_minutes: Number(values.estimated_minutes) || task.estimated_minutes,
          deadline: values.deadline || null,
          description: values.description || null,
        },
      },
      {
        onSuccess: () => {
          toast.success('Task updated.')
          setDialog(null)
        },
        onError: (error) => toast.error(formatError(error)),
      },
    )
  }

  const completeTask = (task: Task) =>
    tm.complete.mutate(
      { id: task.id },
      {
        onSuccess: () => toast.success('Done and dusted!'),
        onError: (error) => toast.error(formatError(error)),
      },
    )

  const missTask = (task: Task) =>
    tm.miss.mutate(
      { id: task.id },
      {
        onSuccess: () => toast.success('Marked as missed. Nothing to hold on to.'),
        onError: (error) => toast.error(formatError(error)),
      },
    )

  const reopenTask = (task: Task) =>
    tm.reopen.mutate(
      { id: task.id },
      {
        onSuccess: () => toast.success('Task reopened. Back in play.'),
        onError: (error) => toast.error(formatError(error)),
      },
    )

  const deleteTask = (task: Task) =>
    tm.remove.mutate(
      { id: task.id },
      {
        onSuccess: () => toast.success('Task deleted.'),
        onError: (error) => toast.error(formatError(error)),
      },
    )

  const toggleTask = (task: Task) => {
    if (task.status === 'done') reopenTask(task)
    else completeTask(task)
  }

  const isOverdue = (task: Task) =>
    task.deadline != null &&
    task.status !== 'done' &&
    task.deadline.slice(0, 10) < format(new Date(), 'yyyy-MM-dd')

  if (!userId) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <EmptyState title="Sign in to manage your tasks" />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {count} {count === 1 ? 'task' : 'tasks'} on your list
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: 'create' })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New task
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
          <TabsTrigger value="missed">Missed</TabsTrigger>
        </TabsList>
        <TabsContent value={filter} className="mt-4">
          {filtered.length === 0 ? (
            <EmptyState title={emptyCopy[filter].title} description={emptyCopy[filter].description} />
          ) : (
            <div className="space-y-3">
              {filtered.map((task) => {
                const subject = subjectMap.get(task.subject_id ?? '')
                return (
                  <Card key={task.id} className={cn(task.status === 'done' && 'opacity-70')}>
                    <CardContent className="flex items-center gap-3 p-4">
                      <Checkbox
                        checked={task.status === 'done'}
                        onCheckedChange={() => toggleTask(task)}
                        aria-label={`Mark ${task.title} done`}
                      />
                      {subject && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: subject.color }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'truncate text-sm font-medium',
                            task.status === 'done' && 'text-muted-foreground line-through',
                          )}
                        >
                          {task.title}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          {subject && <span>{subject.name}</span>}
                          {task.deadline && (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1',
                                isOverdue(task) && 'font-medium text-red-500',
                              )}
                            >
                              <CalendarClock className="h-3 w-3" aria-hidden="true" />
                              Due {format(parseISO(task.deadline), 'EEE, MMM d')}
                              {isOverdue(task) && ' · overdue'}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {task.status === 'done'
                              ? `${task.estimated_minutes} min`
                              : task.remaining_minutes !== task.estimated_minutes
                                ? `${task.remaining_minutes} min left`
                                : `${task.estimated_minutes} min`}
                          </span>
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn('shrink-0 capitalize', priorityTokens[task.priority])}
                      >
                        {task.priority}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Actions for ${task.title}`}
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {task.status !== 'done' && (
                            <DropdownMenuItem onClick={() => completeTask(task)}>
                              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                              Mark done
                            </DropdownMenuItem>
                          )}
                          {task.status !== 'done' && task.status !== 'missed' && (
                            <DropdownMenuItem onClick={() => missTask(task)}>
                              <XCircle className="h-4 w-4" aria-hidden="true" />
                              Mark missed
                            </DropdownMenuItem>
                          )}
                          {task.status === 'done' && (
                            <DropdownMenuItem onClick={() => reopenTask(task)}>
                              <RotateCcw className="h-4 w-4" aria-hidden="true" />
                              Reopen
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setDialog({ mode: 'edit', task })}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteTask(task)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {dialog?.mode === 'create' && (
        <TaskFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
          subjects={subjects.data ?? []}
          task={null}
          submitting={tm.create.isPending}
          onSubmit={submitCreate}
        />
      )}
      {dialog?.mode === 'edit' && (
        <TaskFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
          subjects={subjects.data ?? []}
          task={dialog.task}
          submitting={tm.update.isPending}
          onSubmit={submitEdit}
        />
      )}
    </div>
  )
}