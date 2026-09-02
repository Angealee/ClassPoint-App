import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { ChevronDownIcon, GearIcon, LogOutIcon } from '@/components/ui/icons'
import { useStudentData } from '@/features/student/StudentData'
import { getLevelProgress } from '@/lib/leveling'
import { cn } from '@/lib/cn'

/**
 * The pieces the account surfaces are built from — shared by the desktop
 * sidebar footer and the mobile menu overlay so the two cannot drift.
 *
 * ── WHAT THIS IS *NOT* ANY MORE ────────────────────────────────────────────
 * It briefly held the whole menu — Student Space, Profile, Settings — because
 * Profile had been pulled out of the nav. All three are sidebar links now, so
 * the account block expands to exactly TWO rows: Settings and Sign out. That is
 * why it is a compact popover rather than the tall panel it was; a 360px menu
 * for two items is what made it feel heavy, and what overflowed a short
 * viewport.
 *
 * ⚠ Open state is owned by AppLayout, never here: the nav renders twice
 * (sidebar + tab bar) — see the note on `NavButtonItem` in Shell.tsx.
 */

export interface AccountActions {
  /** Close whatever surface this is in, after navigating. */
  onNavigate: () => void
  /**
   * Ask the layout to start the sign-out flow.
   *
   * The confirmation is a ConfirmDialog, which is a Sheet. Opening it from
   * inside the mobile menu would stack two portalled overlays with competing
   * focus traps, so the layout closes this surface first, then opens the dialog.
   */
  onRequestSignOut: () => void
}

/** Identity: avatar, name, level, and the points figure that links to the ledger. */
export function IdentityBlock({
  onNavigate,
  size = 'md',
}: {
  onNavigate: () => void
  size?: 'md' | 'lg'
}) {
  const { me } = useStudentData()
  const name = me?.display_name ?? 'Student'
  const points = me?.semester_points ?? 0
  const { level } = getLevelProgress(points)
  const lg = size === 'lg'

  return (
    <div className="flex items-center gap-3">
      <Avatar
        name={name}
        url={me?.avatar_url}
        className={lg ? 'h-16 w-16' : 'h-12 w-12'}
        textClassName={lg ? 'text-xl' : 'text-base'}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-display font-bold', lg ? 'text-xl' : 'text-base')}>
          {name}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <span className="shrink-0 font-semibold text-ink">Lv {level}</span>
          <span aria-hidden="true">·</span>
          {/* The one figure that links out — to the ledger, like the home hero. */}
          <Link
            to="/app/history"
            onClick={onNavigate}
            className="shrink-0 font-semibold text-reward underline-offset-2 hover:underline"
          >
            {points} pts
          </Link>
        </p>
      </div>
    </div>
  )
}

/** Shared row geometry, so heights cannot drift between the two surfaces. */
const ROW =
  'flex h-14 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors'

export function SettingsRow({
  onNavigate,
  className,
}: {
  onNavigate: () => void
  className?: string
}) {
  return (
    <Link
      to="/app/settings"
      onClick={onNavigate}
      // `text-ink`, not muted: rendered under five ink-coloured nav rows, a
      // muted Settings reads as DISABLED rather than secondary. Sign out below
      // keeps the muted rest state, because that one really is destructive.
      className={cn(ROW, 'text-ink hover:bg-card-2', className)}
    >
      <GearIcon className="h-5 w-5 shrink-0 text-muted" />
      Settings
    </Link>
  )
}

export function SignOutRow({
  onRequestSignOut,
  className,
}: {
  onRequestSignOut: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onRequestSignOut}
      className={cn(
        ROW,
        // Rests muted and reddens on hover — the same restraint every other
        // destructive control here uses, so a menu never looks alarming at rest.
        'text-muted hover:bg-danger-solid/10 hover:text-danger',
        className,
      )}
    >
      <LogOutIcon className="h-5 w-5 shrink-0" />
      Sign out
    </button>
  )
}

/**
 * Desktop sidebar footer: a compact account row that expands upward into
 * Settings + Sign out.
 *
 * In-flow rather than absolutely positioned, deliberately. The sidebar is a
 * `backdrop-blur-md` ancestor, and an absolutely-positioned popover inside one
 * needs the same portal escape hatch Sheet documents. An in-flow panel needs
 * nothing and cannot be trapped.
 */
export function SidebarAccount({
  open,
  onToggle,
  onNavigate,
  onRequestSignOut,
}: AccountActions & { open: boolean; onToggle: () => void }) {
  const { me } = useStudentData()
  const name = me?.display_name ?? 'Student'
  const { level } = getLevelProgress(me?.semester_points ?? 0)

  return (
    <div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mb-1 flex flex-col gap-0.5 border-b border-line pb-2">
              <SettingsRow onNavigate={onNavigate} />
              <SignOutRow onRequestSignOut={onRequestSignOut} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors',
          open ? 'bg-card-2' : 'hover:bg-card-2',
        )}
      >
        <Avatar name={name} url={me?.avatar_url} className="h-8 w-8" textClassName="text-2xs" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block text-2xs text-muted">Lv {level}</span>
        </span>
        <ChevronDownIcon
          className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>
    </div>
  )
}
