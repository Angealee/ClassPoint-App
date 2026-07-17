import { Suspense, lazy, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RedirectIfAuthed, RequireRole } from '@/features/auth/guards'
import { Splash } from '@/components/layout/Splash'

// Code-split: each screen/layout is fetched on demand to shrink the first load.
const Landing = lazy(() => import('@/features/Landing').then((m) => ({ default: m.Landing })))
const SignIn = lazy(() => import('@/features/auth/SignIn').then((m) => ({ default: m.SignIn })))
const Claim = lazy(() => import('@/features/auth/Claim').then((m) => ({ default: m.Claim })))
const ResetPin = lazy(() =>
  import('@/features/auth/ResetPin').then((m) => ({ default: m.ResetPin })),
)
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
const Achievements = lazy(() =>
  import('@/features/student/Achievements').then((m) => ({ default: m.Achievements })),
)
const StudentAttendance = lazy(() =>
  import('@/features/student/Attendance').then((m) => ({ default: m.Attendance })),
)
const UsePoints = lazy(() =>
  import('@/features/student/UsePoints').then((m) => ({ default: m.UsePoints })),
)
const InstructorLayout = lazy(() =>
  import('@/features/instructor/InstructorLayout').then((m) => ({ default: m.InstructorLayout })),
)
const Students = lazy(() =>
  import('@/features/instructor/Students').then((m) => ({ default: m.Students })),
)
const Award = lazy(() => import('@/features/instructor/Award').then((m) => ({ default: m.Award })))
const AwardHistory = lazy(() =>
  import('@/features/instructor/AwardHistory').then((m) => ({ default: m.AwardHistory })),
)
const InstructorLeaderboard = lazy(() =>
  import('@/features/instructor/InstructorLeaderboard').then((m) => ({
    default: m.InstructorLeaderboard,
  })),
)
const InstructorAttendance = lazy(() =>
  import('@/features/instructor/Attendance').then((m) => ({ default: m.Attendance })),
)
const SessionDetail = lazy(() =>
  import('@/features/instructor/SessionDetail').then((m) => ({ default: m.SessionDetail })),
)
const SessionHistory = lazy(() =>
  import('@/features/instructor/SessionHistory').then((m) => ({ default: m.SessionHistory })),
)
const Redemptions = lazy(() =>
  import('@/features/instructor/Redemptions').then((m) => ({ default: m.Redemptions })),
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
      { path: '/reset', element: withSplash(<ResetPin />) },
      // Instructor sign-in lives at a secret, unlinked path (not surfaced in any
      // UI). Bookmark it to access. The old public path is retired below.
      { path: '/macalesideauth', element: withSplash(<InstructorSignIn />) },
    ],
  },

  // Retired public instructor path — dead-ends to the landing page so the login
  // can't be reached (or fingerprinted) the obvious way.
  { path: '/instructor/signin', element: <Navigate to="/" replace /> },

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
          { path: 'attendance', element: <StudentAttendance /> },
          { path: 'points', element: <UsePoints /> },
          { path: 'profile', element: <Profile /> },
          { path: 'achievements', element: <Achievements /> },
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
          { index: true, element: <Students /> },
          { path: 'award', element: <Award /> },
          { path: 'attendance', element: <InstructorAttendance /> },
          { path: 'attendance/history', element: <SessionHistory /> },
          { path: 'attendance/session/:sessionId', element: <SessionDetail /> },
          { path: 'redemptions', element: <Redemptions /> },
          { path: 'history', element: <AwardHistory /> },
          { path: 'leaderboard', element: <InstructorLeaderboard /> },
        ],
      },
    ],
  },
])
