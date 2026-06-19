import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/lib/auth'
import {
  getMyStudent,
  listLeaderboard,
  listSections,
  listStudentEvents,
  updateDisplayName,
} from '@/lib/api'
import type { LeaderboardRow, PointEvent, Section, StudentSelf } from '@/lib/types'

interface StudentDataValue {
  loading: boolean
  error: boolean
  me: StudentSelf | null
  sections: Section[]
  leaderboard: LeaderboardRow[]
  events: PointEvent[]
  /** 1-based global rank by lifetime points, or null if not ranked yet. */
  rank: number | null
  sectionName: (id: string) => string
  refresh: () => Promise<void>
  saveDisplayName: (name: string) => Promise<{ error?: string }>
}

const StudentDataContext = createContext<StudentDataValue | undefined>(undefined)

export function StudentDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [me, setMe] = useState<StudentSelf | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [events, setEvents] = useState<PointEvent[]>([])

  const load = useCallback(async () => {
    if (!user) return
    setError(false)
    try {
      const [mine, secs, board] = await Promise.all([
        getMyStudent(user.id),
        listSections(),
        listLeaderboard(),
      ])
      setMe(mine)
      setSections(secs)
      setLeaderboard(board)
      setEvents(mine ? await listStudentEvents(mine.id) : [])
    } catch {
      setError(true)
    }
  }, [user])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const rank = me ? (leaderboard.findIndex((r) => r.id === me.id) + 1 || null) : null

  const sectionName = useCallback(
    (id: string) => sections.find((s) => s.id === id)?.name ?? '',
    [sections],
  )

  const saveDisplayName = useCallback(
    async (name: string) => {
      if (!me) return { error: 'Still loading — try again in a moment.' }
      const trimmed = name.trim()
      if (trimmed.length < 2) return { error: 'Use at least 2 characters.' }
      if (trimmed.length > 40) return { error: 'Keep it under 40 characters.' }
      try {
        await updateDisplayName(me.id, trimmed)
        setMe((m) => (m ? { ...m, display_name: trimmed } : m))
        setLeaderboard((rows) =>
          rows.map((r) => (r.id === me.id ? { ...r, display_name: trimmed } : r)),
        )
        return {}
      } catch {
        return { error: 'Could not save. Please try again.' }
      }
    },
    [me],
  )

  return (
    <StudentDataContext.Provider
      value={{
        loading,
        error,
        me,
        sections,
        leaderboard,
        events,
        rank,
        sectionName,
        refresh: load,
        saveDisplayName,
      }}
    >
      {children}
    </StudentDataContext.Provider>
  )
}

export function useStudentData(): StudentDataValue {
  const ctx = useContext(StudentDataContext)
  if (!ctx) throw new Error('useStudentData must be used within StudentDataProvider')
  return ctx
}
