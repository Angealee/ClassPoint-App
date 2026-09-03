import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shell, type NavItem } from '@/components/layout/Shell'
import { isChatRoom } from '@/lib/routes-shape'
import { SidebarAccount } from '@/components/layout/AccountMenu'
import { MobileMenu } from '@/components/layout/MobileMenu'
import { StudentDataProvider, useStudentData } from '@/features/student/StudentData'
import { LevelUpBurst } from '@/components/ui/LevelUpBurst'
import { AchievementUnlockBurst } from '@/components/achievements/AchievementUnlockBurst'
import { WhatsNew } from '@/features/WhatsNew'
import { AwayRecap } from '@/features/student/AwayRecap'
import { NotificationsSheet } from '@/features/student/Notifications'
import { Onboarding } from '@/features/student/Onboarding'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/lib/auth'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { LATEST_VERSION, setSeenVersion } from '@/lib/changelog'
import { spaceChip } from '@/lib/space-gate'
import { Chip } from '@/components/ui/Chip'
import {
  BellIcon,
  HomeIcon,
  MenuIcon,
  SaturnIcon,
  ScanIcon,
  TrophyIcon,
  UserIcon,
} from '@/components/ui/icons'

const ONBOARDED_KEY = 'cp_onboarded'

/**
 * The five destinations, in sidebar order.
 *
 * Student Space sits second — directly under Home — because it is the feature
 * being launched and burying it under a menu is how a beta goes unused. Profile
 * is last: it is checked far less often than the three it follows.
 */
const SIDEBAR_NAV = [
  { to: '/app', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/app/space', label: 'Student Space', Icon: SaturnIcon },
  { to: '/app/leaderboard', label: 'Ranks', Icon: TrophyIcon },
  { to: '/app/attendance', label: 'Attend', Icon: ScanIcon },
  { to: '/app/profile', label: 'Profile', Icon: UserIcon },
] as const

/**
 * The mobile bottom bar carries three of those plus the menu.
 *
 * Five tabs is the comfortable limit on a phone and this would be the fifth, so
 * Student Space and Profile live in the menu overlay — which mirrors the full
 * sidebar, so nothing is more than two taps away.
 */
const TAB_ROUTES = ['/app', '/app/leaderboard', '/app/attendance'] as const

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
 * The shell with a live nav, the sidebar account block, and the mobile menu.
 *
 * ⚠ Both open states live HERE, not in the nav item or the menu component.
 * Shell renders `nav` twice — desktop sidebar and mobile tab bar — so a button
 * owning its own state would produce two menus that disagree. Same rule as the
 * `actions` slot.
 *
 * The two surfaces are chosen in JS rather than with `md:` classes because the
 * mobile one portals to <body>, where a `md:hidden` wrapper would style
 * nothing and both could open at once. See lib/useIsDesktop.ts.
 */
function StudentShell() {
  const { hasUnseenAchievements, spaceAccess } = useStudentData()
  const { signOut } = useAuth()
  const isDesktop = useIsDesktop()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  // Sign out is confirmed in a ConfirmDialog, which is itself a Sheet. Close
  // this surface FIRST so two portalled overlays never stack their focus traps.
  const requestSignOut = () => {
    setMenuOpen(false)
    setSignOutOpen(true)
  }

  const nav = useMemo<NavItem[]>(() => {
    const chip = spaceChip(spaceAccess.state)
    return SIDEBAR_NAV.map((item) => ({
      ...item,
      // BETA / Paused / Soon — whichever the server says. Hardcoding BETA here
      // would tell a locked student they are in a beta they cannot open.
      badge:
        item.to === '/app/space' ? (
          <Chip tone={chip.tone} size="sm">
            {chip.label}
          </Chip>
        ) : undefined,
      // The unseen-achievements dot follows the trophy case, which lives on
      // Profile.
      dot: item.to === '/app/profile' ? hasUnseenAchievements : undefined,
    }))
  }, [hasUnseenAchievements, spaceAccess.state])

  const tabNav = useMemo<NavItem[]>(
    () => [
      ...nav
        .filter((item): item is Extract<NavItem, { to: string }> =>
          'to' in item ? (TAB_ROUTES as readonly string[]).includes(item.to) : false,
        )
        // A tab has no room for a chip; the label alone is the tab.
        .map(({ badge: _badge, ...item }) => item),
      {
        kind: 'button' as const,
        id: 'menu',
        label: 'Menu',
        Icon: MenuIcon,
        // Surfaces the Profile dot, since Profile is only reachable in here.
        dot: hasUnseenAchievements,
        active: menuOpen,
        onClick: () => setMenuOpen((v) => !v),
      },
    ],
    [nav, hasUnseenAchievements, menuOpen],
  )

  return (
    <>
      <Shell
        nav={nav}
        tabNav={tabNav}
        wide={isChatRoom(pathname)}
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
        <MobileMenu
          open={menuOpen}
          onClose={closeMenu}
          nav={nav}
          onNavigate={closeMenu}
          onRequestSignOut={requestSignOut}
        />
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
