import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/lib/auth'
import {
  getAchievementProgress,
  getSpaceAccess,
  getActiveSemester,
  getActiveSessionForStudent,
  getActiveEvent,
  getMyEventStatus,
  getLeaderboardSnapshot,
  getMyAchievements,
  getMyGrades,
  getMySessionStatus,
  getMyStudent,
  getUnreadNotificationCount,
  listMyAttendance,
  listSections,
  listStudentEvents,
  markNotificationsRead,
  removeAvatar,
  setBannerUrls,
  setDisplayTitle as apiSetDisplayTitle,
  setPinnedAchievements as apiSetPinnedAchievements,
  syncAchievements,
  updateAvatar,
  updateProfileFields,
  uploadBannerPhoto,
  uploadHeaderPhoto,
  setHeaderUrl,
  setHeaderPos,
} from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { configureTermCalendar } from '@/lib/term'
import { SPACE_ACCESS_UNKNOWN, type SpaceAccess } from '@/lib/space-gate'
import { getLevelProgress } from '@/lib/leveling'
import { useToast } from '@/components/ui/Toast'
import { initSound, playSound } from '@/lib/sound'
import { vibrate } from '@/lib/haptics'
import { showLocalNotification, syncPushSubscription } from '@/lib/push'
import { syncOfflineScans } from '@/lib/offline-scans'
import type {
  Achievement,
  AchievementProgress,
  AchievementState,
  AttendanceStatus,
  ClassSession,
  EventSession,
  LeaderboardEntry,
  MyAttendanceEntry,
  MyGrades,
  PointEvent,
  Section,
  StudentSelf,
} from '@/lib/types'

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
  awayEvents: PointEvent[]
  /** Dismiss the "while you were away" recap. */
  clearAwayRecap: () => void
  live: boolean
  rank: number | null
  sectionName: (id: string) => string
  refresh: () => Promise<void>
  saveProfile: (fields: {
    displayName: string
    bio: string
    interests: string
  }) => Promise<{ error?: string }>
  /** Upload a new profile picture (≤5 MB image). */
  saveAvatar: (file: File) => Promise<{ error?: string }>
  /** Remove the current profile picture. */
  clearAvatar: () => Promise<{ error?: string }>
  /** Add one showcase banner photo (≤5 MB image, up to 3 total). */
  saveBanner: (file: File) => Promise<{ error?: string }>
  /** Set the wide cover image at the top of the profile (0039). */
  saveHeader: (file: File) => Promise<{ error?: string }>
  /** Remove the cover image, falling back to the plain gradient. */
  clearHeader: () => Promise<{ error?: string }>
  /** Save the cover position, 0-100 (0040). */
  saveHeaderPos: (pos: number) => Promise<{ error?: string }>
  /** Remove one showcase banner photo by URL. */
  removeBanner: (url: string) => Promise<{ error?: string }>
  /** The level to celebrate with the burst, or null. */
  levelUp: number | null
  clearLevelUp: () => void
  achievements: AchievementState[]
  achievementsLoading: boolean
  achievementsError: boolean
  /** Re-fetch the trophy case after a failure. */
  retryAchievements: () => void
  attendanceTick: number
  liveSession: ClassSession | null
  liveStatus: AttendanceStatus | null
  liveEvent: EventSession | null
  /** Whether this student has already checked in to `liveEvent`. */
  liveEventChecked: boolean
  noteEventCheckedIn: () => void
  semesterEnded: boolean
  attendance: MyAttendanceEntry[]
  attendanceLoading: boolean
  grades: MyGrades | null
  gradesLoading: boolean
  gradesError: boolean
  reloadGrades: () => Promise<void>
  /** Raw metric values behind locked achievements' progress bars. */
  achievementProgress: AchievementProgress | null
  unlockedAchievement: Achievement | null
  clearUnlockedAchievement: () => void
  syncMyAchievements: () => Promise<void>
  hasUnseenAchievements: boolean
  markAchievementsSeen: () => void
  setDisplayTitle: (title: string | null) => Promise<{ error?: string }>
  setPinnedAchievements: (codes: string[]) => Promise<{ error?: string }>
  /** Unread notifications — drives the bell badge. */
  unreadCount: number
  markAllRead: () => Promise<void>
  spaceAccess: SpaceAccess
}

const StudentDataContext = createContext<StudentDataValue | undefined>(undefined)

const STALE_AFTER_MS = 2 * 60 * 1000

const seenLevelKey = (studentId: string, semesterId: string) =>
  `cp_seen_level_${studentId}_${semesterId}`
const seenRankKey = (studentId: string, semesterId: string) =>
  `cp_seen_rank_${studentId}_${semesterId}`
const seenEventsKey = (studentId: string) => `cp_events_seen_until_${studentId}`
const seenAchKey = (studentId: string) => `cp_seen_achievements_${studentId}`

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
  const [awayEvents, setAwayEvents] = useState<PointEvent[]>([])
  const [levelUp, setLevelUp] = useState<number | null>(null)
  const [live, setLive] = useState(false)
  const [achievements, setAchievements] = useState<AchievementState[]>([])
  const [achievementsLoading, setAchievementsLoading] = useState(true)
  const [achievementsError, setAchievementsError] = useState(false)
  const [attendanceTick, setAttendanceTick] = useState(0)
  const [liveSession, setLiveSession] = useState<ClassSession | null>(null)
  const [liveStatus, setLiveStatus] = useState<AttendanceStatus | null>(null)
  const [liveEvent, setLiveEvent] = useState<EventSession | null>(null)
  const [liveEventChecked, setLiveEventChecked] = useState(false)
  const [attendance, setAttendance] = useState<MyAttendanceEntry[]>([])
  const [attendanceLoading, setAttendanceLoading] = useState(true)
  const [grades, setGrades] = useState<MyGrades | null>(null)
  const [gradesLoading, setGradesLoading] = useState(true)
  const [gradesError, setGradesError] = useState(false)
  const [achievementProgress, setAchievementProgress] = useState<AchievementProgress | null>(null)
  const [unlockQueue, setUnlockQueue] = useState<Achievement[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [spaceAccess, setSpaceAccess] = useState<SpaceAccess>(SPACE_ACCESS_UNKNOWN)

  // Tracks the level/rank we last reflected, to detect changes.
  const levelRef = useRef<number | null>(null)
  const rankRef = useRef<number | null>(null)
  const semesterIdRef = useRef('')
  const inFlightRef = useRef<Promise<void> | null>(null)
  const recapCheckedRef = useRef(false)
  const subscribedOnceRef = useRef(false)
  const achievementsRef = useRef<AchievementState[]>([])
  useEffect(() => {
    achievementsRef.current = achievements
  }, [achievements])
  const celebratedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    initSound()
  }, [])

  const considerLevelUp = useCallback((studentId: string, totalPoints: number) => {
    const level = getLevelProgress(totalPoints).level
    const stored = Number(localStorage.getItem(seenLevelKey(studentId, semesterIdRef.current)) ?? '')
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
          body: 'You leveled up, well done!',
          tag: 'cp-level',
        })
      }
    }
    levelRef.current = level
    localStorage.setItem(seenLevelKey(studentId, semesterIdRef.current), String(level))
  }, [])

  const considerRankChange = useCallback(
    (studentId: string, newRank: number | null) => {
      if (newRank == null) return
      const stored = Number(localStorage.getItem(seenRankKey(studentId, semesterIdRef.current)) ?? '')
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
      localStorage.setItem(seenRankKey(studentId, semesterIdRef.current), String(newRank))
    },
    [toast],
  )

  const loadAttendance = useCallback(async (studentId: string) => {
    try {
      setAttendance(await listMyAttendance(studentId))
    } catch {
      /* keep whatever we had */
    } finally {
      setAttendanceLoading(false)
    }
  }, [])

  const loadGrades = useCallback(async () => {
    setGradesError(false)
    try {
      setGrades(await getMyGrades())
    } catch {
      setGradesError(true)
    } finally {
      setGradesLoading(false)
    }
  }, [])

  const loadAchievements = useCallback(async (studentId: string) => {
    setAchievementsError(false)
    try {
      const [list, progress] = await Promise.all([
        getMyAchievements(studentId),
        getAchievementProgress(studentId),
      ])
      setAchievements(list)
      setAchievementProgress(progress)
    } catch {
      setAchievementsError(true)
    }
  }, [])

  const retryAchievements = useCallback(() => {
    if (!me?.id) return
    setAchievementsLoading(true)
    void loadAchievements(me.id).finally(() => setAchievementsLoading(false))
  }, [me?.id, loadAchievements])

  const celebrate = useCallback((a: Achievement) => {
    if (celebratedRef.current.has(a.code)) return
    celebratedRef.current.add(a.code)
    setUnlockQueue((q) => [...q, a])
    if (document.visibilityState === 'visible') {
      playSound('levelup')
      vibrate('levelup')
    } else {
      void showLocalNotification({
        title: `Achievement unlocked: ${a.name} 🏆`,
        body: a.titleText ? `New title: "${a.titleText}"` : 'Nice work, check it out!',
        tag: 'cp-achievement',
      })
    }
  }, [])

  const runAchievementSync = useCallback(
    async (studentId: string) => {
      try {
        const unlocked = await syncAchievements(studentId)
        if (unlocked.length === 0) return
        let catalog = achievementsRef.current
        if (catalog.length === 0) {
          catalog = await getMyAchievements(studentId).catch(() => [])
        }
        const byCode = new Map(catalog.map((a) => [a.code, a]))
        for (const u of unlocked) {
          const full = byCode.get(u.code)
          if (full) celebrate(full)
        }
        await loadAchievements(studentId)
      } catch {
        /* non-fatal — the next opportunistic call will retry */
      }
    },
    [celebrate, loadAchievements],
  )

  const userId = user?.id
  const load = useCallback(async () => {
    if (!userId) return
    if (inFlightRef.current) return inFlightRef.current
    const run = (async () => {
    setError(false)
    try {
      const semester = await getActiveSemester().catch(() => null)
      if (semester) {
        semesterIdRef.current = semester.id
        configureTermCalendar({
          semesterId: semester.id,
          semesterName: semester.name,
          startsOn: semester.startsOn,
          terms: semester.terms,
        })
      }
      const [mine, secs, snap] = await Promise.all([
        getMyStudent(userId),
        listSections(semester?.id),
        getLeaderboardSnapshot(),
      ])
      setMe(mine)
      setSections(secs)
      setLeaderboard(snap.entries)
      setCapturedAt(snap.capturedAt)
      const myEvents = mine ? await listStudentEvents(mine.id) : []
      setEvents(myEvents)
      if (mine) {
        if (!recapCheckedRef.current) {
          recapCheckedRef.current = true
          try {
            const until = localStorage.getItem(seenEventsKey(mine.id))
            if (until) {
              const away = myEvents.filter((e) => new Date(e.created_at) > new Date(until))
              if (away.length > 0) setAwayEvents(away)
            }
            localStorage.setItem(seenEventsKey(mine.id), new Date().toISOString())
          } catch {
            /* storage unavailable — skip the recap */
          }
        }
        considerLevelUp(mine.id, mine.semester_points)
        const myRank = snap.entries.find((e) => e.student_id === mine.id)?.rank ?? null
        considerRankChange(mine.id, myRank)
        void getUnreadNotificationCount(mine.id).then(setUnreadCount).catch(() => {})
        void getSpaceAccess().then(setSpaceAccess).catch(() => {})
        void getActiveSessionForStudent(mine.section_id)
          .then(setLiveSession)
          .catch(() => {})
        void getActiveEvent()
          .then((ev) => {
            setLiveEvent(ev)
            if (ev) void getMyEventStatus(ev.id, mine.id).then(setLiveEventChecked).catch(() => {})
            else setLiveEventChecked(false)
          })
          .catch(() => {})
        void loadAchievements(mine.id).finally(() => setAchievementsLoading(false))
        void loadAttendance(mine.id)
        void loadGrades()
        void runAchievementSync(mine.id)
      }
    } catch {
      setError(true)
    } finally {
      inFlightRef.current = null
    }
    })()
    inFlightRef.current = run
    return run
  }, [userId, considerLevelUp, considerRankChange, loadAchievements, loadAttendance, loadGrades, runAchievementSync])

  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  const studentId = me?.id
  const sectionId = me?.section_id
  useEffect(() => {
    if (!studentId) return
    void syncPushSubscription(studentId)
    subscribedOnceRef.current = false
    const channel = supabase
      .channel(`student-self-${studentId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'students', filter: `id=eq.${studentId}` },
        (payload) => {
          const { lifetime_points, ...rest } = payload.new as Record<string, unknown>
          setMe((m) =>
            m
              ? {
                  ...m,
                  ...(rest as Partial<StudentSelf>),
                  ...(typeof lifetime_points === 'number'
                    ? { all_time_points: lifetime_points }
                    : {}),
                }
              : m,
          )
          if (typeof rest.semester_points === 'number') {
            considerLevelUp(studentId, rest.semester_points)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_records',
          filter: `student_id=eq.${studentId}`,
        },
        () => setAttendanceTick((n) => n + 1),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'class_sessions',
          filter: `section_id=eq.${sectionId}`,
        },
        () => {
          if (!sectionId) return
          void getActiveSessionForStudent(sectionId)
            .then(setLiveSession)
            .catch(() => {})
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_sessions' },
        () => {
          void getActiveEvent()
            .then((ev) => {
              setLiveEvent(ev)
              if (ev && studentId) {
                void getMyEventStatus(ev.id, studentId).then(setLiveEventChecked).catch(() => {})
              } else {
                setLiveEventChecked(false)
              }
            })
            .catch(() => {})
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
              void showLocalNotification({
                title: positive ? `${amount} points 🎉` : `${amount} points`,
                body: ev.note?.trim() || (positive ? 'Nice work, keep it up!' : 'Points deducted.'),
                tag: 'cp-points',
              })
            }
            return [ev, ...prev]
          })
          try {
            localStorage.setItem(seenEventsKey(studentId), new Date().toISOString())
          } catch {
            /* ignore */
          }
        },
      )
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
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `student_id=eq.${studentId}`,
        },
        () => setUnreadCount((c) => c + 1),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'point_redemptions',
          filter: `student_id=eq.${studentId}`,
        },
        () => void loadGrades(),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'student_achievements',
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          const row = payload.new as { achievement_code: string }
          const full = achievementsRef.current.find((a) => a.code === row.achievement_code)
          if (full) celebrate(full)
          void loadAchievements(studentId)
        },
      )
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') {
          if (subscribedOnceRef.current) void loadRef.current()
          subscribedOnceRef.current = true
        }
        if (import.meta.env.DEV && status !== 'SUBSCRIBED') {
          console.warn('[ClassPoint] realtime channel status:', status)
        }
      })

    return () => {
      setLive(false)
      void supabase.removeChannel(channel)
    }
  }, [
    studentId,
    sectionId,
    considerLevelUp,
    considerRankChange,
    toast,
    celebrate,
    loadAchievements,
    loadGrades,
  ])

  useEffect(() => {
    if (!studentId || attendanceTick === 0) return
    void loadAttendance(studentId)
  }, [studentId, attendanceTick, loadAttendance])

  const liveSessionId = liveSession?.id
  useEffect(() => {
    if (!liveSessionId || !studentId) {
      setLiveStatus(null)
      return
    }
    let cancelled = false
    void getMySessionStatus(liveSessionId, studentId)
      .then((s) => !cancelled && setLiveStatus(s))
      .catch(() => {
        /* non-fatal — the banner just keeps prompting */
      })
    return () => {
      cancelled = true
    }
  }, [liveSessionId, studentId, attendanceTick])

  useEffect(() => {
    const hiddenSince = { at: 0 }
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince.at = Date.now()
        return
      }
      const away = Date.now() - hiddenSince.at
      hiddenSince.at = 0
      if (away > STALE_AFTER_MS) void loadRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    if (!studentId) return
    void syncOfflineScans()
    const onOnline = () => void syncOfflineScans()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [studentId])

  const rank = me
    ? leaderboard.find((e) => e.student_id === me.id)?.rank ?? null
    : null

  const semesterEnded =
    !!me && sections.length > 0 && !sections.some((s) => s.id === me.section_id)

  const sectionName = useCallback(
    (id: string) => sections.find((s) => s.id === id)?.name ?? '',
    [sections],
  )

  const saveProfile = useCallback(
    async (fields: { displayName: string; bio: string; interests: string }) => {
      if (!me) return { error: 'Still loading, try again in a moment.' }
      const name = fields.displayName.trim()
      if (name.length < 2) return { error: 'Use at least 2 characters for your display name.' }
      if (name.length > 40) return { error: 'Keep your display name under 40 characters.' }
      const bio = fields.bio.trim()
      if (bio.length > 160) return { error: 'Keep your bio under 160 characters.' }
      const interests = fields.interests.trim()
      if (interests.length > 120) return { error: 'Keep your interests under 120 characters.' }
      const nextBio = bio === '' ? null : bio
      const nextInterests = interests === '' ? null : interests
      try {
        await updateProfileFields(me.id, {
          display_name: name,
          bio: nextBio,
          interests: nextInterests,
        })
        setMe((m) =>
          m ? { ...m, display_name: name, bio: nextBio, interests: nextInterests } : m,
        )
        void runAchievementSync(me.id) // may clear "Open Book"
        return {}
      } catch {
        return { error: 'Could not save. Please try again.' }
      }
    },
    [me, runAchievementSync],
  )

  const MAX_AVATAR_BYTES = 5 * 1024 * 1024

  const saveAvatar = useCallback(
    async (file: File) => {
      if (!me || !user) return { error: 'Still loading, try again in a moment.' }
      if (!file.type.startsWith('image/')) return { error: 'Please choose an image file.' }
      if (file.size > MAX_AVATAR_BYTES) return { error: 'Image is too large (max 5 MB).' }
      try {
        const url = await updateAvatar(me.id, user.id, file)
        setMe((m) => (m ? { ...m, avatar_url: url } : m))
        void runAchievementSync(me.id) // may clear "Picture Perfect"
        return {}
      } catch {
        return { error: 'Could not upload the picture. Please try again.' }
      }
    },
    [me, user, MAX_AVATAR_BYTES, runAchievementSync],
  )

  const clearAvatar = useCallback(async () => {
    if (!me) return { error: 'Still loading, try again in a moment.' }
    try {
      await removeAvatar(me.id)
      setMe((m) => (m ? { ...m, avatar_url: null } : m))
      return {}
    } catch {
      return { error: 'Could not remove the picture. Please try again.' }
    }
  }, [me])

  const saveHeader = useCallback(
    async (file: File) => {
      if (!me || !user) return { error: 'Still loading, try again in a moment.' }
      if (!file.type.startsWith('image/')) return { error: 'Please choose an image file.' }
      if (file.size > MAX_AVATAR_BYTES) return { error: 'Image is too large (max 5 MB).' }
      try {
        const url = await uploadHeaderPhoto(user.id, file)
        await setHeaderUrl(me.id, url)
        setMe((m) => (m ? { ...m, header_url: url, header_pos: 50 } : m))
        return {}
      } catch {
        return { error: 'Could not upload the cover photo. Please try again.' }
      }
    },
    [me, user, MAX_AVATAR_BYTES],
  )

  const saveHeaderPos = useCallback(
    async (pos: number) => {
      if (!me) return { error: 'Still loading, try again in a moment.' }
      const clamped = Math.max(0, Math.min(100, Math.round(pos)))
      const previous = me.header_pos
      setMe((m) => (m ? { ...m, header_pos: clamped } : m))
      try {
        await setHeaderPos(me.id, clamped)
        return {}
      } catch {
        setMe((m) => (m ? { ...m, header_pos: previous } : m))
        return { error: 'Could not save the cover position.' }
      }
    },
    [me],
  )

  const clearHeader = useCallback(async () => {
    if (!me) return { error: 'Still loading, try again in a moment.' }
    try {
      await setHeaderUrl(me.id, null)
      setMe((m) => (m ? { ...m, header_url: null, header_pos: 50 } : m))
      return {}
    } catch {
      return { error: 'Could not remove the cover photo. Please try again.' }
    }
  }, [me])

  const saveBanner = useCallback(
    async (file: File) => {
      if (!me || !user) return { error: 'Still loading, try again in a moment.' }
      if (!file.type.startsWith('image/')) return { error: 'Please choose an image file.' }
      if (file.size > MAX_AVATAR_BYTES) return { error: 'Image is too large (max 5 MB).' }
      const current = me.banner_urls ?? []
      if (current.length >= 3) return { error: 'You can add up to 3 photos.' }
      try {
        const url = await uploadBannerPhoto(user.id, file)
        const next = [...current, url]
        await setBannerUrls(me.id, next)
        setMe((m) => (m ? { ...m, banner_urls: next } : m))
        void runAchievementSync(me.id) // may clear "Show and Tell"
        return {}
      } catch {
        return { error: 'Could not upload the photo. Please try again.' }
      }
    },
    [me, user, MAX_AVATAR_BYTES, runAchievementSync],
  )

  const removeBanner = useCallback(
    async (url: string) => {
      if (!me) return { error: 'Still loading, try again in a moment.' }
      const next = (me.banner_urls ?? []).filter((u) => u !== url)
      try {
        await setBannerUrls(me.id, next)
        setMe((m) => (m ? { ...m, banner_urls: next } : m))
        return {}
      } catch {
        return { error: 'Could not remove the photo. Please try again.' }
      }
    },
    [me],
  )

  const clearLevelUp = useCallback(() => setLevelUp(null), [])
  const clearAwayRecap = useCallback(() => setAwayEvents([]), [])
  const noteEventCheckedIn = useCallback(() => setLiveEventChecked(true), [])

  const [achSeenBump, setAchSeenBump] = useState(0)
  const hasUnseenAchievements = useMemo(() => {
    if (!me) return false
    let seen: string[]
    try {
      seen = JSON.parse(localStorage.getItem(seenAchKey(me.id)) ?? '[]')
    } catch {
      seen = []
    }
    const seenSet = new Set(seen)
    return achievements.some((a) => a.unlockedAt && !seenSet.has(a.code))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, achievements, achSeenBump])
  const markAchievementsSeen = useCallback(() => {
    if (!me) return
    const codes = achievements.filter((a) => a.unlockedAt).map((a) => a.code)
    try {
      localStorage.setItem(seenAchKey(me.id), JSON.stringify(codes))
    } catch {
      /* storage unavailable — the dot just persists */
    }
    setAchSeenBump((v) => v + 1)
  }, [me, achievements])

  const syncMyAchievements = useCallback(async () => {
    if (!me) return
    await runAchievementSync(me.id)
  }, [me, runAchievementSync])

  const setDisplayTitleField = useCallback(
    async (title: string | null) => {
      if (!me) return { error: 'Still loading, try again in a moment.' }
      try {
        await apiSetDisplayTitle(me.id, title)
        setMe((m) => (m ? { ...m, display_title: title } : m))
        return {}
      } catch {
        return { error: 'Could not equip that title. Please try again.' }
      }
    },
    [me],
  )

  const setPinnedAchievementsField = useCallback(
    async (codes: string[]) => {
      if (!me) return { error: 'Still loading, try again in a moment.' }
      try {
        await apiSetPinnedAchievements(me.id, codes)
        setMe((m) => (m ? { ...m, pinned_achievements: codes.length ? codes : null } : m))
        return {}
      } catch {
        return { error: 'Could not update your pinned badges. Please try again.' }
      }
    },
    [me],
  )

  const unlockedAchievement = unlockQueue[0] ?? null
  const clearUnlockedAchievement = useCallback(() => setUnlockQueue((q) => q.slice(1)), [])

  /** Bell sheet opened — everything up to now counts as read. */
  const markAllRead = useCallback(async () => {
    setUnreadCount(0)
    try {
      await markNotificationsRead()
    } catch {
      /* best-effort */
    }
  }, [])

  const value = useMemo<StudentDataValue>(
    () => ({
      loading,
      error,
      me,
      sections,
      leaderboard,
      capturedAt,
      events,
      awayEvents,
      clearAwayRecap,
      live,
      rank,
      sectionName,
      refresh: load,
      saveProfile,
      saveAvatar,
      clearAvatar,
      saveBanner,
      saveHeader,
      clearHeader,
      saveHeaderPos,
      removeBanner,
      levelUp,
      clearLevelUp,
      achievements,
      achievementsLoading,
      achievementsError,
      retryAchievements,
      attendanceTick,
      liveSession,
      liveStatus,
      liveEvent,
      liveEventChecked,
      noteEventCheckedIn,
      semesterEnded,
      attendance,
      attendanceLoading,
      grades,
      gradesLoading,
      gradesError,
      reloadGrades: loadGrades,
      achievementProgress,
      unlockedAchievement,
      clearUnlockedAchievement,
      syncMyAchievements,
      hasUnseenAchievements,
      markAchievementsSeen,
      setDisplayTitle: setDisplayTitleField,
      setPinnedAchievements: setPinnedAchievementsField,
      unreadCount,
      markAllRead,
      spaceAccess,
    }),
    [loading, error, me, sections, leaderboard, capturedAt, events, awayEvents, clearAwayRecap, live, rank, sectionName, load, saveProfile, saveAvatar, clearAvatar, saveBanner, saveHeader, clearHeader, saveHeaderPos, removeBanner, levelUp, clearLevelUp, achievements, achievementsLoading, achievementsError, retryAchievements, attendanceTick, liveSession, liveStatus, liveEvent, liveEventChecked, noteEventCheckedIn, semesterEnded, attendance, attendanceLoading, grades, gradesLoading, gradesError, loadGrades, achievementProgress, unlockedAchievement, clearUnlockedAchievement, syncMyAchievements, hasUnseenAchievements, markAchievementsSeen, setDisplayTitleField, setPinnedAchievementsField, unreadCount, markAllRead, spaceAccess],
  )

  return (
    <StudentDataContext.Provider value={value}
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

export function useStudentDataOptional(): StudentDataValue | undefined {
  return useContext(StudentDataContext)
}
