import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Shell, type NavItem } from '@/components/layout/Shell'
import { AccountMenuPanel, SidebarAccount } from '@/components/layout/AccountMenu'
import { StudentDataProvider, useStudentData } from '@/features/student/StudentData'
import { LevelUpBurst } from '@/components/ui/LevelUpBurst'
import { AchievementUnlockBurst } from '@/components/achievements/AchievementUnlockBurst'
import { WhatsNew } from '@/features/WhatsNew'
import { AwayRecap } from '@/features/student/AwayRecap'
import { NotificationsSheet } from '@/features/student/Notifications'
import { Onboarding } from '@/features/student/Onboarding'
import { Sheet } from '@/components/ui/Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/lib/auth'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { LATEST_VERSION, setSeenVersion } from '@/lib/changelog'
import { BellIcon, HomeIcon, MenuIcon, ScanIcon, TrophyIcon } from '@/components/ui/icons'

const ONBOARDED_KEY = 'cp_onboarded'

/**
 * Three routed tabs plus the menu.
 *
 * Profile lost its tab when the account menu arrived — it is a row in the menu
 * now, which is why `routes.test.ts` gained `/app/profile`: the nav array is no
 * longer the thing that keeps it reachable.
 */
const routedTabs = [
  { to: '/app', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/app/leaderboard', label: 'Ranks', Icon: TrophyIcon },
  { to: '/app/attendance', label: 'Attend', Icon: ScanIcon },
] as const

/**
 * Bell + unread badge, rendered into the Shell's `actions` slot (mobile header
 * and desktop sidebar footer both get it for free). Opening the sheet marks
 * everything read.
 */
function NotificationBell() {
  const { unreadCount } = useStudentData()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card-2 text-muted transition-colors hover:text-ink"
      >
        <BellIcon className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <motion.span
            // Pops on every increment so a new arrival is felt, not just seen.
            key={unreadCount}
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 600, damping: 18 }}
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-solid px-1 text-2xs font-bold tabular-nums text-white ring-2 ring-canvas"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>
      <NotificationsSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * The shell with a live nav, plus the account menu.
 *
 * ⚠ `menuOpen` lives HERE, not in the nav item. Shell renders `nav` twice — the
 * desktop sidebar and the mobile tab bar — so a button owning its own state
 * would produce two menus that disagree. Same rule as the `actions` slot.
 *
 * The two presentations are chosen in JS rather than with `md:` classes because
 * the mobile one is a Sheet, and a Sheet portals to <body>: a `md:hidden`
 * wrapper around it would style nothing and both would open on a desktop
 * viewport. See the note in lib/useIsDesktop.ts.
 */
function StudentShell() {
  const { hasUnseenAchievements } = useStudentData()
  const { signOut } = useAuth()
  const isDesktop = useIsDesktop()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  // Sign out is confirmed in a ConfirmDialog, which is itself a Sheet. Close
  // the menu FIRST so two portalled dialogs never stack their focus traps.
  const requestSignOut = () => {
    setMenuOpen(false)
    setSignOutOpen(true)
  }

  const nav = useMemo<NavItem[]>(
    () => [
      ...routedTabs.map((t) => ({ ...t })),
      {
        kind: 'button' as const,
        id: 'menu',
        label: 'Menu',
        Icon: MenuIcon,
        // The dot followed Profile into the menu, so it lands on the tab that
        // now leads there — and is repeated on the Profile row inside.
        dot: hasUnseenAchievements,
        active: menuOpen,
        onClick: () => setMenuOpen((v) => !v),
      },
    ],
    [hasUnseenAchievements, menuOpen],
  )

  return (
    <>
      <Shell
        nav={nav}
        actions={<NotificationBell />}
        accountSlot={
          isDesktop ? (
            <SidebarAccount
              open={menuOpen}
              onToggle={() => setMenuOpen((v) => !v)}
              onNavigate={closeMenu}
              onRequestSignOut={requestSignOut}
            />
          ) : undefined
        }
      />

      {!isDesktop && (
        <Sheet open={menuOpen} onClose={closeMenu}>
          <AccountMenuPanel onNavigate={closeMenu} onRequestSignOut={requestSignOut} />
        </Sheet>
      )}

      <ConfirmDialog
        open={signOutOpen}
        title="Sign out?"
        message="You'll need your username and PIN to get back in."
        confirmLabel="Sign out"
        busy={signingOut}
        onConfirm={() => {
          setSigningOut(true)
          void signOut().finally(() => setSigningOut(false))
        }}
        onClose={() => setSignOutOpen(false)}
      />
    </>
  )
}

/** Renders the celebratory burst from shared student data. */
function LevelUpOverlay() {
  const { levelUp, clearLevelUp } = useStudentData()
  return <LevelUpBurst level={levelUp} onDone={clearLevelUp} />
}

/**
 * Renders the achievement-unlock celebration, one at a time from the queue.
 *
 * GATED ON THE LEVEL-UP BURST. Both are full-screen `z-50` overlays, and a
 * point award can trip a level AND a badge in the same instant — which drew the
 * two on top of each other, with the level-up's backdrop over the badge art.
 * Now the badge waits its turn: neither auto-dismisses any more, so the student
 * dismisses the first and the second appears behind it.
 */
function AchievementUnlockOverlay() {
  const { unlockedAchievement, clearUnlockedAchievement, levelUp } = useStudentData()
  return (
    <AchievementUnlockBurst
      achievement={levelUp === null ? unlockedAchievement : null}
      onDone={clearUnlockedAchievement}
    />
  )
}

/** Recaps points/penalties received while the app was closed. */
function AwayRecapOverlay() {
  const { awayEvents, clearAwayRecap } = useStudentData()
  return <AwayRecap events={awayEvents} onClose={clearAwayRecap} />
}

/**
 * First-run intro for new students, otherwise the "What's new" sheet. They're
 * mutually exclusive so a brand-new student never gets both at once — finishing
 * onboarding also marks the changelog seen.
 */
function IntroOrWhatsNew() {
  const [onboarding, setOnboarding] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDED_KEY) !== '1'
    } catch {
      return false
    }
  })

  function finishOnboarding() {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1')
      setSeenVersion(LATEST_VERSION)
    } catch {
      /* storage unavailable */
    }
    setOnboarding(false)
  }

  if (onboarding) return <Onboarding open onDone={finishOnboarding} />
  return <WhatsNew />
}

/** Student shell — responsive sidebar (desktop) / bottom tabs (mobile). */
export function AppLayout() {
  return (
    <StudentDataProvider>
      <StudentShell />
      <LevelUpOverlay />
      <AchievementUnlockOverlay />
      <IntroOrWhatsNew />
      <AwayRecapOverlay />
    </StudentDataProvider>
  )
}
