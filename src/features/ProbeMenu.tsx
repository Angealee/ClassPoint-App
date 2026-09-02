// PROBE-TEMP — delete after measuring. Renders the real Shell + AccountMenu
// against a mock StudentData context so the layout can be measured without an
// authenticated session.
import { useState } from 'react'
import { Shell, type NavItem } from '@/components/layout/Shell'
import { AccountMenuPanel, SidebarAccount } from '@/components/layout/AccountMenu'
import { StudentDataContext } from '@/features/student/StudentData'
import type { StudentDataValue } from '@/features/student/StudentData'
import { Sheet } from '@/components/ui/Sheet'
import { HomeIcon, MenuIcon, ScanIcon, TrophyIcon } from '@/components/ui/icons'
import { useIsDesktop } from '@/lib/useIsDesktop'

const mock = {
  me: {
    id: 'p1',
    section_id: 's1',
    full_name: 'Macale, Koby Angelo Buenaventura',
    display_name: 'Koby Angelo Buenaventura Macale',
    avatar_url: null,
    bio: null,
    interests: null,
    banner_urls: null,
    header_url: null,
    header_pos: 50,
    display_title: null,
    pinned_achievements: null,
    semester_points: 1284,
    all_time_points: 1284,
  },
  hasUnseenAchievements: true,
  unreadCount: 3,
} as unknown as StudentDataValue

export function ProbeMenu() {
  const isDesktop = useIsDesktop()
  const [open, setOpen] = useState(false)

  const nav: NavItem[] = [
    { to: '/__probe', label: 'Home', Icon: HomeIcon, end: true },
    { to: '/__probe/a', label: 'Ranks', Icon: TrophyIcon },
    { to: '/__probe/b', label: 'Attend', Icon: ScanIcon },
    {
      kind: 'button',
      id: 'menu',
      label: 'Menu',
      Icon: MenuIcon,
      dot: true,
      active: open,
      onClick: () => setOpen((v) => !v),
    },
  ]

  return (
    <StudentDataContext.Provider value={mock}>
      <Shell
        nav={nav}
        actions={
          <div
            id="probe-bell"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card-2 text-2xs"
          >
            B
          </div>
        }
        accountSlot={
          isDesktop ? (
            <SidebarAccount
              open={open}
              onToggle={() => setOpen((v) => !v)}
              onNavigate={() => setOpen(false)}
              onRequestSignOut={() => {}}
            />
          ) : undefined
        }
      />
      {!isDesktop && (
        <Sheet open={open} onClose={() => setOpen(false)}>
          <AccountMenuPanel onNavigate={() => setOpen(false)} onRequestSignOut={() => {}} />
        </Sheet>
      )}
    </StudentDataContext.Provider>
  )
}
