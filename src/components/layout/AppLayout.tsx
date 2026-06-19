import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { HomeIcon, TrophyIcon, UserIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import type { ComponentType, SVGProps } from 'react'

interface NavItem {
  to: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

const studentNav: NavItem[] = [
  { to: '/app', label: 'Home', Icon: HomeIcon },
  { to: '/app/leaderboard', label: 'Ranks', Icon: TrophyIcon },
  { to: '/app/profile', label: 'Profile', Icon: UserIcon },
]

/** Shared shell: sticky top bar + content + mobile bottom navigation. */
export function AppLayout() {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col">
      <header className="theme-transition sticky top-0 z-20 flex items-center justify-between border-b border-line bg-canvas/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Logo className="h-7 w-7" />
          <span className="font-display text-lg font-bold tracking-tight">ClassPoint</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex-1 px-4 pb-28 pt-5">
        <Outlet />
      </main>

      <nav className="theme-transition fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-2xl border-t border-line bg-canvas/90 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
        <ul className="flex items-center justify-around">
          {studentNav.map(({ to, label, Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={to === '/app'}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 rounded-xl py-1.5 text-xs font-medium transition-colors',
                    isActive ? 'text-brand-500' : 'text-muted hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={cn('h-6 w-6', isActive && 'drop-shadow-[0_0_6px_var(--color-brand-500)]')} />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
