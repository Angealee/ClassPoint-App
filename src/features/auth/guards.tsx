import { Navigate, Outlet } from 'react-router-dom'
import { Splash } from '@/components/layout/Splash'
import { useAuth, type Role } from '@/lib/auth'

function homeFor(role: Role | null): string {
  if (role === 'instructor') return '/teach'
  if (role === 'student') return '/app'
  return '/signin'
}

/** Gate a route to a specific role; redirect elsewhere otherwise. */
export function RequireRole({ role }: { role: Role }) {
  const { loading, session, role: current } = useAuth()
  if (loading) return <Splash />
  // Unauthenticated: students go to their sign-in; would-be instructors are sent
  // to the landing page, never to the secret instructor URL (so it stays hidden).
  if (!session) return <Navigate to={role === 'instructor' ? '/' : '/signin'} replace />
  if (current !== role) return <Navigate to={homeFor(current)} replace />
  return <Outlet />
}

/** Send already-signed-in users away from the auth screens. */
export function RedirectIfAuthed() {
  const { loading, role } = useAuth()
  if (loading) return <Splash />
  if (role) return <Navigate to={homeFor(role)} replace />
  return <Outlet />
}
