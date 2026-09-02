import { Suspense, lazy, type ReactNode } from 'react'
import { ProbeMenu } from '@/features/ProbeMenu' // PROBE-TEMP
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RedirectIfAuthed, RequireRole } from '@/features/auth/guards'
import { Splash } from '@/components/layout/Splash'

import { RouteError } from '@/components/layout/RouteError'

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
const Settings = lazy(() =>
  import('@/features/student/Settings').then((m) => ({ default: m.Settings })),
)
const AttendanceStats = lazy(() =>
  import('@/features/student/AttendanceStats').then((m) => ({ default: m.AttendanceStats })),
)
const PointsHistory = lazy(() =>
  import('@/features/student/PointsHistory').then((m) => ({ default: m.PointsHistory })),
)
const SpendBoard = lazy(() =>
  import('@/features/student/SpendBoard').then((m) => ({ default: m.SpendBoard })),
)
const ScanLanding = lazy(() =>
  import('@/features/student/ScanLanding').then((m) => ({ default: m.ScanLanding })),
)
const InstructorLayout = lazy(() =>
  import('@/features/instructor/InstructorLayout').then((m) => ({ default: m.InstructorLayout })),
)
const Students = lazy(() =>
  import('@/features/instructor/Students').then((m) => ({ default: m.Students })),
)
const History = lazy(() =>
  import('@/features/instructor/History').then((m) => ({ default: m.History })),
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
const ManageSemesters = lazy(() =>
  import('@/features/instructor/ManageSemesters').then((m) => ({ default: m.ManageSemesters })),
)
const Redemptions = lazy(() =>
  import('@/features/instructor/Redemptions').then((m) => ({ default: m.Redemptions })),
)
const Ops = lazy(() => import('@/features/instructor/Ops').then((m) => ({ default: m.Ops })))
const StudentRecord = lazy(() =>
  import('@/features/instructor/StudentRecord').then((m) => ({ default: m.StudentRecord })),
)
const StudentReport = lazy(() =>
  import('@/features/instructor/StudentReport').then((m) => ({ default: m.StudentReport })),
)

/** Full-screen Suspense for top-level pages and layouts. */
const withSplash = (node: ReactNode) => <Suspense fallback={<Splash />}>{node}</Suspense>

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthed />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: withSplash(<Landing />) },
      { path: '/signin', element: withSplash(<SignIn />) },
      { path: '/claim', element: withSplash(<Claim />) },
      { path: '/reset', element: withSplash(<ResetPin />) },
      { path: '/macalesideauth', element: withSplash(<InstructorSignIn />) },
    ],
  },

  { path: '/instructor/signin', element: <Navigate to="/" replace /> },

  { path: '/scan', element: withSplash(<ScanLanding />), errorElement: <RouteError /> },

  {
    path: '/app',
    element: <RequireRole role="student" />,
    errorElement: <RouteError />,
    children: [
      {
        element: withSplash(<AppLayout />),
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'leaderboard', element: <Leaderboard /> },
          { path: 'attendance', element: <StudentAttendance /> },
          { path: 'attendance/stats', element: <AttendanceStats /> },
          { path: 'points', element: <UsePoints /> },
          { path: 'settings', element: <Settings /> },
          { path: 'history', element: <PointsHistory /> },
          { path: 'spenders', element: <SpendBoard /> },
          { path: 'profile', element: <Profile /> },
          { path: 'achievements', element: <Achievements /> },
        ],
      },
    ],
  },

  // Instructor
  {
    path: '/teach',
    element: <RequireRole role="instructor" />,
    errorElement: <RouteError />,
    children: [
      {
        element: withSplash(<InstructorLayout />),
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Students /> },
          { path: 'attendance', element: <InstructorAttendance /> },
          { path: 'attendance/session/:sessionId', element: <SessionDetail /> },
          { path: 'redemptions', element: <Redemptions /> },
          { path: 'semesters', element: <ManageSemesters /> },
          { path: 'ops', element: <Ops /> },
          { path: 'student/:studentId', element: <StudentRecord /> },
          { path: 'history', element: <History /> },
          { path: 'leaderboard', element: <InstructorLeaderboard /> },
          { path: 'award', element: <Navigate to="/teach" replace /> },
          {
            path: 'attendance/history',
            element: <Navigate to="/teach/history?tab=attendance" replace />,
          },
        ],
      },
      
      {
        path: 'student/:studentId/report',
        element: withSplash(<StudentReport />),
        errorElement: <RouteError />,
      },
    ],
  },
  { path: '/__probe', element: <ProbeMenu /> }, // PROBE-TEMP
])
