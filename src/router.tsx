import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Landing } from '@/features/Landing'
import { SignIn } from '@/features/auth/SignIn'
import { Claim } from '@/features/auth/Claim'
import { InstructorSignIn } from '@/features/auth/InstructorSignIn'
import { RedirectIfAuthed, RequireRole } from '@/features/auth/guards'
import { Dashboard } from '@/features/student/Dashboard'
import { Leaderboard } from '@/features/student/Leaderboard'
import { Profile } from '@/features/student/Profile'
import { InstructorLayout } from '@/features/instructor/InstructorLayout'
import { Roster } from '@/features/instructor/Roster'
import { Award } from '@/features/instructor/Award'
import { InstructorLeaderboard } from '@/features/instructor/InstructorLeaderboard'

export const router = createBrowserRouter([
  { path: '/', element: <Landing /> },

  // Auth screens — bounce already-signed-in users to their home.
  {
    element: <RedirectIfAuthed />,
    children: [
      { path: '/signin', element: <SignIn /> },
      { path: '/claim', element: <Claim /> },
      { path: '/instructor/signin', element: <InstructorSignIn /> },
    ],
  },

  // Student area.
  {
    path: '/app',
    element: <RequireRole role="student" />,
    children: [
      {
        element: <AppLayout />,
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
        element: <InstructorLayout />,
        children: [
          { index: true, element: <Roster /> },
          { path: 'award', element: <Award /> },
          { path: 'leaderboard', element: <InstructorLeaderboard /> },
        ],
      },
    ],
  },
])
