import { useState } from 'react'
import { format, addDays } from 'date-fns'
import { CheckSquare, GraduationCap, Plus, Repeat, Timer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/hooks/use-auth'
import { useTaskMutations } from '@/hooks/mutations'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'
import type { Priority } from '@/types/models'

type Action = 'task' | 'focus' | 'templates' | 'habits'

/**
 * ClickUp-style floating quick-add. The + button expands into fast actions;
 * "New task" opens an inline capture dialog that saves in one keystroke.
 */
export function QuickAdd() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [taskDialog, setTaskDialog] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [deadline, setDeadline] = useState(format(addDays(new Date(), 2), 'yyyy-MM-dd'))
  const [minutes, setMinutes] = useState('60')
  const { create } = useTaskMutations(user?.id ?? '')

  const actions: Array<{ id: Action; label: string; icon: typeof CheckSquare }> = [
    { id: 'task', label: 'New task', icon: CheckSquare },
    { id: 'focus', label: 'Focus session', icon: Timer },
    { id: 'templates', label: 'From template', icon: GraduationCap },
    { id: 'habits', label: 'Habits', icon: Repeat },
  ]

  const pick = (action: Action) => {
    setOpen(false)
    playSound('toggle')
    if (action === 'task') setTaskDialog(true)
    else if (action === 'focus') navigate('/focus')
    else if (action === 'templates') navigate('/templates')
    else if (action === 'habits') navigate('/habits')
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!user || !title.trim()) return
    create.mutate(
      {
        title: title.trim(),
        priority,
        estimated_minutes: Math.max(15, Number.parseInt(minutes, 10) || 60),
        deadline: deadline || null,
      },
      {
        onSuccess: () => {
          toast.success('Task captured')
          playSound('confirm')
          setTaskDialog(false)
          setTitle('')
          setPriority('medium')
          setMinutes('60')
        },
        onError: () => toast.error('Could not save the task. It will retry when you are back online.'),
      },
    )
  }

  return (
    <>
      <div className="pointer-events-none fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2 md:bottom-6 md:right-6">
        <div
          className={cn(
            'pointer-events-auto flex flex-col items-end gap-2 transition-all duration-200',
            open ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
          )}
          aria-hidden={!open}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => pick(action.id)}
              className="pointer-events-auto flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium shadow-lg transition-transform hover:scale-105"
              tabIndex={open ? 0 : -1}
            >
              <action.icon className="h-4 w-4 text-primary" aria-hidden="true" />
              {action.label}
            </button>
          ))}
        </div>
        <Button
          size="icon"
          onClick={() => {
            setOpen((v) => !v)
            playSound('click')
          }}
          className={cn(
            'pointer-events-auto h-12 w-12 rounded-full shadow-xl transition-transform duration-200',
            open && 'rotate-45',
          )}
          aria-label={open ? 'Close quick add' : 'Quick add'}
          aria-expanded={open}
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      <Dialog open={taskDialog} onOpenChange={setTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Capture a task</DialogTitle>
            <DialogDescription>
              Brain-dump it now — the planner will find it a home in your week.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qa-title">What needs doing?</Label>
              <Input
                id="qa-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Biology chapter 7 notes"
                autoFocus
                maxLength={120}
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="qa-priority">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                  <SelectTrigger id="qa-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qa-deadline">Due</Label>
                <Input
                  id="qa-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qa-minutes">Est. min</Label>
                <Input
                  id="qa-minutes"
                  type="number"
                  min={15}
                  max={600}
                  step={15}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setTaskDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending || !title.trim()}>
                {create.isPending ? 'Saving…' : 'Add task'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}