import { Shell, type NavItem } from '@/components/layout/Shell'
import { StudentDataProvider, useStudentData } from '@/features/student/StudentData'
import { LevelUpBurst } from '@/components/ui/LevelUpBurst'
import { HomeIcon, TrophyIcon, UserIcon } from '@/components/ui/icons'

const studentNav: NavItem[] = [
  { to: '/app', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/app/leaderboard', label: 'Ranks', Icon: TrophyIcon },
  { to: '/app/profile', label: 'Profile', Icon: UserIcon },
]

/** Renders the celebratory burst from shared student data. */
function LevelUpOverlay() {
  const { levelUp, clearLevelUp } = useStudentData()
  return <LevelUpBurst level={levelUp} onDone={clearLevelUp} />
}

/** Student shell — responsive sidebar (desktop) / bottom tabs (mobile). */
export function AppLayout() {
  return (
    <StudentDataProvider>
      <Shell nav={studentNav} />
      <LevelUpOverlay />
    </StudentDataProvider>
  )
}
