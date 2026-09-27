import type { ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  HelpCircle,
  LayoutGrid,
  LogOut,
  Moon,
  RefreshCw,
  Settings as SettingsIcon,
  Sun,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Logo } from '@/components/common/logo'
import { Spinner } from '@/components/common/loading'
import { NotificationItem } from '@/components/common/notification-item'
import { CommandPalette } from '@/components/command/command-palette'
import { QuickAdd } from '@/components/quick-add/quick-add'
import { AssistantLauncher } from '@/components/assistant/assistant-launcher'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/hooks/use-auth'
import { signOut as authSignOut } from '@/auth/auth-service'
import { useNetworkStatus } from '@/hooks/use-network-status'
import { useNotifications } from '@/hooks/queries'
import { markNotificationRead, markNotificationsRead } from '@/services/notification-service'
import { supabase } from '@/database/client'
import { flushPending, pendingCount, type SyncFlushClient } from '@/lib/sync-queue'
import { useTheme } from '@/lib/theme'
import { cn, initials } from '@/lib/utils'
import { NAV_ITEMS, NAV_SECTIONS, notificationRoute } from '@/lib/navigation'
import { getSoundsEnabled, setSoundsEnabled, playSound } from '@/lib/sound'
import type { AppNotification } from '@/types/models'

function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()
  const key = location.pathname
  return (
    <div key={key} className="anim-screen min-w-0 flex-1">
      {children}
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { online: isOnline, pendingCount: pending } = useNetworkStatus()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const theme = useTheme()
  const [notifOpen, setNotifOpen] = useState(false)
  const [soundsOn, setSoundsOn] = useState(() => getSoundsEnabled())
  const location = useLocation()

  const toggleSounds = () => {
    const next = !soundsOn
    setSoundsEnabled(next)
    setSoundsOn(next)
    if (next) playSound('confirm')
    toast.success(next ? 'UI sounds on' : 'UI sounds off', { duration: 1500 })
  }

  const { data: notifications, isLoading: notifLoading } = useNotifications(user?.id ?? '')
  const unread = notifications?.filter((n) => !n.read).length ?? 0

  const handleSignOut = async () => {
    try {
      await authSignOut()
      navigate('/')
    } catch {
      toast.error('Failed to sign out. Please try again.')
    }
  }

  const markAllRead = async () => {
    if (!user || !notifications) return
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id)
    if (unreadIds.length === 0) return
    try {
      await markNotificationsRead(user.id, unreadIds)
      void queryClient.invalidateQueries({ queryKey: ['notifications', user.id] })
    } catch {
      toast.error('Could not update notifications.')
    }
  }

  const handleNotificationClick = async (notification: AppNotification) => {
    setNotifOpen(false)
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id)
        void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      } catch {
        toast.error('Could not update notifications.')
      }
    }
    const route = notificationRoute(notification.type)
    if (route && route !== location.pathname) navigate(route)
  }

  // Close mobile overflow menu when the route changes
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const quickLinks = useMemo(() => NAV_ITEMS.filter((i) => i.primary), [])
  const mobileItems = useMemo(() => {
    const primary = NAV_ITEMS.filter((i) => i.primary)
    return { primary, more: NAV_ITEMS.filter((i) => !i.primary) }
  }, [])

  const [menuOpen, setMenuOpen] = useState(false)

  const syncClient = supabase as unknown as SyncFlushClient

  const flushNow = useCallback(() => {
    if (!isOnline || pendingCount() === 0) return
    void flushPending(syncClient)
  }, [isOnline, syncClient])

  useEffect(() => {
    if (isOnline && pending > 0) void flushPending(syncClient)
  }, [isOnline, pending, syncClient])

  useEffect(() => {
    if (!isOnline) return
    const timer = window.setInterval(() => {
      if (pendingCount() > 0) void flushPending(syncClient)
    }, 15_000)
    return () => window.clearInterval(timer)
  }, [isOnline, syncClient])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <div className="flex min-h-dvh flex-col">
      {(pending > 0 || !isOnline) && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-200/60 bg-amber-50/90 px-4 py-1.5 text-xs font-medium text-amber-800 backdrop-blur dark:border-amber-900/60 dark:bg-amber-950/90 dark:text-amber-200">
          <p className="flex items-center gap-2">
            <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pending > 0 ? (
              <span>
                You&apos;re offline — {pending} change{pending === 1 ? '' : 's'} queued, will sync
                automatically.
              </span>
            ) : (
              <span>
                You&apos;re offline. Any changes you make will sync automatically when you reconnect.
              </span>
            )}
          </p>
          {pending > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 gap-1 px-2 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-900/60 dark:hover:text-amber-100"
              onClick={flushNow}
              disabled={!isOnline}
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Sync now
            </Button>
          )}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <Link to="/dashboard" className="press shrink-0 rounded-lg" aria-label="Go to dashboard">
          <Logo />
        </Link>

        {/* Desktop: current section label */}
        <div className="ml-4 hidden md:block" aria-hidden="true">
          <span className="eyebrow">
            {(() => {
              const match = NAV_ITEMS.find((i) => i.to === location.pathname)
              return match?.title ?? 'Overview'
            })()}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <CommandPalette />

          {/* Sound toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSounds}
            className="press"
            aria-label={soundsOn ? 'Turn UI sounds off' : 'Turn UI sounds on'}
            aria-pressed={soundsOn}
            title={soundsOn ? 'Sounds on' : 'Sounds off'}
          >
            {soundsOn ? (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>

          {/* Notifications */}
          <Popover open={notifOpen} onOpenChange={setNotifOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="press relative"
                aria-label={`Notifications (${unread} unread)`}
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {unread > 0 && (
                  <span className="gradient-brand absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white shadow-glow">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="glass-strong dark:w-80 w-80 p-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="font-display text-sm font-semibold tracking-tight">Notifications</h2>
                {unread > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void markAllRead()}>
                    Mark all read
                  </Button>
                )}
              </div>
              <ScrollArea className="max-h-80">
                <div className="px-1 py-1">
                  {notifLoading ? (
                    <div className="flex justify-center py-8">
                      <Spinner className="h-5 w-5" />
                    </div>
                  ) : !notifications || notifications.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      All caught up.
                    </p>
                  ) : (
                    notifications.slice(0, 12).map((n) => (
                      <NotificationItem key={n.id} notification={n} onClick={handleNotificationClick} />
                    ))
                  )}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="press"
            onClick={() => {
              playSound('toggle')
              theme.setTheme(theme.resolvedTheme === 'dark' ? 'light' : 'dark')
            }}
            aria-label={theme.resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme.resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>

          {/* Account */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="press relative h-10 w-10 rounded-full p-0" aria-label="Account menu">
                <Avatar className="h-9 w-9 ring-2 ring-ring/40">
                  <AvatarFallback className="gradient-brand text-xs font-bold text-white">
                    {initials(user?.email ?? 'LU')}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-strong w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{user?.email}</span>
                  <span className="text-xs text-muted-foreground">Signed in</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <SettingsIcon className="h-4 w-4" aria-hidden="true" /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="https://github.com/mohamedkhaled19302-droid/luma" target="_blank" rel="noreferrer">
                  <HelpCircle className="h-4 w-4" aria-hidden="true" /> Help &amp; feedback
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar — desktop */}
        <aside className="hidden w-64 shrink-0 border-r md:block">
          <nav className="sticky top-16 flex max-h-[calc(100dvh-4rem)] flex-col gap-6 overflow-y-auto p-4" aria-label="Main navigation">
            {NAV_SECTIONS.map((section) => (
              <div key={section.label}>
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {section.label}
                </p>
                <div className="grid gap-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/dashboard'}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                          isActive
                            ? 'bg-brand-soft text-foreground shadow-sm ring-1 ring-primary/20'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={cn(
                              'flex h-7 w-7 items-center justify-center rounded-md transition-all duration-200',
                              isActive
                                ? 'gradient-brand text-white shadow-glow'
                                : 'text-muted-foreground transition-colors group-hover:text-foreground',
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          </span>
                          {item.label}
                          {isActive && (
                            <span className="absolute inset-y-2 left-0 w-0.5 rounded-full gradient-brand" aria-hidden="true" />
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <QuickAdd />
      <AssistantLauncher userId={user?.id ?? ''} />

      {/* Rapid + More — mobile */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75 md:hidden"
        aria-label="Mobile navigation"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="flex items-center justify-around px-2 py-1.5">
          {quickLinks.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/dashboard'}
                className={({ isActive }) =>
                  cn(
                    'flex min-w-[4rem] flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-all duration-200',
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'flex h-8 w-14 items-center justify-center rounded-full transition-all duration-200',
                        isActive && 'gradient-brand shadow-glow',
                      )}
                    >
                      <item.icon className={cn('h-4.5 w-4.5', isActive && 'text-white')} aria-hidden="true" />
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <Button
              variant="ghost"
              className="flex min-w-[4rem] flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
            >
              <span
                className={cn(
                  'flex h-8 w-14 items-center justify-center rounded-full transition-all duration-200',
                  menuOpen && 'bg-muted',
                )}
              >
                <LayoutGrid className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              More
            </Button>
          </li>
        </ul>
      </nav>

      {/* Mobile "More" sheet */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          'fixed inset-x-0 bottom-[4.5rem] z-50 mx-auto rounded-t-2xl border bg-card p-3 shadow-soft-lg transition-all duration-300 md:hidden',
          menuOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
        )}
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        aria-hidden={!menuOpen}
      >
        <div className="grid grid-cols-3 gap-1">
          {mobileItems.more.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-[11px] font-medium transition-all',
                  isActive
                    ? 'bg-brand-soft text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <item.icon className="h-4.5 w-4.5" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  )
}