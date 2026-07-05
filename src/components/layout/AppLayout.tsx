import { useState } from 'react'
import { Shell, type NavItem } from '@/components/layout/Shell'
import { StudentDataProvider, useStudentData } from '@/features/student/StudentData'
import { LevelUpBurst } from '@/components/ui/LevelUpBurst'
import { WhatsNew } from '@/features/WhatsNew'
import { AwayRecap } from '@/features/student/AwayRecap'
import { Onboarding } from '@/features/student/Onboarding'
import { LATEST_VERSION, setSeenVersion } from '@/lib/changelog'
import { HomeIcon, ScanIcon, TrophyIcon, UserIcon } from '@/components/ui/icons'

const ONBOARDED_KEY = 'cp_onboarded'

const studentNav: NavItem[] = [
  { to: '/app', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/app/leaderboard', label: 'Ranks', Icon: TrophyIcon },
  { to: '/app/attendance', label: 'Attend', Icon: ScanIcon },
  { to: '/app/profile', label: 'Profile', Icon: UserIcon },
]

/** Renders the celebratory burst from shared student data. */
function LevelUpOverlay() {
  const { levelUp, clearLevelUp } = useStudentData()
  return <LevelUpBurst level={levelUp} onDone={clearLevelUp} />
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
      <Shell nav={studentNav} />
      <LevelUpOverlay />
      <IntroOrWhatsNew />
      <AwayRecapOverlay />
    </StudentDataProvider>
  )
}
