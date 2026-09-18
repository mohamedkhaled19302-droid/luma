import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  HelpCircle,
  LogOut,
  Moon,
  Settings as SettingsIcon,
  Sun,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { Logo } from '@/components/common/logo'
import { Spinner } from '@/components/common/loading'
import { NotificationItem } from '@/components/common/notification-item'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
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
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useNotifications } from '@/hooks/queries'
import { markNotificationsRead } from '@/services/notification-service'
import { useTheme } from '@/lib/theme'
import { cn, initials } from '@/lib/utils'
import { NAV_ITEMS } from '@/lib/navigation'
import { useState } from 'react'

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const isOnline = useOnlineStatus()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const theme = useTheme()
  const [notifOpen, setNotifOpen] = useState(false)

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

  return (
    <div className="flex min-h-dvh flex-col">
      {!isOnline && (
        <p className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          You&apos;re offline. Changes are queued and will sync when you reconnect.
        </p>
      )}

      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
        <Link to="/dashboard" className="shrink-0" aria-label="Go to dashboard">
          <Logo />
        </Link>

        <div className="ml-auto flex items-center gap-1">
          <Popover open={notifOpen} onOpenChange={setNotifOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                aria-label={`Notifications (${unread} unread)`}
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {unread > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(90vw,360px)] p-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <p className="text-sm font-medium">Notifications</p>
                {unread > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
                    Mark all read
                  </Button>
                )}
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {notifLoading ? (
                  <div className="flex justify-center py-6">
                    <Spinner />
                  </div>
                ) : !notifications || notifications.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No notifications yet
                  </p>
                ) : (
                  <ul className="divide-y">
                    {notifications.slice(0, 15).map((n) => (
                      <li key={n.id}>
                        <NotificationItem
                          notification={n}
                          onClick={() => {
                            setNotifOpen(false)
                            const route = n.data?.route
                            if (typeof route === 'string') navigate(route)
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-t p-2">
                <Button variant="ghost" size="sm" className="w-full" asChild>
                  <Link to="/notifications">View all</Link>
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => theme.setTheme(theme.resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={theme.resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme.resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0" aria-label="Account menu">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>{initials(user?.email ?? 'LU')}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
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
        <aside className="hidden w-56 shrink-0 border-r bg-sidebar md:block">
          <nav className="sticky top-14 flex flex-col gap-0.5 p-3" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                  )
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-3 py-4 pb-20 md:px-6 md:pb-6">{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur md:hidden"
        aria-label="Mobile navigation"
      >
        <ul className="flex justify-around">
          {NAV_ITEMS.slice(0, 5).map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-medium',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                <item.icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}