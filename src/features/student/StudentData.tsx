import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/lib/auth'
import {
  getLeaderboardSnapshot,
  getMyStudent,
  listSections,
  listStudentEvents,
  removeAvatar,
  updateAvatar,
  updateDisplayName,
} from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { getLevelProgress } from '@/lib/leveling'
import { useToast } from '@/components/ui/Toast'
import { initSound, playSound } from '@/lib/sound'
import { vibrate } from '@/lib/haptics'
import { showLocalNotification, syncPushSubscription } from '@/lib/push'
import type { LeaderboardEntry, PointEvent, Section, StudentSelf } from '@/lib/types'

interface StudentDataValue {
  loading: boolean
  error: boolean
  me: StudentSelf | null
  sections: Section[]
  /** Frozen, twice-daily leaderboard. */
  leaderboard: LeaderboardEntry[]
  /** When the frozen leaderboard was captured (ISO), or null. */
  capturedAt: string | null
  events: PointEvent[]
  /** True while the realtime channel is connected — scores update live. */
  live: boolean
  /** Official (snapshot) rank — settles twice daily. Null if not ranked yet. */
  rank: number | null
  sectionName: (id: string) => string
  refresh: () => Promise<void>
  saveDisplayName: (name: string) => Promise<{ error?: string }>
  /** Upload a new profile picture (≤5 MB image). */
  saveAvatar: (file: File) => Promise<{ error?: string }>
  /** Remove the current profile picture. */
  clearAvatar: () => Promise<{ error?: string }>
  /** The level to celebrate with the burst, or null. */
  levelUp: number | null
  clearLevelUp: () => void
}

const StudentDataContext = createContext<StudentDataValue | undefined>(undefined)

const seenLevelKey = (studentId: string) => `cp_seen_level_${studentId}`
const seenRankKey = (studentId: string) => `cp_seen_rank_${studentId}`

export function StudentDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [me, setMe] = useState<StudentSelf | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [capturedAt, setCapturedAt] = useState<string | null>(null)
  const [events, setEvents] = useState<PointEvent[]>([])
  const [levelUp, setLevelUp] = useState<number | null>(null)
  const [live, setLive] = useState(false)

  // Tracks the level/rank we last reflected, to detect changes.
  const levelRef = useRef<number | null>(null)
  const rankRef = useRef<number | null>(null)
  // Prevents overlapping loads (resync can race the initial/refresh load).
  const inFlightRef = useRef(false)
  // True once the realtime channel has subscribed at least once — a *second*
  // SUBSCRIBED means we reconnected and may have missed awards while away.
  const subscribedOnceRef = useRef(false)

  // Unlock audio playback on the first user gesture (browsers require this).
  useEffect(() => {
    initSound()
  }, [])

  /** Compare a new point total against the last-seen level and celebrate if up. */
  const considerLevelUp = useCallback((studentId: string, totalPoints: number) => {
    const level = getLevelProgress(totalPoints).level
    const stored = Number(localStorage.getItem(seenLevelKey(studentId)) ?? '')
    const baseline = levelRef.current ?? (Number.isFinite(stored) && stored > 0 ? stored : null)
    if (baseline !== null && level > baseline) {
      setLevelUp(level)
      if (document.visibilityState === 'visible') {
        playSound('levelup')
        vibrate('levelup')
      } else {
        // App backgrounded but alive — let the OS pop + buzz it.
        void showLocalNotification({
          title: `Level ${level}! ⭐`,
          body: 'You leveled up — well done!',
          tag: 'cp-level',
        })
      }
    }
    levelRef.current = level
    localStorage.setItem(seenLevelKey(studentId), String(level))
  }, [])

  /** Compare a new rank against the last-seen one and announce any change. */
  const considerRankChange = useCallback(
    (studentId: string, newRank: number | null) => {
      if (newRank == null) return
      const stored = Number(localStorage.getItem(seenRankKey(studentId)) ?? '')
      const baseline = rankRef.current ?? (Number.isFinite(stored) && stored > 0 ? stored : null)
      if (baseline !== null && newRank !== baseline) {
        const improved = newRank < baseline
        if (document.visibilityState === 'visible') {
          playSound('rank')
          vibrate('rank')
          toast(
            improved ? `You climbed to #${newRank}! 📈` : `Your rank is now #${newRank}.`,
            improved ? 'success' : 'info',
          )
        } else {
          void showLocalNotification({
            title: improved ? `You climbed to #${newRank}! 📈` : 'Leaderboard update',
            body: improved ? 'You moved up the ranks.' : `Your rank is now #${newRank}.`,
            tag: 'cp-rank',
          })
        }
      }
      rankRef.current = newRank
      localStorage.setItem(seenRankKey(studentId), String(newRank))
    },
    [toast],
  )

  const load = useCallback(async () => {
    if (!user || inFlightRef.current) return
    inFlightRef.current = true
    setError(false)
    try {
      const [mine, secs, snap] = await Promise.all([
        getMyStudent(user.id),
        listSections(),
        getLeaderboardSnapshot(),
      ])
      setMe(mine)
      setSections(secs)
      setLeaderboard(snap.entries)
      setCapturedAt(snap.capturedAt)
      setEvents(mine ? await listStudentEvents(mine.id) : [])
      if (mine) {
        considerLevelUp(mine.id, mine.lifetime_points)
        const myRank = snap.entries.find((e) => e.student_id === mine.id)?.rank ?? null
        considerRankChange(mine.id, myRank)
      }
    } catch {
      setError(true)
    } finally {
      inFlightRef.current = false
    }
  }, [user, considerLevelUp, considerRankChange])

  // Always call the freshest `load` from listeners/callbacks without making the
  // realtime channel re-subscribe when `load`'s identity changes.
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  // Live updates for the signed-in student's own dashboard.
  //
  // IMPORTANT: depend on the *stable* student id, never the whole `me` object.
  // Each realtime UPDATE calls setMe, so depending on `me` would tear down and
  // re-subscribe the same channel topic on every award — the async removeChannel
  // collides with the new subscribe and the channel dies, so only a full page
  // refresh would show new points. Keying on the id keeps one durable channel.
  const studentId = me?.id
  useEffect(() => {
    if (!studentId) return
    // Heal a rotated/missing push subscription for this device on each open.
    void syncPushSubscription(studentId)
    subscribedOnceRef.current = false
    const channel = supabase
      .channel(`student-self-${studentId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'students', filter: `id=eq.${studentId}` },
        (payload) => {
          const next = payload.new as Partial<StudentSelf>
          setMe((m) => (m ? { ...m, ...next } : m))
          if (typeof next.lifetime_points === 'number') {
            considerLevelUp(studentId, next.lifetime_points)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'point_events',
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          const ev = payload.new as PointEvent
          setEvents((prev) => {
            if (prev.some((e) => e.id === ev.id)) return prev
            // Announce only genuinely new awards (realtime fires post-subscribe).
            const positive = ev.points >= 0
            const amount = positive ? `+${ev.points}` : String(ev.points)
            if (document.visibilityState === 'visible') {
              playSound(positive ? 'point' : 'deduct')
              vibrate(positive ? 'point' : 'deduct')
              toast(
                ev.note ? `${amount} · ${ev.note}` : `${amount} points`,
                positive ? 'success' : 'error',
              )
            } else {
              // App backgrounded but alive — surface an OS notification instead.
              void showLocalNotification({
                title: positive ? `${amount} points 🎉` : `${amount} points`,
                body: ev.note?.trim() || (positive ? 'Nice work — keep it up!' : 'Points deducted.'),
                tag: 'cp-points',
              })
            }
            return [ev, ...prev]
          })
        },
      )
      // The frozen leaderboard is rewritten twice daily; catch our own new rank.
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leaderboard_snapshot',
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          const row = payload.new as { rank?: number }
          if (typeof row.rank === 'number') considerRankChange(studentId, row.rank)
        },
      )
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') {
          // A *second* SUBSCRIBED means we reconnected — postgres_changes does
          // not replay missed rows, so resync to catch awards earned while away.
          if (subscribedOnceRef.current) void loadRef.current()
          subscribedOnceRef.current = true
        }
        if (import.meta.env.DEV && status !== 'SUBSCRIBED') {
          // eslint-disable-next-line no-console
          console.warn('[ClassPoint] realtime channel status:', status)
        }
      })

    return () => {
      setLive(false)
      void supabase.removeChannel(channel)
    }
  }, [studentId, considerLevelUp, considerRankChange, toast])

  // Returning to the tab/app: realtime may have been suspended in the
  // background, so pull fresh data to guarantee the score is current.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const rank = me
    ? leaderboard.find((e) => e.student_id === me.id)?.rank ?? null
    : null

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
        return {}
      } catch {
        return { error: 'Could not save. Please try again.' }
      }
    },
    [me],
  )

  const MAX_AVATAR_BYTES = 5 * 1024 * 1024

  const saveAvatar = useCallback(
    async (file: File) => {
      if (!me || !user) return { error: 'Still loading — try again in a moment.' }
      if (!file.type.startsWith('image/')) return { error: 'Please choose an image file.' }
      if (file.size > MAX_AVATAR_BYTES) return { error: 'Image is too large (max 5 MB).' }
      try {
        const url = await updateAvatar(me.id, user.id, file)
        setMe((m) => (m ? { ...m, avatar_url: url } : m))
        return {}
      } catch {
        return { error: 'Could not upload the picture. Please try again.' }
      }
    },
    [me, user, MAX_AVATAR_BYTES],
  )

  const clearAvatar = useCallback(async () => {
    if (!me) return { error: 'Still loading — try again in a moment.' }
    try {
      await removeAvatar(me.id)
      setMe((m) => (m ? { ...m, avatar_url: null } : m))
      return {}
    } catch {
      return { error: 'Could not remove the picture. Please try again.' }
    }
  }, [me])

  const clearLevelUp = useCallback(() => setLevelUp(null), [])

  return (
    <StudentDataContext.Provider
      value={{
        loading,
        error,
        me,
        sections,
        leaderboard,
        capturedAt,
        events,
        live,
        rank,
        sectionName,
        refresh: load,
        saveDisplayName,
        saveAvatar,
        clearAvatar,
        levelUp,
        clearLevelUp,
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
