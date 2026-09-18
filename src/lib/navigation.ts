import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  CalendarRange,
  CheckSquare,
  GraduationCap,
  LayoutDashboard,
  Repeat,
} from 'lucide-react'
export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/planner', label: 'Planner', icon: CalendarRange },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/habits', label: 'Habits', icon: Repeat },
  { to: '/wellbeing', label: 'Wellbeing', icon: Activity },
  { to: '/subjects', label: 'Subjects', icon: GraduationCap },
]