import { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shell, type NavItem } from '@/components/layout/Shell'
import { Splash } from '@/components/layout/Splash'
import { WhatsNew } from '@/features/WhatsNew'
import {
  BoltIcon,
  ClockIcon,
  LogOutIcon,
  QrIcon,
  TicketIcon,
  TrophyIcon,
  UsersIcon,
} from '@/components/ui/icons'
import { getPendingRedemptionCount, listSections } from '@/lib/api'
import { supabase, uniqueChannel } from '@/lib/supabase'
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
  { to: '/teach/attendance', label: 'Attendance', Icon: QrIcon },
  { to: '/teach/history', label: 'Activity', Icon: ClockIcon },
  { to: '/teach/leaderboard', label: 'Ranks', Icon: TrophyIcon },
]

/**
 * Point-request inbox button. Lives in the Shell's actions slot rather than the
 * tab bar — five tabs is already the comfortable limit on a phone.
 *
 * Presentational on purpose: Shell renders `actions` in BOTH the desktop
 * sidebar and the mobile header, so this component mounts twice. The count and
 * its realtime subscription therefore live in InstructorLayout, which mounts
 * once — two instances subscribing to one topic is exactly what makes
 * supabase-js throw.
 */
function RedemptionInbox({ count }: { count: number }) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate('/teach/redemptions')}
      aria-label={count > 0 ? `Point requests (${count} waiting)` : 'Point requests'}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
    >
      <TicketIcon className="h-5 w-5" />
      {count > 0 && (
        <motion.span
          key={count}
          initial={{ scale: 0.5 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 600, damping: 18 }}
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[0.6rem] font-bold tabular-nums text-white ring-2 ring-canvas"
        >
          {count > 9 ? '9+' : count}
        </motion.span>
      )}
    </button>
  )
}

export function InstructorLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [sections, setSections] = useState<Section[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingRedemptions, setPendingRedemptions] = useState(0)

  // Owned here (single mount) rather than in RedemptionInbox, which Shell
  // renders twice. Page-scoped channel: subscribed on mount, removed on unmount.
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      getPendingRedemptionCount()
        .then((n) => !cancelled && setPendingRedemptions(n))
        .catch(() => {})
    }
    refresh()
    const channel = uniqueChannel('redemptions-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'point_redemptions' }, () =>
        refresh(),
      )
      .subscribe()
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [])

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
          // Wrapped so the desktop sidebar's justify-between treats these as a
          // single unit instead of spreading them apart.
          <div className="flex items-center gap-2">
            <RedemptionInbox count={pendingRedemptions} />
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted hover:text-ink"
            >
              <LogOutIcon className="h-5 w-5" />
            </button>
          </div>
        }
      />
      <WhatsNew />
    </InstructorContext.Provider>
  )
}
