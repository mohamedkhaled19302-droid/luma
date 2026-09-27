import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  CalendarRange,
  CheckSquare,
  LayoutDashboard,
  LayoutTemplate,
  Repeat,
  Sparkles,
  Tag,
  Timer,
} from 'lucide-react'
import type { AppNotification } from '@/types/models'

const NOTIFICATION_ROUTES: Partial<Record<AppNotification['type'], string>> = {
  deadline: '/tasks',
  task: '/tasks',
  missed_task: '/tasks',
  schedule_change: '/planner',
  habit: '/habits',
}

export function notificationRoute(type: AppNotification['type']): string | undefined {
  return NOTIFICATION_ROUTES[type]
}
export interface NavItem {
  to: string
  label: string
  title: string
  icon: LucideIcon
  keywords?: string[]
  primary?: boolean
  section: NavSectionId
}

export type NavSectionId = 'overview' | 'manage' | 'grow'

export interface NavSection {
  label: string
  id: NavSectionId
  items: NavItem[]
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', title: 'Overview', icon: LayoutDashboard, primary: true, section: 'overview' },
  { to: '/planner', label: 'Planner', title: 'Planner', icon: CalendarRange, primary: true, section: 'overview' },
  { to: '/tasks', label: 'Tasks', title: 'Tasks', icon: CheckSquare, primary: true, section: 'manage' },
  { to: '/habits', label: 'Habits', title: 'Habits', icon: Repeat, primary: true, section: 'manage' },
  { to: '/wellbeing', label: 'Wellbeing', title: 'Wellbeing', icon: Activity, section: 'manage' },
  { to: '/categories', label: 'Categories', title: 'Categories', icon: Tag, section: 'manage' },
  { to: '/templates', label: 'Templates', title: 'Templates', icon: LayoutTemplate, section: 'grow' },
  { to: '/focus', label: 'Focus', title: 'Focus Studio', icon: Timer, primary: true, section: 'grow' },
  { to: '/assistant', label: 'Assistant', title: 'Assistant', icon: Sparkles, primary: true, section: 'grow' },
  { to: '/insights', label: 'Insights', title: 'Insights', icon: BarChart3, section: 'grow' },
]

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    id: 'overview',
    items: NAV_ITEMS.filter((i) => i.section === 'overview'),
  },
  {
    label: 'Manage',
    id: 'manage',
    items: NAV_ITEMS.filter((i) => i.section === 'manage'),
  },
  {
    label: 'Grow',
    id: 'grow',
    items: NAV_ITEMS.filter((i) => i.section === 'grow'),
  },
]