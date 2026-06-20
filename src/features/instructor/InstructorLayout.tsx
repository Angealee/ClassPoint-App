import { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shell, type NavItem } from '@/components/layout/Shell'
import { Splash } from '@/components/layout/Splash'
import { BoltIcon, LogOutIcon, TrophyIcon, UsersIcon } from '@/components/ui/icons'
import { listSections } from '@/lib/api'
import { useAuth } from '@/lib/auth'
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

const nav: NavItem[] = [
  { to: '/teach', label: 'Students', Icon: UsersIcon, end: true },
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
      <Shell
        nav={nav}
        badge={
          <span className="ml-1 rounded-md bg-brand-500/10 px-2 py-0.5 text-xs font-semibold text-brand-500">
            Instructor
          </span>
        }
        actions={
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted hover:text-ink"
          >
            <LogOutIcon className="h-5 w-5" />
          </button>
        }
      />
    </InstructorContext.Provider>
  )
}
