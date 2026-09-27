import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  CalendarRange,
  CheckSquare,
  Tag,
  LayoutDashboard,
  LayoutTemplate,
  Moon,
  Repeat,
  Search,
  Sparkles,
  Sun,
  Timer,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useTheme } from '@/lib/theme'
import { playSound } from '@/lib/sound'
import { cn } from '@/lib/utils'

interface CommandItem {
  id: string
  label: string
  hint: string
  icon: typeof LayoutDashboard
  keywords: string[]
  action: () => void
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((v) => !v)
        playSound('whoosh')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const items = useMemo<CommandItem[]>(() => {
    const go = (to: string) => () => {
      setOpen(false)
      playSound('confirm')
      navigate(to)
    }
    return [
      { id: 'dashboard', label: 'Go to Dashboard', hint: 'G D', icon: LayoutDashboard, keywords: ['home', 'overview', 'today'], action: go('/dashboard') },
      { id: 'planner', label: 'Go to Planner', hint: 'G P', icon: CalendarRange, keywords: ['calendar', 'schedule', 'week'], action: go('/planner') },
      { id: 'tasks', label: 'Go to Tasks', hint: 'G T', icon: CheckSquare, keywords: ['todo', 'to-do', 'deadline', 'chore'], action: go('/tasks') },
      { id: 'habits', label: 'Go to Habits', hint: 'G H', icon: Repeat, keywords: ['streak', 'routine', 'daily'], action: go('/habits') },
      { id: 'wellbeing', label: 'Go to Wellbeing', hint: 'G W', icon: Activity, keywords: ['energy', 'stress', 'sleep', 'check in', 'checkin'], action: go('/wellbeing') },
      { id: 'categories', label: 'Go to Categories', hint: 'G C', icon: Tag, keywords: ['label', 'tag', 'area', 'group', 'colour', 'color'], action: go('/categories') },
      { id: 'templates', label: 'Browse Templates', hint: 'G M', icon: LayoutTemplate, keywords: ['template', 'starter', 'plan', 'project', 'milestone'], action: go('/templates') },
      { id: 'focus', label: 'Open Focus Studio', hint: 'G F', icon: Timer, keywords: ['pomodoro', 'timer', 'concentrate', 'deep work'], action: go('/focus') },
      { id: 'insights', label: 'Go to Insights', hint: 'G I', icon: Sparkles, keywords: ['stats', 'analytics', 'progress'], action: go('/insights') },
      {
        id: 'theme',
        label: resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        hint: 'T',
        icon: resolvedTheme === 'dark' ? Sun : Moon,
        keywords: ['theme', 'dark', 'light', 'appearance', 'mode'],
        action: () => {
          playSound('toggle')
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
          setOpen(false)
        },
      },
    ]
  }, [navigate, resolvedTheme, setTheme])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.some((keyword) => keyword.includes(q)),
    )
  }, [items, query])

  useEffect(() => setSelected(0), [query])

  const runSelected = (index: number) => {
    const item = filtered[index]
    if (item) item.action()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          playSound('whoosh')
        }}
        className="hidden items-center gap-2 rounded-md border bg-muted/60 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted md:flex"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Search…</span>
        <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium">Ctrl K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[18%] translate-y-0 gap-0 overflow-hidden p-0 sm:rounded-xl" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <div className="flex items-center gap-2 border-b px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSelected((s) => Math.min(s + 1, filtered.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSelected((s) => Math.max(s - 1, 0))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  runSelected(selected)
                }
              }}
              placeholder="Type a command or search…"
              className="h-12 border-0 shadow-none focus-visible:ring-0"
              autoFocus
              aria-label="Search commands"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto p-2" role="listbox" aria-label="Commands">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                No commands match &ldquo;{query}&rdquo;
              </li>
            ) : (
              filtered.map((item, index) => (
                <li key={item.id} role="option" aria-selected={index === selected}>
                  <button
                    type="button"
                    onClick={item.action}
                    onMouseEnter={() => setSelected(index)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                      index === selected ? 'bg-accent text-accent-foreground' : 'text-foreground',
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    {index === selected ? (
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {item.hint}
                      </kbd>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            ↑↓ to navigate · Enter to select · Esc to close
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}