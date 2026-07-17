import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Shell, type NavItem } from '@/components/layout/Shell'
import { StudentDataProvider, useStudentData } from '@/features/student/StudentData'
import { LevelUpBurst } from '@/components/ui/LevelUpBurst'
import { AchievementUnlockBurst } from '@/components/achievements/AchievementUnlockBurst'
import { WhatsNew } from '@/features/WhatsNew'
import { AwayRecap } from '@/features/student/AwayRecap'
import { NotificationsSheet } from '@/features/student/Notifications'
import { Onboarding } from '@/features/student/Onboarding'
import { LATEST_VERSION, setSeenVersion } from '@/lib/changelog'
import { BellIcon, HomeIcon, ScanIcon, TrophyIcon, UserIcon } from '@/components/ui/icons'

const ONBOARDED_KEY = 'cp_onboarded'

const studentNav: NavItem[] = [
  { to: '/app', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/app/leaderboard', label: 'Ranks', Icon: TrophyIcon },
  { to: '/app/attendance', label: 'Attend', Icon: ScanIcon },
  { to: '/app/profile', label: 'Profile', Icon: UserIcon },
]

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
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[0.6rem] font-bold tabular-nums text-white ring-2 ring-canvas"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>
      <NotificationsSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** The shell with a live nav — the Profile tab gets a dot for new achievements. */
function StudentShell() {
  const { hasUnseenAchievements } = useStudentData()
  const nav = useMemo(
    () =>
      studentNav.map((n) =>
        n.to === '/app/profile' ? { ...n, dot: hasUnseenAchievements } : n,
      ),
    [hasUnseenAchievements],
  )
  return <Shell nav={nav} actions={<NotificationBell />} />
}

/** Renders the celebratory burst from shared student data. */
function LevelUpOverlay() {
  const { levelUp, clearLevelUp } = useStudentData()
  return <LevelUpBurst level={levelUp} onDone={clearLevelUp} />
}

/** Renders the achievement-unlock celebration, one at a time from the queue. */
function AchievementUnlockOverlay() {
  const { unlockedAchievement, clearUnlockedAchievement } = useStudentData()
  return <AchievementUnlockBurst achievement={unlockedAchievement} onDone={clearUnlockedAchievement} />
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
