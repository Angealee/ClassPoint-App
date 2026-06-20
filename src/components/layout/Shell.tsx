import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/cn'

export interface NavItem {
  to: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  end?: boolean
}

/**
 * Responsive app shell.
 * - Mobile: sticky top bar + content + fixed bottom tab navigation.
 * - Desktop (md+): persistent left sidebar navigation, wider content area.
 */
export function Shell({
  nav,
  badge,
  actions,
}: {
  nav: NavItem[]
  badge?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl">
      {/* Desktop sidebar */}
      <aside className="theme-transition sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-line bg-canvas/60 px-4 py-5 backdrop-blur-md md:flex">
        <div className="flex items-center gap-2 px-2">
          <Logo className="h-8 w-8" />
          <span className="font-display text-lg font-bold tracking-tight">ClassPoint</span>
          {badge}
        </div>

        <nav className="mt-8 flex flex-col gap-1">
          {nav.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-500/10 text-brand-500'
                    : 'text-muted hover:bg-card-2 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'h-5 w-5',
                      isActive && 'drop-shadow-[0_0_6px_var(--color-brand-500)]',
                    )}
                  />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex items-center justify-between px-1">
          <ThemeToggle />
          {actions}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="theme-transition sticky top-0 z-20 flex items-center justify-between border-b border-line bg-canvas/80 px-4 py-3 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="font-display text-lg font-bold tracking-tight">ClassPoint</span>
            {badge}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {actions}
          </div>
        </header>

        <main className="flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8">
          <div className="mx-auto w-full max-w-2xl">
            <Suspense
              fallback={<div className="py-20 text-center text-sm text-muted">Loading…</div>}
            >
              <Outlet />
            </Suspense>
          </div>
        </main>

        {/* Mobile bottom navigation */}
        <nav className="theme-transition fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-2xl border-t border-line bg-canvas/90 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:hidden">
          <ul className="flex items-center justify-around">
            {nav.map(({ to, label, Icon, end }) => (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex flex-col items-center gap-1 rounded-xl py-1.5 text-xs font-medium transition-colors',
                      isActive ? 'text-brand-500' : 'text-muted hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn(
                          'h-6 w-6',
                          isActive && 'drop-shadow-[0_0_6px_var(--color-brand-500)]',
                        )}
                      />
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
