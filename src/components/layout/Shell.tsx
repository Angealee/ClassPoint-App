import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { RouteFallback } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { tap } from '@/lib/motion'

function RoutedOutlet() {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className="cp-route-in">
      <Outlet />
    </div>
  )
}

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>

export interface NavLinkItem {
  kind?: 'link'
  to: string
  label: string
  Icon: NavIcon
  end?: boolean
  /**
   * A path prefix that should NOT light this item up even though `to` matches it.
   * '/app/space/people' sits under '/app/space', and without this both would be
   * highlighted at once.
   */
  exclude?: string
  dot?: boolean
  badge?: ReactNode
}

export interface NavButtonItem {
  kind: 'button'
  /** Stable React key — a button has no `to` to key on. */
  id: string
  label: string
  Icon: NavIcon
  dot?: boolean
  active?: boolean
  onClick: () => void
}

export type NavItem = NavLinkItem | NavButtonItem

/** NavLink's own isActive, minus any sibling route the item says it does not own. */
export function useNavActive() {
  const { pathname } = useLocation()
  return (isActive: boolean, item: NavLinkItem) =>
    isActive &&
    !(item.exclude && (pathname === item.exclude || pathname.startsWith(item.exclude + '/')))
}

const navKey = (item: NavItem) => (item.kind === 'button' ? item.id : item.to)

function NavBody({
  Icon,
  label,
  dot,
  badge,
  isActive,
  surface,
  reduce,
  compact,
}: {
  Icon: NavIcon
  label: string
  dot?: boolean
  badge?: ReactNode
  isActive: boolean
  surface: 'sidebar' | 'tab'
  reduce: boolean | null
  compact?: boolean
}) {
  const sidebar = surface === 'sidebar'
  const glyph = (
    <>
      <Icon
        className={cn(
          sidebar ? 'h-5 w-5' : 'h-6 w-6',
          isActive && 'drop-shadow-[0_0_6px_var(--color-accent-solid)]',
        )}
      />
      {/* In the icon rail there is no room for a count, so a badge becomes a dot. */}
      {(dot || (compact && !!badge)) && (
        <span
          className={cn(
            'absolute -right-1 h-2 w-2 rounded-full bg-accent-solid ring-2 ring-canvas',
            sidebar ? '-top-1' : '-top-0.5',
          )}
        />
      )}
    </>
  )

  return (
    <>
      {sidebar ? (
        <span className="relative">{glyph}</span>
      ) : (
        <motion.span
          className="relative"
          // Springy squish on tap — skipped for reduced-motion.
          whileTap={reduce ? undefined : { scale: 0.82 }}
          transition={tap}
        >
          {glyph}
        </motion.span>
      )}
      {sidebar ? (
        compact ? (
          <span className="sr-only">{label}</span>
        ) : (
          <span className="min-w-0 flex-1 truncate">{label}</span>
        )
      ) : (
        label
      )}
      {sidebar && !compact && badge}
    </>
  )
}

const sidebarClasses = (isActive: boolean, compact = false) =>
  cn(
    'flex items-center rounded-xl text-sm font-medium transition-colors',
    compact ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
    isActive ? 'bg-accent-solid/10 text-accent' : 'text-muted hover:bg-card-2 hover:text-ink',
  )

const tabClasses = (isActive: boolean) =>
  cn(
    'flex flex-col items-center gap-1 rounded-xl py-1.5 text-xs font-medium transition-colors',
    isActive ? 'text-accent' : 'text-muted hover:text-ink',
  )

export function Shell({
  nav,
  tabNav = nav,
  badge,
  actions,
  sidebarActions,
  accountSlot,
  width = 'reading',
}: {
  nav: NavItem[]
  tabNav?: NavItem[]
  badge?: ReactNode
  actions?: ReactNode
  /** Desktop sidebar footer only; falls back to `actions`. Lets items that live in the sidebar nav leave the footer row. */
  sidebarActions?: ReactNode
  accountSlot?: ReactNode
  width?: 'reading' | 'wide' | 'full'
}) {
  const reduce = useReducedMotion()
  const navActive = useNavActive()
  const wide = width !== 'reading'
  const full = width === 'full'
  return (
    <div
      className={cn(
        'flex',
        full ? 'min-h-[100dvh] md:h-[100dvh] md:overflow-hidden' : 'min-h-[100dvh]',
        full
          ?
            'w-full max-w-none'
          : wide
            ?
              'ml-[max(0rem,calc((100%-72rem)/2))] mr-0 w-auto max-w-none'
            : 'mx-auto w-full max-w-6xl',
      )}
    >
      <aside className={cn(
          'theme-transition sticky top-0 hidden h-[100dvh] shrink-0 flex-col border-r border-line bg-canvas py-5 md:flex',
          full ? 'w-16 px-2' : 'w-64 px-4',
        )}>
        <div
          className={cn('flex items-center gap-2', full ? 'justify-center' : 'px-2')}
          title={full ? 'ClassPoint' : undefined}
        >
          <Logo className="h-8 w-8 shrink-0" />
          <span
            className={cn('font-display text-lg font-bold tracking-tight', full && 'sr-only')}
          >
            ClassPoint
          </span>
          <span className={cn(full && 'sr-only')}>{badge}</span>
        </div>

        <nav className="mt-8 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
          {nav.map((item) =>
            item.kind === 'button' ? (
              <button
                key={navKey(item)}
                type="button"
                onClick={item.onClick}
                aria-expanded={item.active}
                aria-haspopup="menu"
                className={cn(sidebarClasses(!!item.active, full), 'text-left')}
              >
                <NavBody
                  Icon={item.Icon}
                  label={item.label}
                  dot={item.dot}
                  isActive={!!item.active}
                  surface="sidebar"
                  reduce={reduce}
                  compact={full}
                />
              </button>
            ) : (
              <NavLink
                key={navKey(item)}
                to={item.to}
                end={item.end}
                className={({ isActive }) => sidebarClasses(navActive(isActive, item), full)}
              >
                {({ isActive: active }) => (
                  <NavBody
                    Icon={item.Icon}
                    label={item.label}
                    dot={item.dot}
                    badge={item.badge}
                    isActive={navActive(active, item)}
                    surface="sidebar"
                    reduce={reduce}
                    compact={full}
                  />
                )}
              </NavLink>
            ),
          )}
        </nav>

        <div className="shrink-0 space-y-3 pt-3">
          <div className={cn('flex items-center', full ? 'flex-col gap-2' : 'justify-between px-1')}>
            <ThemeToggle className={full ? 'w-10' : undefined} />
            <div className={cn(full && 'flex flex-col items-center [&>div]:flex-col')}>
              {sidebarActions ?? actions}
            </div>
          </div>
          {accountSlot}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="theme-transition sticky top-0 z-20 flex items-center justify-between border-b border-line bg-canvas/80 px-4 py-3 backdrop-blur-md md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <Logo className="h-7 w-7 shrink-0" />
            <span
              className={cn(
                'font-display text-lg font-bold tracking-tight',
                !!badge && 'hidden min-[480px]:inline',
              )}
            >
              ClassPoint
            </span>
            {badge && <span className="hidden min-[480px]:contents">{badge}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            {actions}
          </div>
        </header>

        <main
          className={cn(
            'flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8',
            wide && 'flex flex-col',
            full && 'md:min-h-0 md:overflow-hidden md:pb-6',
          )}
        >
          <div
            className={cn(
              'mx-auto w-full',
              wide
                ? 'flex max-w-none flex-1 flex-col [&>.cp-route-in]:flex [&>.cp-route-in]:flex-1 [&>.cp-route-in]:flex-col'
                : 'max-w-2xl',
              full && 'md:min-h-0 [&>.cp-route-in]:md:min-h-0',
            )}
          >
            <Suspense fallback={<RouteFallback />}>
              <RoutedOutlet />
            </Suspense>
          </div>
        </main>

        {/* Mobile bottom navigation */}
        <nav className="theme-transition fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-2xl border-t border-line bg-canvas/90 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:hidden">
          <ul className="flex items-center justify-around">
            {tabNav.map((item) => (
              <li key={navKey(item)} className="flex-1">
                {item.kind === 'button' ? (
                  <button
                    type="button"
                    onClick={item.onClick}
                    aria-expanded={item.active}
                    aria-haspopup="menu"
                    className={cn(tabClasses(!!item.active), 'w-full')}
                  >
                    <NavBody
                      Icon={item.Icon}
                      label={item.label}
                      dot={item.dot}
                      isActive={!!item.active}
                      surface="tab"
                      reduce={reduce}
                    />
                  </button>
                ) : (
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => tabClasses(isActive)}
                  >
                    {({ isActive }) => (
                      <NavBody
                        Icon={item.Icon}
                        label={item.label}
                        dot={item.dot}
                        isActive={isActive}
                        surface="tab"
                        reduce={reduce}
                      />
                    )}
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
