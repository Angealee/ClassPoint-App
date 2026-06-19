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
  if (!session) return <Navigate to={role === 'instructor' ? '/instructor/signin' : '/signin'} replace />
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
