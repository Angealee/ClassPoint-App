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
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Shell, type NavItem } from '@/components/layout/Shell'
import { Splash } from '@/components/layout/Splash'
import { WhatsNew } from '@/features/WhatsNew'
import {
  ClockIcon,
  LogOutIcon,
  QrIcon,
  ShieldIcon,
  TicketIcon,
  TrophyIcon,
  UsersIcon,
} from '@/components/ui/icons'
import {
  getActiveSemester,
  getPendingExcuseCount,
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
  /** The active semester (0027). Null only if none is marked active. */
  semester: Semester | null
  /** Subjects offered this semester. */
  subjects: Subject[]
  /** Which subjects each section takes: { sectionId: subjectId[] }. */
  sectionSubjects: Record<string, string[]>
  /** Subjects assigned to one section, in code order — for session pickers. */
  subjectsForSection: (sectionId: string) => Subject[]
  /** Re-read semester, subjects and assignments after editing them. */
  refreshSemester: () => Promise<void>
}

const InstructorContext = createContext<InstructorContextValue | undefined>(undefined)

export function useInstructor(): InstructorContextValue {
  const ctx = useContext(InstructorContext)
  if (!ctx) throw new Error('useInstructor must be used within InstructorLayout')
  return ctx
}

/**
 * Four tabs, not five.
 *
 * Awarding lost its tab and moved into the section roster — you tick students
 * where you're already looking at them, and the bulk flow survived intact.
 * "Activity" became "History", which now holds BOTH the points ledger and the
 * class attendance stats as sub-tabs. Those stats used to hang off a text link
 * on the Attendance screen, which the live-class view replaces outright, so
 * they were unreachable exactly when a class was running.
 */
const nav: NavItem[] = [
  { to: '/teach', label: 'Students', Icon: UsersIcon, end: true },
  { to: '/teach/attendance', label: 'Attendance', Icon: QrIcon },
  { to: '/teach/history', label: 'History', Icon: ClockIcon },
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
      aria-label={count > 0 ? `Requests (${count} waiting)` : 'Requests'}
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
    >
      <TicketIcon className="h-5 w-5" />
      {count > 0 && (
        <motion.span
          key={count}
          initial={{ scale: 0.5 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 600, damping: 18 }}
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-solid px-1 text-2xs font-bold tabular-nums text-white ring-2 ring-canvas"
        >
          {count > 9 ? '9+' : count}
        </motion.span>
      )}
    </button>
  )
}

/**
 * Ops & trust entry point (0034).
 *
 * Stateless BY REQUIREMENT: Shell renders `actions` in both the desktop sidebar
 * and the mobile header, so this mounts twice. A component in that slot must
 * never own a subscription or a fetch — see RedemptionInbox above, whose count
 * lives in the layout for exactly this reason.
 */
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

export function InstructorLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [sections, setSections] = useState<Section[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [semester, setSemester] = useState<Semester | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [sectionSubjects, setSectionSubjects] = useState<Record<string, string[]>>({})
  // One inbox, two request types: point spends + absence excuses.
  const [pendingRedemptions, setPendingRedemptions] = useState(0)
  const [pendingExcuses, setPendingExcuses] = useState(0)

  // Owned here (single mount) rather than in RedemptionInbox, which Shell
  // renders twice. Page-scoped channels: subscribed on mount, removed on unmount.
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      getPendingRedemptionCount()
        .then((n) => !cancelled && setPendingRedemptions(n))
        .catch(() => {})
      getPendingExcuseCount()
        .then((n) => !cancelled && setPendingExcuses(n))
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
    return () => {
      cancelled = true
      void supabase.removeChannel(redemptionsCh)
      void supabase.removeChannel(excusesCh)
    }
  }, [])

  // The active semester gates everything else: sections are scoped to it, and
  // every week/term label in the instructor area derives from its dates. Mirrored
  // into a ref so refreshSections() can read it without a stale closure.
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
    // Do this before any child renders: term.ts falls back to hardcoded dates
    // until it's configured, and we'd rather never show the fallback labels.
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
    // Keep the current pick when it still exists; otherwise fall back to the
    // first. The "still exists" check matters when the semester changes.
    setSelectedSectionId((cur) => (data.some((s) => s.id === cur) ? cur : (data[0]?.id ?? '')))
  }

  async function refreshSemester() {
    await loadSemester()
    await refreshSections()
  }

  // Memoized: screens use this as an effect dependency (Attendance defaults its
  // subject picker from it), and a fresh function each render would loop.
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

  /**
   * Memoized: without this, a fresh object every render re-rendered EVERY
   * instructor screen each time a redemption or excuse row changed anywhere in
   * the database (those two badge channels fire often). refreshSections and
   * refreshSemester are plain declarations, so they're intentionally excluded —
   * they're called from event handlers, never used as effect dependencies.
   */
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
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, selectedSectionId, semester, subjects, sectionSubjects, subjectsForSection],
  )

  if (loading) return <Splash />

  return (
    <InstructorContext.Provider
      value={contextValue}
    >
      <Shell
        nav={nav}
        badge={
          <span className="ml-1 rounded-lg bg-accent-solid/10 px-2 py-0.5 text-xs font-semibold text-accent">
            Instructor
          </span>
        }
        actions={
          // Wrapped so the desktop sidebar's justify-between treats these as a
          // single unit instead of spreading them apart.
          <div className="flex items-center gap-2">
            <RedemptionInbox count={pendingRedemptions + pendingExcuses} />
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
      />
      <WhatsNew />
    </InstructorContext.Provider>
  )
}
