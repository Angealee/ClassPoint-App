import { Suspense, lazy, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { RedirectIfAuthed, RequireRole } from '@/features/auth/guards'
import { Splash } from '@/components/layout/Splash'

// Code-split: each screen/layout is fetched on demand to shrink the first load.
const Landing = lazy(() => import('@/features/Landing').then((m) => ({ default: m.Landing })))
const SignIn = lazy(() => import('@/features/auth/SignIn').then((m) => ({ default: m.SignIn })))
const Claim = lazy(() => import('@/features/auth/Claim').then((m) => ({ default: m.Claim })))
const InstructorSignIn = lazy(() =>
  import('@/features/auth/InstructorSignIn').then((m) => ({ default: m.InstructorSignIn })),
)
const AppLayout = lazy(() =>
  import('@/components/layout/AppLayout').then((m) => ({ default: m.AppLayout })),
)
const Dashboard = lazy(() =>
  import('@/features/student/Dashboard').then((m) => ({ default: m.Dashboard })),
)
const Leaderboard = lazy(() =>
  import('@/features/student/Leaderboard').then((m) => ({ default: m.Leaderboard })),
)
const Profile = lazy(() => import('@/features/student/Profile').then((m) => ({ default: m.Profile })))
const InstructorLayout = lazy(() =>
  import('@/features/instructor/InstructorLayout').then((m) => ({ default: m.InstructorLayout })),
)
const Roster = lazy(() => import('@/features/instructor/Roster').then((m) => ({ default: m.Roster })))
const Award = lazy(() => import('@/features/instructor/Award').then((m) => ({ default: m.Award })))
const InstructorLeaderboard = lazy(() =>
  import('@/features/instructor/InstructorLeaderboard').then((m) => ({
    default: m.InstructorLeaderboard,
  })),
)

/** Full-screen Suspense for top-level pages and layouts. */
const withSplash = (node: ReactNode) => <Suspense fallback={<Splash />}>{node}</Suspense>

export const router = createBrowserRouter([
  // Public + auth screens — already-signed-in users are bounced to their home,
  // so pressing Back after logging in never lands on the landing/login pages.
  {
    element: <RedirectIfAuthed />,
    children: [
      { path: '/', element: withSplash(<Landing />) },
      { path: '/signin', element: withSplash(<SignIn />) },
      { path: '/claim', element: withSplash(<Claim />) },
      { path: '/instructor/signin', element: withSplash(<InstructorSignIn />) },
    ],
  },

  // Student area. (Child screens lazy-load inside the Shell's own Suspense.)
  {
    path: '/app',
    element: <RequireRole role="student" />,
    children: [
      {
        element: withSplash(<AppLayout />),
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'leaderboard', element: <Leaderboard /> },
          { path: 'profile', element: <Profile /> },
        ],
      },
    ],
  },

  // Instructor area.
  {
    path: '/teach',
    element: <RequireRole role="instructor" />,
    children: [
      {
        element: withSplash(<InstructorLayout />),
        children: [
          { index: true, element: <Roster /> },
          { path: 'award', element: <Award /> },
          { path: 'leaderboard', element: <InstructorLeaderboard /> },
        ],
      },
    ],
  },
])
