import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { tap } from '@/lib/motion'
import { Shell, type NavItem } from '@/components/layout/Shell'
import { routeWidth } from '@/lib/routes-shape'
import { SidebarAccount } from '@/components/layout/AccountMenu'
import { MobileMenu } from '@/components/layout/MobileMenu'
import { StudentDataProvider, useStudentData } from '@/features/student/StudentData'
import { LevelUpBurst } from '@/components/ui/LevelUpBurst'
import { AchievementUnlockBurst } from '@/components/achievements/AchievementUnlockBurst'
import { WhatsNew } from '@/features/WhatsNew'
import { AwayRecap } from '@/features/student/AwayRecap'
import { NotificationsSheet } from '@/features/student/Notifications'
import { Tour } from '@/features/student/Tour'
import { ArchivedScreen } from '@/features/student/ArchivedScreen'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/lib/auth'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { LATEST_VERSION, getSeenVersion, setSeenVersion } from '@/lib/changelog'
import { beginTour, endTour, type TourSession } from '@/lib/tour'
import { spaceChip } from '@/lib/space-gate'
import { Chip } from '@/components/ui/Chip'
import {
  BellIcon,
  HomeIcon,
  MenuIcon,
  SaturnIcon,
  ClipboardIcon,
  ScanIcon,
  TableIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
} from '@/components/ui/icons'

const LEGACY_ONBOARDED_KEY = 'cp_onboarded'

const SIDEBAR_NAV = [
  { to: '/app', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/app/space', label: 'Student Space', Icon: SaturnIcon, exclude: '/app/space/people' },
  { to: '/app/space/people', label: 'People', Icon: UsersIcon },
  { to: '/app/leaderboard', label: 'Ranks', Icon: TrophyIcon },
  { to: '/app/attendance', label: 'Attend', Icon: ScanIcon },
  { to: '/app/grades', label: 'Grades', Icon: TableIcon },
  { to: '/app/peer', label: 'Peer eval', Icon: ClipboardIcon },
  { to: '/app/profile', label: 'Profile', Icon: UserIcon },
] as const

const TAB_ROUTES = ['/app', '/app/leaderboard', '/app/attendance'] as const

function NotificationBell() {
  const { unreadCount } = useStudentData()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        className="cp-tap-44 relative flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card-2 text-muted transition-colors hover:text-ink"
      >
        <BellIcon className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <motion.span
            key={unreadCount}
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={tap}
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

function StudentShell() {
  const { hasUnseenAchievements, spaceAccess } = useStudentData()
  const { signOut } = useAuth()
  const isDesktop = useIsDesktop()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  const requestSignOut = () => {
    setMenuOpen(false)
    setSignOutOpen(true)
  }

  const nav = useMemo<NavItem[]>(() => {
    const chip = spaceChip(spaceAccess.state)
    return SIDEBAR_NAV.map((item) => ({
      ...item,
      badge:
        item.to === '/app/space' ? (
          <Chip tone={chip.tone} size="sm">
            {chip.label}
          </Chip>
        ) : undefined,
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
        width={routeWidth(pathname)}
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

function startTour(studentId: string): TourSession {
  try {
    const legacy = localStorage.getItem(LEGACY_ONBOARDED_KEY) === '1'
    return beginTour(localStorage, sessionStorage, studentId, legacy)
  } catch {
    return { show: false, opens: 0, skippable: false }
  }
}

function IntroLayer() {
  const { me } = useStudentData()
  if (!me) return null
  return <IntroLayerFor studentId={me.id} />
}

function IntroLayerFor({ studentId }: { studentId: string }) {
  const { levelUp, unlockedAchievement } = useStudentData()
  const [session] = useState(() => startTour(studentId))
  const [open, setOpen] = useState(session.show)

  function finish() {
    try {
      endTour(sessionStorage, studentId)
    } catch {
      /* a blocked store costs a replay on remount, never the screen */
    }
    if (getSeenVersion() === null) setSeenVersion(LATEST_VERSION)
    setOpen(false)
  }

  const visible = open && levelUp === null && unlockedAchievement === null

  return (
    <>
      <AnimatePresence>
        {visible && <Tour skippable={session.skippable} onDone={finish} />}
      </AnimatePresence>
      {!open && <WhatsNew />}
      {!open && <AwayRecapOverlay />}
    </>
  )
}

function StudentOrArchived() {
  const { me } = useStudentData()

  if (me?.archived_at) return <ArchivedScreen />

  return (
    <>
      <StudentShell />
      <LevelUpOverlay />
      <AchievementUnlockOverlay />
      <IntroLayer />
    </>
  )
}

export function AppLayout() {
  return (
    <StudentDataProvider>
      <StudentOrArchived />
    </StudentDataProvider>
  )
}
