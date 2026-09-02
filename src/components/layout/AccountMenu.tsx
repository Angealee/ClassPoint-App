import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { Card, Rows } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { ChevronDownIcon, LogOutIcon } from '@/components/ui/icons'
import { useStudentData } from '@/features/student/StudentData'
import { getLevelProgress } from '@/lib/leveling'
import { cn } from '@/lib/cn'

/**
 * The student account menu — one definition, two presentations.
 *
 * It replaced the Profile tab: Profile, Settings and the new Student Space all
 * live behind it now, with the student's identity (avatar, name, level, points)
 * as its header. `AccountMenuPanel` is the shared content; the mobile Sheet and
 * the desktop sidebar block both render it, so the two can never drift.
 *
 * ⚠ NO STATE THAT MATTERS LIVES HERE. The nav renders twice (sidebar + tab
 * bar), so the open state is owned by AppLayout — see the note on
 * `NavButtonItem` in Shell.tsx. The one piece of local state below (the
 * sign-out reveal) is deliberately disposable: it resets whenever the menu
 * closes, and two copies disagreeing about it would be invisible anyway
 * because only one presentation is mounted at a time.
 */

interface PanelProps {
  /** Close the menu — every row calls this after navigating. */
  onNavigate: () => void
  /**
   * Ask the layout to start the sign-out flow.
   *
   * The confirmation is a ConfirmDialog, which is itself a Sheet. Opening it
   * from inside the mobile menu Sheet would stack two portalled dialogs with
   * two competing focus traps, so the layout CLOSES this menu first and then
   * opens the dialog. That is why this is a callback and not a local dialog.
   */
  onRequestSignOut: () => void
  /** True once Student Space is reachable (wired in Phase 2). */
  spaceEnabled?: boolean
}

/**
 * The shared geometry of one menu row.
 *
 * ⚠ THE HEIGHT IS EXPLICIT ON PURPOSE. With padding alone the three rows
 * measured 49 / 57 / 56px — the `text-lg` chevron is taller than the small
 * "Coming soon" chip, and the unseen-achievements dot nudged a third value out
 * of the same markup. Three heights in a three-row list reads as sloppy at a
 * glance without being obviously wrong, which is the worst kind of visual bug.
 * `h-14` pins all of them at 56.
 */
const ROW_SHELL =
  'flex h-14 items-center justify-between gap-3 px-4 text-sm font-medium'

/** One tappable row. Bare label + chevron — the user's call, no subtitles. */
function MenuRow({
  to,
  label,
  onNavigate,
  trailing,
}: {
  to: string
  label: string
  onNavigate: () => void
  trailing?: ReactNode
}) {
  return (
    <Link to={to} onClick={onNavigate} className={cn(ROW_SHELL, 'transition-colors hover:bg-card-2')}>
      <span className="min-w-0 truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {trailing}
        <span className="text-lg leading-none text-muted">›</span>
      </span>
    </Link>
  )
}

/**
 * The locked Student Space row, for students outside a beta section.
 *
 * No leading lock icon: Profile and Settings carry none, and the odd one out
 * would read as a different KIND of row rather than the same row unavailable.
 * The muted label and the chip say it without breaking the parallel.
 */
function LockedSpaceRow() {
  return (
    <div className={cn(ROW_SHELL, 'cursor-default text-muted')}>
      <span className="min-w-0 truncate">Student Space</span>
      {/* "Soon", not "Coming soon". Measured in the 240px desktop sidebar: the
          row is 205px, and the longer chip took 80 of it — leaving the label 81
          where it needs 98, so "Student Space" truncated to "Student S…". A
          one-word chip also pairs correctly with the "BETA" chip it becomes. */}
      <Chip tone="neutral" size="sm">
        Soon
      </Chip>
    </div>
  )
}

export function AccountMenuPanel({ onNavigate, onRequestSignOut, spaceEnabled }: PanelProps) {
  const { me, hasUnseenAchievements } = useStudentData()
  const [signOutShown, setSignOutShown] = useState(false)

  // A menu that reopens should not still be showing the sign-out affordance
  // from last time — that is a destructive control appearing unasked-for.
  useEffect(() => () => setSignOutShown(false), [])

  const name = me?.display_name ?? 'Student'
  const points = me?.semester_points ?? 0
  const { level } = getLevelProgress(points)

  return (
    <div className="space-y-3">
      {/* ── Identity header ─────────────────────────────────────────────────
          Not a button as a whole: that was the wrong target on the Dashboard
          hero and it is the wrong target here, with three explicit rows
          directly beneath it. Only the avatar and the points figure act. */}
      <Card pad="tight">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSignOutShown((v) => !v)}
            aria-expanded={signOutShown}
            aria-label={signOutShown ? 'Hide sign out' : 'Show sign out'}
            className="relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Avatar name={name} url={me?.avatar_url} className="h-12 w-12" textClassName="text-base" />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-card text-muted">
              <ChevronDownIcon
                className={cn('h-2.5 w-2.5 transition-transform', signOutShown && 'rotate-180')}
              />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-bold">{name}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span className="shrink-0 font-semibold text-ink">Lv {level}</span>
              <span aria-hidden="true">·</span>
              {/* The one figure that links out — to the ledger, like the hero. */}
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

        <AnimatePresence initial={false}>
          {signOutShown && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <button
                type="button"
                onClick={onRequestSignOut}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-muted transition-colors hover:border-danger-solid/30 hover:bg-danger-solid/10 hover:text-danger"
              >
                <LogOutIcon className="h-4 w-4" />
                Sign out
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* ── Destinations ───────────────────────────────────────────────────── */}
      <Rows>
        {spaceEnabled ? (
          <MenuRow
            to="/app/space"
            label="Student Space"
            onNavigate={onNavigate}
            trailing={
              <Chip tone="accent" size="sm">
                BETA
              </Chip>
            }
          />
        ) : (
          <LockedSpaceRow />
        )}
        <MenuRow
          to="/app/profile"
          label="Profile"
          onNavigate={onNavigate}
          trailing={
            hasUnseenAchievements ? (
              <span
                className="h-2 w-2 rounded-full bg-accent-solid"
                aria-label="New achievements"
              />
            ) : undefined
          }
        />
        <MenuRow to="/app/settings" label="Settings" onNavigate={onNavigate} />
      </Rows>
    </div>
  )
}

/**
 * The desktop presentation: a compact account row pinned to the bottom of the
 * sidebar, with the panel expanding UPWARD above it.
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
  spaceEnabled,
}: PanelProps & { open: boolean; onToggle: () => void }) {
  const { me, hasUnseenAchievements } = useStudentData()
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
            {/* Capped so the footer can never outgrow a short viewport; the
                account row below must stay reachable at every window height. */}
            <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto overflow-x-hidden pb-2">
              <AccountMenuPanel
                onNavigate={onNavigate}
                onRequestSignOut={onRequestSignOut}
                spaceEnabled={spaceEnabled}
              />
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
        <span className="relative shrink-0">
          <Avatar name={name} url={me?.avatar_url} className="h-8 w-8" textClassName="text-2xs" />
          {hasUnseenAchievements && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent-solid ring-2 ring-canvas" />
          )}
        </span>
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
