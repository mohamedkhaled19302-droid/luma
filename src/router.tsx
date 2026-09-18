import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { AppShell } from '@/layouts/app-shell'
import { SpinnerScreen } from '@/components/common/loading'
import LandingPage from '@/pages/landing'
import SignInPage from '@/pages/auth/sign-in'
import SignUpPage from '@/pages/auth/sign-up'
import ForgotPasswordPage from '@/pages/auth/forgot-password'
import ResetPasswordPage from '@/pages/auth/reset-password'
import OnboardingPage from '@/pages/onboarding'
import DashboardPage from '@/pages/dashboard'
import PlannerPage from '@/pages/planner'
import TasksPage from '@/pages/tasks'
import HabitsPage from '@/pages/habits'
import WellbeingPage from '@/pages/wellbeing'
import InsightsPage from '@/pages/insights'
import NotificationsPage from '@/pages/notifications'
import SettingsPage from '@/pages/settings'
import NotFoundPage from '@/pages/not-found'

function Protected({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth()
  if (loading) return <SpinnerScreen />
  if (!isAuthenticated) return <Navigate to="/auth/sign-in" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth()
  if (loading) return <SpinnerScreen />
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: '/landing',
    element: <LandingPage />,
  },
  {
    element: (
      <PublicOnly>
        <Outlet />
      </PublicOnly>
    ),
    children: [
      { path: '/auth/sign-in', element: <SignInPage /> },
      { path: '/auth/sign-up', element: <SignUpPage /> },
      { path: '/auth/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/auth/reset-password', element: <ResetPasswordPage /> },
    ],
  },
  {
    path: '/onboarding',
    element: (
      <Protected>
        <OnboardingPage />
      </Protected>
    ),
  },
  {
    element: (
      <Protected>
        <AppShell>
          <Outlet />
        </AppShell>
      </Protected>
    ),
    children: [
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/planner', element: <PlannerPage /> },
      { path: '/tasks', element: <TasksPage /> },
      { path: '/habits', element: <HabitsPage /> },
      { path: '/wellbeing', element: <WellbeingPage /> },
      { path: '/insights', element: <InsightsPage /> },
      { path: '/notifications', element: <NotificationsPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

export default router