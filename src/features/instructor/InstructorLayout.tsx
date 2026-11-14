import { IconButton } from '@/components/ui/IconButton'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { routeWidth } from '@/lib/routes-shape'
import { motion } from 'framer-motion'
import { tap } from '@/lib/motion'
import { Shell, type NavItem } from '@/components/layout/Shell'
import { Splash } from '@/components/layout/Splash'
import { WhatsNew } from '@/features/WhatsNew'
import { IdentityHost } from '@/components/identity/IdentityHost'
import { InstructorAvatar } from '@/components/identity/InstructorAvatar'
import {
  ClipboardIcon,
  ClockIcon,
  LogOutIcon,
  QrIcon,
  ShieldIcon,
  TableIcon,
  TicketIcon,
  TrophyIcon,
  UsersIcon,
} from '@/components/ui/icons'
import {
  getActiveSemester,
  getPendingExcuseCount,
  countOpenReports,
  getPendingRedemptionCount,
  listSections,
  listSectionSubjects,
  listSubjects,
} from '@/lib/api'
import { configureTermCalendar } from '@/lib/term'
import { supabase, uniqueChannel } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import type { Section, Semester, Subject } from '@/lib/types'

interface InstructorContextValue {
  sections: Section[]
  selectedSectionId: string
  setSelectedSectionId: (id: string) => void
  refreshSections: () => Promise<void>
  semester: Semester | null
  /** Subjects offered this semester. */
  subjects: Subject[]
  sectionSubjects: Record<string, string[]>
  subjectsForSection: (sectionId: string) => Subject[]
  refreshSemester: () => Promise<void>
  /** Waiting-on-you counts, hoisted here once so the header badge and Ops agree. */
  pending: { redemptions: number; excuses: number; reports: number }
}

const InstructorContext = createContext<InstructorContextValue | undefined>(undefined)

export function useInstructor(): InstructorContextValue {
  const ctx = useContext(InstructorContext)
  if (!ctx) throw new Error('useInstructor must be used within InstructorLayout')
  return ctx
}

const nav: NavItem[] = [
  { to: '/teach', label: 'Students', Icon: UsersIcon, end: true },
  { to: '/teach/attendance', label: 'Attendance', Icon: QrIcon },
  { to: '/teach/grades', label: 'Grades', Icon: TableIcon },
  { to: '/teach/history', label: 'History', Icon: ClockIcon },
  { to: '/teach/leaderboard', label: 'Ranks', Icon: TrophyIcon },
]

function RedemptionInbox({ count }: { count: number }) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate('/teach/redemptions')}
      aria-label={count > 0 ? `Requests (${count} waiting)` : 'Requests'}
      className="cp-tap-44 relative flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
    >
      <TicketIcon className="h-5 w-5" />
      {count > 0 && (
        <motion.span
          key={count}
          initial={{ scale: 0.5 }}
          animate={{ scale: 1 }}
          transition={tap}
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-solid px-1 text-2xs font-bold tabular-nums text-white ring-2 ring-canvas"
        >
          {count > 9 ? '9+' : count}
        </motion.span>
      )}
    </button>
  )
}

function OpsButton() {
  const navigate = useNavigate()
  return (
        <IconButton
      label="Ops and trust"
      variant="outline"
      round
      onClick={() => navigate('/teach/ops')}
      icon={<ShieldIcon className="h-5 w-5" />}
    />
  )
}

/** The instructor's own face, leading to their profile. It replaces Sign out in the phone header
 * (which is now on the profile screen), so the five-button row that overflowed stays at four. */
function ProfileButton() {
  const navigate = useNavigate()
  return (
    <IconButton
      label="Your profile"
      variant="outline"
      round
      onClick={() => navigate('/teach/profile')}
      icon={<InstructorAvatar interactive={false} className="h-7 w-7" />}
    />
  )
}

function PeerButton() {
  const navigate = useNavigate()
  return (
    <IconButton
      label="Peer evaluation"
      variant="outline"
      round
      onClick={() => navigate('/teach/peer')}
      icon={<ClipboardIcon className="h-5 w-5" />}
    />
  )
}

export function InstructorLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [sections, setSections] = useState<Section[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [semester, setSemester] = useState<Semester | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [sectionSubjects, setSectionSubjects] = useState<Record<string, string[]>>({})
  const [pendingRedemptions, setPendingRedemptions] = useState(0)
  const [pendingExcuses, setPendingExcuses] = useState(0)
  const [pendingReports, setPendingReports] = useState(0)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      getPendingRedemptionCount()
        .then((n) => !cancelled && setPendingRedemptions(n))
        .catch(() => {})
      getPendingExcuseCount()
        .then((n) => !cancelled && setPendingExcuses(n))
        .catch(() => {})
      countOpenReports()
        .then((n) => !cancelled && setPendingReports(n))
        .catch(() => {})
    }
    refresh()
    const redemptionsCh = uniqueChannel('redemptions-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'point_redemptions' }, () =>
        refresh(),
      )
      .subscribe()
    const excusesCh = uniqueChannel('excuses-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'absence_excuses' }, () =>
        refresh(),
      )
      .subscribe()
    const reportsCh = uniqueChannel('reports-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'space_reports' }, () =>
        refresh(),
      )
      .subscribe()
    return () => {
      cancelled = true
      void supabase.removeChannel(redemptionsCh)
      void supabase.removeChannel(excusesCh)
      void supabase.removeChannel(reportsCh)
    }
  }, [])

  const semesterIdRef = useRef<string | undefined>(undefined)

  async function loadSemester() {
    const active = await getActiveSemester()
    setSemester(active)
    semesterIdRef.current = active?.id
    if (!active) {
      setSubjects([])
      setSectionSubjects({})
      return
    }
    configureTermCalendar({
      semesterId: active.id,
      semesterName: active.name,
      startsOn: active.startsOn,
      terms: active.terms,
    })
    const [subs, assignments] = await Promise.all([
      listSubjects(active.id),
      listSectionSubjects(active.id),
    ])
    setSubjects(subs)
    setSectionSubjects(assignments)
  }

  async function refreshSections() {
    const data = await listSections(semesterIdRef.current)
    setSections(data)
    setSelectedSectionId((cur) => (data.some((s) => s.id === cur) ? cur : (data[0]?.id ?? '')))
  }

  async function refreshSemester() {
    await loadSemester()
    await refreshSections()
  }

  const subjectsForSection = useCallback(
    (sectionId: string): Subject[] => {
      const ids = new Set(sectionSubjects[sectionId] ?? [])
      return subjects.filter((s) => ids.has(s.id))
    },
    [sectionSubjects, subjects],
  )

  useEffect(() => {
    loadSemester()
      .then(refreshSections)
      .catch(() => setSections([]))
      .finally(() => setLoading(false))
  }, [])

  async function onSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  const contextValue = useMemo(
    () => ({
      sections,
      selectedSectionId,
      setSelectedSectionId,
      refreshSections,
      semester,
      subjects,
      sectionSubjects,
      subjectsForSection,
      refreshSemester,
      pending: { redemptions: pendingRedemptions, excuses: pendingExcuses, reports: pendingReports },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, selectedSectionId, semester, subjects, sectionSubjects, subjectsForSection, pendingRedemptions, pendingExcuses, pendingReports],
  )

  // Desktop sidebar carries Requests and Peer evaluation as real nav items; the
  // phone keeps them as header buttons (and its bottom tabs stay at five).
  const requestsCount = pendingRedemptions + pendingExcuses + pendingReports
  const sidebarNav = useMemo<NavItem[]>(
    () => [
      ...nav,
      {
        to: '/teach/redemptions',
        label: 'Requests',
        Icon: TicketIcon,
        badge:
          requestsCount > 0 ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-solid px-1.5 text-2xs font-bold tabular-nums text-white">
              {requestsCount > 9 ? '9+' : requestsCount}
            </span>
          ) : undefined,
      },
      { to: '/teach/peer', label: 'Peer evaluation', Icon: ClipboardIcon },
    ],
    [requestsCount],
  )

  if (loading) return <Splash />

  return (
    <InstructorContext.Provider
      value={contextValue}
    >
      <Shell
        nav={sidebarNav}
        tabNav={nav}
        width={routeWidth(pathname)}
        badge={
          <span className="ml-1 rounded-lg bg-accent-solid/10 px-2 py-0.5 text-xs font-semibold text-accent">
            Instructor
          </span>
        }
        sidebarActions={
          <div className="flex items-center gap-2">
            <ProfileButton />
            <OpsButton />
            <IconButton
              label="Sign out"
              variant="outline"
              round
              onClick={onSignOut}
              icon={<LogOutIcon className="h-5 w-5" />}
            />
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <RedemptionInbox count={pendingRedemptions + pendingExcuses + pendingReports} />
            <PeerButton />
            <OpsButton />
            <ProfileButton />
          </div>
        }
      />
      <WhatsNew />
      <IdentityHost />
    </InstructorContext.Provider>
  )
}
