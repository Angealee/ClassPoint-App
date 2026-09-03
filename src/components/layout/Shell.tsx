import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { RouteFallback } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'

/**
 * The routed screen, with a subtle enter-only fade+rise on each navigation.
 * Keyed by pathname so the CSS animation replays on route change but NOT on a
 * same-route re-render (which would restart it mid-interaction). See the
 * `.cp-route-in` comment in index.css for why this is CSS, not a transform that
 * lingers and breaks fixed-position sheets.
 */
function RoutedOutlet() {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className="cp-route-in">
      <Outlet />
    </div>
  )
}

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>

/** A nav entry that routes. The original shape, and still the default. */
export interface NavLinkItem {
  kind?: 'link'
  to: string
  label: string
  Icon: NavIcon
  end?: boolean
  /** Shows a small "attention" dot on the item (e.g. new achievements). */
  dot?: boolean
  /**
   * Trailing slot in the SIDEBAR only — e.g. the BETA chip on Student Space.
   * The bottom tab bar deliberately ignores it: a tab is an icon over a 12px
   * label with ~90px to work in, and a chip there would either wrap or clip.
   */
  badge?: ReactNode
}

/**
 * A nav entry that ACTS instead of routing — the student "Menu" tab.
 *
 * `kind` is optional on the link variant above precisely so this union is
 * additive: every existing nav array (notably the instructor's) still compiles
 * and renders unchanged.
 *
 * ⚠ THE STATE MUST NOT LIVE IN THE NAV ITEM. `nav` is rendered TWICE — desktop
 * sidebar and mobile tab bar — exactly like the `actions` slot, and at the `md`
 * boundary both are in the DOM at once. A button holding its own `useState`
 * would give you two independent menus that disagree with each other. Hoist the
 * open state to the layout and pass `active` + `onClick` down.
 */
export interface NavButtonItem {
  kind: 'button'
  /** Stable React key — a button has no `to` to key on. */
  id: string
  label: string
  Icon: NavIcon
  dot?: boolean
  /** Drives the accent styling, since there is no route to match against. */
  active?: boolean
  onClick: () => void
}

export type NavItem = NavLinkItem | NavButtonItem

const navKey = (item: NavItem) => (item.kind === 'button' ? item.id : item.to)

/**
 * The icon + dot + label of one nav entry, identical for links and buttons.
 *
 * Factored out so the four render paths (sidebar/tab × link/button) cannot
 * drift: the icon size and the dot's vertical offset differ between the two
 * surfaces, and those numbers now exist once each instead of twice.
 */
function NavBody({
  Icon,
  label,
  dot,
  badge,
  isActive,
  surface,
  reduce,
}: {
  Icon: NavIcon
  label: string
  dot?: boolean
  badge?: ReactNode
  isActive: boolean
  surface: 'sidebar' | 'tab'
  reduce: boolean | null
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
      {dot && (
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
          transition={{ type: 'spring', stiffness: 600, damping: 20 }}
        >
          {glyph}
        </motion.span>
      )}
      {sidebar ? <span className="min-w-0 flex-1 truncate">{label}</span> : label}
      {sidebar && badge}
    </>
  )
}

const sidebarClasses = (isActive: boolean) =>
  cn(
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
    isActive ? 'bg-accent-solid/10 text-accent' : 'text-muted hover:bg-card-2 hover:text-ink',
  )

const tabClasses = (isActive: boolean) =>
  cn(
    'flex flex-col items-center gap-1 rounded-xl py-1.5 text-xs font-medium transition-colors',
    isActive ? 'text-accent' : 'text-muted hover:text-ink',
  )

/**
 * Responsive app shell.
 * - Mobile: sticky top bar + content + fixed bottom tab navigation.
 * - Desktop (md+): persistent left sidebar navigation, wider content area.
 */
export function Shell({
  nav,
  tabNav = nav,
  badge,
  actions,
  accountSlot,
  wide = false,
}: {
  /** The desktop sidebar's nav. Also the mobile tab bar's, unless `tabNav` overrides. */
  nav: NavItem[]
  /**
   * The mobile bottom tab bar, when it must differ from the sidebar.
   *
   * The student sidebar lists five destinations; a phone comfortably fits four
   * tabs, so the student passes a shorter array here and the full list lives in
   * the menu overlay instead. Defaults to `nav`, so the instructor — who wants
   * the same four in both places — passes nothing and is unaffected.
   */
  tabNav?: NavItem[]
  badge?: ReactNode
  actions?: ReactNode
  /**
   * Pinned to the BOTTOM of the desktop sidebar, below the theme/actions row —
   * the student account block. The instructor passes nothing, and their sidebar
   * footer then renders exactly as it did before this slot existed.
   */
  accountSlot?: ReactNode
  /**
   * Let the routed screen use the whole width instead of the 672px reading
   * column — for a chat room, whose side panel needs somewhere to be.
   *
   * It grows to the RIGHT ONLY (the user's call). The left margin is the one a
   * centred `max-w-6xl` would have had, so the sidebar does not jump sideways
   * when you open a room and jump back when you leave it — only the dead strip
   * on the right is spent. `mx-auto` cannot express that, hence the explicit
   * margin; `max(0rem, …)` collapses it on anything narrower than the cap.
   *
   * ⚠ The mobile tab bar keeps `max-w-2xl` regardless — it is `md:hidden` and a
   * phone has no room to widen into.
   */
  wide?: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <div
      className={cn(
        'flex min-h-[100dvh]',
        wide
          ? // `w-auto`, NOT `w-full`: with a left margin, `width: 100%` measures
            // the FULL viewport and then gets pushed right by the margin, which
            // overflowed the page by exactly that margin. Auto width lets the
            // margin box fill what is left.
            'ml-[max(0rem,calc((100%-72rem)/2))] mr-0 w-auto max-w-none'
          : 'mx-auto w-full max-w-6xl',
      )}
    >
      {/* Desktop sidebar.
          w-64, not w-60: at 240px the "Student Space" label had exactly ONE
          pixel of slack beside its BETA chip (label box 97px, text 98px) and
          truncated to "Student Spa…". One pixel is not a margin — it fails on
          any font fallback or browser zoom. 256px leaves 15px. */}
      <aside className="theme-transition sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col border-r border-line bg-canvas/60 px-4 py-5 backdrop-blur-md md:flex">
        <div className="flex items-center gap-2 px-2">
          <Logo className="h-8 w-8" />
          <span className="font-display text-lg font-bold tracking-tight">ClassPoint</span>
          {badge}
        </div>

        {/* The nav SCROLLS and the footer is pinned. Measured at 800x560 with the
            account menu open: with a plain `mt-auto` footer the expanded panel
            ran 58px past the bottom of this `h-[100dvh]` aside, whose overflow
            is `visible` and which cannot scroll — so the account row and the
            last menu rows were simply unreachable on a short laptop window.
            `flex-1 min-h-0` gives the nav the slack instead. */}
        <nav className="mt-8 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
          {nav.map((item) =>
            item.kind === 'button' ? (
              <button
                key={navKey(item)}
                type="button"
                onClick={item.onClick}
                aria-expanded={item.active}
                aria-haspopup="menu"
                className={cn(sidebarClasses(!!item.active), 'text-left')}
              >
                <NavBody
                  Icon={item.Icon}
                  label={item.label}
                  dot={item.dot}
                  isActive={!!item.active}
                  surface="sidebar"
                  reduce={reduce}
                />
              </button>
            ) : (
              <NavLink
                key={navKey(item)}
                to={item.to}
                end={item.end}
                className={({ isActive }) => sidebarClasses(isActive)}
              >
                {({ isActive }) => (
                  <NavBody
                    Icon={item.Icon}
                    label={item.label}
                    dot={item.dot}
                    badge={item.badge}
                    isActive={isActive}
                    surface="sidebar"
                    reduce={reduce}
                  />
                )}
              </NavLink>
            ),
          )}
        </nav>

        {/* Controls row first, then the account block flush to the bottom edge,
            so the menu expands UP into empty sidebar space and never into these. */}
        <div className="shrink-0 space-y-3 pt-3">
          <div className="flex items-center justify-between px-1">
            <ThemeToggle />
            {actions}
          </div>
          {accountSlot}
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

        {/* When `wide`, the whole chain from <main> down to the routed screen
            becomes a column flex so a screen can put something at the BOTTOM of
            the viewport without knowing how tall this chrome is. `main` is
            already `flex-1` inside a `min-h-[100dvh]` column, so the height
            comes from the layout that exists rather than from a
            `calc(100dvh - …)` that has to agree with four paddings.
            `[&>.cp-route-in]` reaches the route wrapper, which `RoutedOutlet`
            owns and cannot be given a class from here. */}
        <main
          className={cn(
            'flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-12 md:pt-8',
            wide && 'flex flex-col',
          )}
        >
          <div
            className={cn(
              'mx-auto w-full',
              wide
                ? 'flex max-w-none flex-1 flex-col [&>.cp-route-in]:flex [&>.cp-route-in]:flex-1 [&>.cp-route-in]:flex-col'
                : 'max-w-2xl',
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
