import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useSettings } from '@/hooks/queries'
import { AppShell } from '@/layouts/app-shell'
import { SpinnerScreen } from '@/components/common/loading'
import { ErrorScreen } from '@/components/common/error-screen'
import LandingPage from '@/pages/landing'
import SignInPage from '@/pages/auth/sign-in'
import SignUpPage from '@/pages/auth/sign-up'
import ForgotPasswordPage from '@/pages/auth/forgot-password'
import ResetPasswordPage from '@/pages/auth/reset-password'
import AuthCallbackPage from '@/pages/auth/callback'
import OnboardingPage from '@/pages/onboarding'
import DashboardPage from '@/pages/dashboard'
import PlannerPage from '@/pages/planner'
import TasksPage from '@/pages/tasks'
import HabitsPage from '@/pages/habits'
import WellbeingPage from '@/pages/wellbeing'
import CategoriesPage from '@/pages/categories'
import InsightsPage from '@/pages/insights'
import NotificationsPage from '@/pages/notifications'
import SettingsPage from '@/pages/settings'
import NotFoundPage from '@/pages/not-found'

// 3D-heavy / secondary screens load on demand to keep the initial bundle light
const TemplatesPage = lazy(() => import('@/pages/templates'))
const FocusPage = lazy(() => import('@/pages/focus'))
const AssistantPage = lazy(() => import('@/pages/assistant'))

function lazyScreen(element: ReactNode) {
  return <Suspense fallback={<SpinnerScreen />}>{element}</Suspense>
}

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

/**
 * Onboarding sets the things everything else depends on: a display name, the
 * categories tasks get grouped into, and the hours worth planning demanding work
 * in. Without it a brand-new account lands on a dashboard built from defaults,
 * so send them through it first.
 */
function RequireOnboarding({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { data: settings, isPending } = useSettings(user?.id ?? '')
  const location = useLocation()

  if (isPending) return <SpinnerScreen />
  // getSettings() falls back to defaults with onboarded: false, so a user whose
  // row has not loaded yet is still redirected rather than shown a broken day.
  if (settings && !settings.onboarded) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

const errorElement = <ErrorScreen />

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Navigate to="/landing" replace />,
      errorElement,
    },
    {
      path: '/landing',
      element: <LandingPage />,
      errorElement,
    },
    {
      path: '/auth/callback',
      element: <AuthCallbackPage />,
      errorElement,
    },
    {
      errorElement,
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
      errorElement,
      element: (
        <Protected>
          <OnboardingPage />
        </Protected>
      ),
    },
    {
      errorElement,
      element: (
        <Protected>
          <RequireOnboarding>
            <AppShell>
              <Outlet />
            </AppShell>
          </RequireOnboarding>
        </Protected>
      ),
      children: [
        { path: '/dashboard', element: <DashboardPage /> },
        { path: '/planner', element: <PlannerPage /> },
        { path: '/tasks', element: <TasksPage /> },
        { path: '/habits', element: <HabitsPage /> },
        { path: '/wellbeing', element: <WellbeingPage /> },
        { path: '/categories', element: <CategoriesPage /> },
        { path: '/insights', element: <InsightsPage /> },
        { path: '/templates', element: lazyScreen(<TemplatesPage />) },
        { path: '/focus', element: lazyScreen(<FocusPage />) },
        { path: '/assistant', element: lazyScreen(<AssistantPage />) },
        { path: '/notifications', element: <NotificationsPage /> },
        { path: '/settings', element: <SettingsPage /> },
      ],
    },
    { path: '*', element: <NotFoundPage />, errorElement },
  ],
  {
    future: {
      v7_relativeSplatPath: true,
    },
  },
)

export default router