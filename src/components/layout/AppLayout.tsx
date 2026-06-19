import { Shell, type NavItem } from '@/components/layout/Shell'
import { StudentDataProvider } from '@/features/student/StudentData'
import { HomeIcon, TrophyIcon, UserIcon } from '@/components/ui/icons'

const studentNav: NavItem[] = [
  { to: '/app', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/app/leaderboard', label: 'Ranks', Icon: TrophyIcon },
  { to: '/app/profile', label: 'Profile', Icon: UserIcon },
]

/** Student shell — responsive sidebar (desktop) / bottom tabs (mobile). */
export function AppLayout() {
  return (
    <StudentDataProvider>
      <Shell nav={studentNav} />
    </StudentDataProvider>
  )
}
