import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type SVGProps,
} from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Splash } from '@/components/layout/Splash'
import { BoltIcon, LogOutIcon, TrophyIcon, UsersIcon } from '@/components/ui/icons'
import { listSections } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import type { Section } from '@/lib/types'

interface InstructorContextValue {
  sections: Section[]
  selectedSectionId: string
  setSelectedSectionId: (id: string) => void
  refreshSections: () => Promise<void>
}

const InstructorContext = createContext<InstructorContextValue | undefined>(undefined)

export function useInstructor(): InstructorContextValue {
  const ctx = useContext(InstructorContext)
  if (!ctx) throw new Error('useInstructor must be used within InstructorLayout')
  return ctx
}

interface NavItem {
  to: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}
const nav: NavItem[] = [
  { to: '/teach', label: 'Roster', Icon: UsersIcon },
  { to: '/teach/award', label: 'Award', Icon: BoltIcon },
  { to: '/teach/leaderboard', label: 'Ranks', Icon: TrophyIcon },
]

export function InstructorLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [sections, setSections] = useState<Section[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [loading, setLoading] = useState(true)

  async function refreshSections() {
    const data = await listSections()
    setSections(data)
    setSelectedSectionId((cur) => cur || data[0]?.id || '')
  }

  useEffect(() => {
    refreshSections()
      .catch(() => setSections([]))
      .finally(() => setLoading(false))
  }, [])

  async function onSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  if (loading) return <Splash />

  return (
    <InstructorContext.Provider
      value={{ sections, selectedSectionId, setSelectedSectionId, refreshSections }}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col">
        <header className="theme-transition sticky top-0 z-20 flex items-center justify-between border-b border-line bg-canvas/80 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="font-display text-lg font-bold tracking-tight">ClassPoint</span>
            <span className="ml-1 rounded-md bg-brand-500/10 px-2 py-0.5 text-xs font-semibold text-brand-500">
              Instructor
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted hover:text-ink"
            >
              <LogOutIcon className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-28 pt-5">
          <Outlet />
        </main>

        <nav className="theme-transition fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-2xl border-t border-line bg-canvas/90 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
          <ul className="flex items-center justify-around">
            {nav.map(({ to, label, Icon }) => (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={to === '/teach'}
                  className={({ isActive }) =>
                    cn(
                      'flex flex-col items-center gap-1 rounded-xl py-1.5 text-xs font-medium transition-colors',
                      isActive ? 'text-brand-500' : 'text-muted hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn(
                          'h-6 w-6',
                          isActive && 'drop-shadow-[0_0_6px_var(--color-brand-500)]',
                        )}
                      />
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </InstructorContext.Provider>
  )
}
