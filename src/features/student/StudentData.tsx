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
  getActiveSemester,
  getActiveSessionForStudent,
  getLeaderboardSnapshot,
  getMyAchievements,
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
} from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { configureTermCalendar } from '@/lib/term'
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
  LeaderboardEntry,
  MyAttendanceEntry,
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
  /** Points/penalties received while the app was closed — drives the recap modal. */
  awayEvents: PointEvent[]
  /** Dismiss the "while you were away" recap. */
  clearAwayRecap: () => void
  /** True while the realtime channel is connected — scores update live. */
  live: boolean
  /** Official (snapshot) rank — settles twice daily. Null if not ranked yet. */
  rank: number | null
  sectionName: (id: string) => string
  refresh: () => Promise<void>
  /** Save the public profile fields (display name + optional bio/interests). */
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
  /** Remove one showcase banner photo by URL. */
  removeBanner: (url: string) => Promise<{ error?: string }>
  /** The level to celebrate with the burst, or null. */
  levelUp: number | null
  clearLevelUp: () => void
  /** The full catalog merged with the signed-in student's unlock state. */
  achievements: AchievementState[]
  achievementsLoading: boolean
  /** True when the trophy case failed to load — drives its retry card. */
  achievementsError: boolean
  /** Re-fetch the trophy case after a failure. */
  retryAchievements: () => void
  /**
   * Bumps whenever one of this student's attendance records changes (an
   * instructor correction, a committed penalty). The Attendance screen watches
   * it and refetches — it owns its own history list, so this is a signal, not
   * the data.
   */
  attendanceTick: number
  /**
   * The student's section's currently-running class, or null (0033). Drives the
   * live banner on the Dashboard and Attendance screens; kept live by a
   * `class_sessions` subscription on the durable channel, so it appears the
   * moment the instructor starts class and clears when they end it.
   */
  liveSession: ClassSession | null
  /**
   * This student's status in `liveSession`, or null if they haven't been marked
   * yet. Lets the banner say "You're in" instead of prompting someone who has
   * already scanned.
   */
  liveStatus: AttendanceStatus | null
  /**
   * True when this student's section belongs to a semester that has ENDED
   * (0035). Their account, points, badges and history all still open — nothing
   * can change, and `scan_attendance` refuses their check-ins server-side.
   *
   * Detected without an extra query: `sections` is already scoped to the active
   * semester, so a section_id missing from it means the semester moved on.
   */
  semesterEnded: boolean
  /**
   * The student's own attendance history, loaded off the critical path (like
   * achievements) and refreshed whenever attendanceTick bumps.
   *
   * Shared by the Dashboard teaser and the detailed stats screen so neither
   * has to re-query. The Attendance screen deliberately keeps its own fetch:
   * it owns a loadError/retry state this provider has no business carrying.
   */
  attendance: MyAttendanceEntry[]
  attendanceLoading: boolean
  /** Raw metric values behind locked achievements' progress bars. */
  achievementProgress: AchievementProgress | null
  /** The achievement to celebrate with the unlock burst right now, or null. */
  unlockedAchievement: Achievement | null
  /** Dismiss the current celebration and advance to the next queued one, if any. */
  clearUnlockedAchievement: () => void
  /** Re-check the signed-in student's achievements against their current stats. */
  syncMyAchievements: () => Promise<void>
  /** True when the student has newly-unlocked badges they haven't viewed yet. */
  hasUnseenAchievements: boolean
  /** Mark all currently-unlocked achievements as seen (clears the nudge dot). */
  markAchievementsSeen: () => void
  /** Equip (or clear, with null) a display title — must be one already unlocked. */
  setDisplayTitle: (title: string | null) => Promise<{ error?: string }>
  /** Choose up to 3 unlocked achievements to feature on the profile. */
  setPinnedAchievements: (codes: string[]) => Promise<{ error?: string }>
  /** Unread notifications — drives the bell badge. */
  unreadCount: number
  /** Mark every notification read (bell sheet open); clears the badge. */
  markAllRead: () => Promise<void>
}

const StudentDataContext = createContext<StudentDataValue | undefined>(undefined)

// Level and rank baselines are SEMESTER-scoped (0029): points reset each
// semester, so a baseline carried over from the last one would silently suppress
// every level-up celebration until the student climbed past their old peak.
const seenLevelKey = (studentId: string, semesterId: string) =>
  `cp_seen_level_${studentId}_${semesterId}`
const seenRankKey = (studentId: string, semesterId: string) =>
  `cp_seen_rank_${studentId}_${semesterId}`
// Timestamp through which the student has already seen their point events; events
// newer than this on the next open are recapped in the "while you were away" modal.
const seenEventsKey = (studentId: string) => `cp_events_seen_until_${studentId}`
// Codes of the achievements the student has already looked at (in the trophy
// case). Anything unlocked but not in here drives the "new badge" nudge dot.
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
  // Increments whenever one of this student's attendance records changes.
  const [attendanceTick, setAttendanceTick] = useState(0)
  // The section's running class, if any (0033), and our own status in it.
  const [liveSession, setLiveSession] = useState<ClassSession | null>(null)
  const [liveStatus, setLiveStatus] = useState<AttendanceStatus | null>(null)
  // Attendance history, shared by the Dashboard teaser and the stats screen.
  const [attendance, setAttendance] = useState<MyAttendanceEntry[]>([])
  const [attendanceLoading, setAttendanceLoading] = useState(true)
  const [achievementProgress, setAchievementProgress] = useState<AchievementProgress | null>(null)
  // Achievements queued to celebrate, shown one at a time (oldest first).
  const [unlockQueue, setUnlockQueue] = useState<Achievement[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  // Tracks the level/rank we last reflected, to detect changes.
  const levelRef = useRef<number | null>(null)
  const rankRef = useRef<number | null>(null)
  // Active semester id, read from callbacks that must not re-create on load.
  // Empty until the first load resolves — the storage keys tolerate that.
  const semesterIdRef = useRef('')
  // Holds the RUNNING load so overlapping callers await it instead of getting
  // an instant no-op (see load() — pull-to-refresh depends on this).
  const inFlightRef = useRef<Promise<void> | null>(null)
  // The away-recap is computed once per app open, not on every visibility refresh.
  const recapCheckedRef = useRef(false)
  // True once the realtime channel has subscribed at least once — a *second*
  // SUBSCRIBED means we reconnected and may have missed awards while away.
  const subscribedOnceRef = useRef(false)
  // Latest achievements list, readable from callbacks without re-subscribing
  // effects (mirrors the loadRef pattern below).
  const achievementsRef = useRef<AchievementState[]>([])
  useEffect(() => {
    achievementsRef.current = achievements
  }, [achievements])
  // Codes already queued/celebrated this session — a sync's own return value
  // and the realtime echo of that same insert both try to celebrate the same
  // unlock, so this dedupes whichever arrives first.
  const celebratedRef = useRef<Set<string>>(new Set())

  // Unlock audio playback on the first user gesture (browsers require this).
  useEffect(() => {
    initSound()
  }, [])

  /** Compare a new point total against the last-seen level and celebrate if up. */
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
          body: 'You leveled up — well done!',
          tag: 'cp-level',
        })
      }
    }
    levelRef.current = level
    localStorage.setItem(seenLevelKey(studentId, semesterIdRef.current), String(level))
  }, [])

  /** Compare a new rank against the last-seen one and announce any change. */
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

  /** Refresh the achievement catalog + this student's unlock state/progress. */
  /**
   * Attendance history. Failures leave the last-known list in place and just
   * stop the spinner: the teaser and stats screen both degrade to showing
   * nothing rather than claiming a student has no record.
   */
  const loadAttendance = useCallback(async (studentId: string) => {
    try {
      setAttendance(await listMyAttendance(studentId))
    } catch {
      /* keep whatever we had */
    } finally {
      setAttendanceLoading(false)
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
      // Surfaced, not swallowed: an empty catalog hides the filter chips, so
      // the screen used to show "try a different filter" with no filters and
      // no way back short of reloading the app.
      setAchievementsError(true)
    }
  }, [])

  /** Retry the trophy case after a failed load (drives its error card). */
  const retryAchievements = useCallback(() => {
    if (!me?.id) return
    setAchievementsLoading(true)
    void loadAchievements(me.id).finally(() => setAchievementsLoading(false))
  }, [me?.id, loadAchievements])

  /** Queue a celebration for one newly-unlocked achievement, once per code. */
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
        body: a.titleText ? `New title: "${a.titleText}"` : 'Nice work — check it out!',
        tag: 'cp-achievement',
      })
    }
  }, [])

  /** Re-evaluate this student's auto-computed achievements against current
   * stats. Safe to call often — the RPC is idempotent and only ever reports
   * genuinely new unlocks, which get queued for the celebration burst. */
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

  const load = useCallback(async () => {
    if (!user) return
    // Return the RUNNING load rather than resolving instantly: pull-to-refresh
    // awaits this, and an undefined return snapped the spinner back with
    // nothing having happened whenever a visibility refresh was already in
    // flight — which is exactly when the student pulls.
    if (inFlightRef.current) return inFlightRef.current
    const run = (async () => {
    setError(false)
    try {
      // The semester resolves first because the section list is scoped to it:
      // an unscoped list fills the leaderboard's view picker with every past
      // semester's sections, each of which renders an empty board.
      const semester = await getActiveSemester().catch(() => null)
      if (semester) {
        semesterIdRef.current = semester.id
        // Configure the term calendar for the WHOLE student area (Phase F).
        // InstructorLayout has always done this for /teach, but nothing did it
        // for /app — so every student-side week number and term label silently
        // used term.ts's hardcoded fallback dates. That happens to match this
        // semester, which is exactly why it would have gone unnoticed until the
        // instructor moved a term date around a holiday.
        configureTermCalendar({
          semesterId: semester.id,
          semesterName: semester.name,
          startsOn: semester.startsOn,
          terms: semester.terms,
        })
      }
      const [mine, secs, snap] = await Promise.all([
        getMyStudent(user.id),
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
        // Once per app open: recap any points/penalties earned while it was
        // closed (events newer than the last timestamp the student saw).
        if (!recapCheckedRef.current) {
          recapCheckedRef.current = true
          try {
            const until = localStorage.getItem(seenEventsKey(mine.id))
            if (until) {
              const away = myEvents.filter((e) => new Date(e.created_at) > new Date(until))
              if (away.length > 0) setAwayEvents(away)
            }
            // First run (no stored value) just establishes the baseline — no recap.
            localStorage.setItem(seenEventsKey(mine.id), new Date().toISOString())
          } catch {
            /* storage unavailable — skip the recap */
          }
        }
        considerLevelUp(mine.id, mine.semester_points)
        const myRank = snap.entries.find((e) => e.student_id === mine.id)?.rank ?? null
        considerRankChange(mine.id, myRank)
        // Bell badge — independent of the main load; failures just keep the
        // last-known count.
        void getUnreadNotificationCount(mine.id).then(setUnreadCount).catch(() => {})
        // Is class running right now? Independent of the main load — a failure
        // just leaves the banner hidden, never blocks the dashboard.
        void getActiveSessionForStudent(mine.section_id)
          .then(setLiveSession)
          .catch(() => {})
        // Independent of the main load — achievements populate the trophy
        // case as soon as they're ready without delaying the dashboard.
        void loadAchievements(mine.id).finally(() => setAchievementsLoading(false))
        void loadAttendance(mine.id)
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
  }, [user, considerLevelUp, considerRankChange, loadAchievements, loadAttendance, runAchievementSync])

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
  // Also stable (a string, not an object) — it only changes if the instructor
  // actually moves this student to another section, which SHOULD re-subscribe.
  const sectionId = me?.section_id
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
          // The payload is the RAW db row, where lifetime_points is the career
          // total the app models as all_time_points. Translate rather than
          // spreading it blind, or the "all-time" figure would never update.
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
      // Attendance corrections. attendance_records has been in the realtime
      // publication since 0014 and the student can read their own rows, but
      // nothing subscribed — so an instructor fixing a wrong "absent" stayed
      // invisible until the screen remounted. Bumped through `attendanceTick`
      // so the Attendance screen can refetch without this provider owning its
      // history list.
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
      // Live class awareness (0033). `class_sessions` joined the realtime
      // publication in that migration; before it, a student could only learn
      // class had started by being in the room.
      //
      // Any event re-reads the active session rather than patching state from
      // the payload: the payload is the raw row with no `subjects` join, so the
      // banner would lose its subject name, and an UPDATE that sets ended_at
      // has to clear the banner. One small query on an event that fires twice a
      // day is the cheaper correctness.
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
          // Seen live — advance the recap baseline so it isn't shown next open.
          try {
            localStorage.setItem(seenEventsKey(studentId), new Date().toISOString())
          } catch {
            /* ignore */
          }
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
      // Every queued notification bumps the bell badge live. The row is
      // history; the point/achievement listeners above stay the live surface
      // (toast/sound), so no announcement here — just the count.
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
      // Catches instructor-granted achievements live (self-triggered unlocks
      // already celebrate synchronously from syncAchievements' own return
      // value — `celebrate()` dedupes so this never double-fires for those).
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
          // A *second* SUBSCRIBED means we reconnected — postgres_changes does
          // not replay missed rows, so resync to catch awards earned while away.
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
  ])

  /**
   * Re-read attendance whenever one of this student's records changes.
   *
   * `attendanceTick` already fires on the durable channel for exactly this —
   * an instructor correcting a wrong 'absent' now reaches the Dashboard teaser
   * and the stats screen live, not just the Attendance tab.
   */
  useEffect(() => {
    if (!studentId || attendanceTick === 0) return
    void loadAttendance(studentId)
  }, [studentId, attendanceTick, loadAttendance])

  /**
   * Keep the banner's "already checked in" state honest.
   *
   * Re-runs on `attendanceTick` because the student's own scan is what flips
   * this, and a scan arrives as an attendance_records change on the durable
   * channel above — so the banner switches from "Scan now" to "You're in"
   * without anyone navigating anywhere.
   */
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

  // Returning to the tab/app: realtime may have been suspended in the
  // background, so pull fresh data to guarantee the score is current.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Offline attendance queue: flush on app start (once signed in) and whenever
  // the network returns. This single durable mount owns those triggers; the
  // Attendance page also flushes on its own mount for immediate feedback.
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

  // Guarded on `sections.length > 0`: mid-load the list is empty, and without
  // the guard every student would flash "this semester has ended" on open.
  const semesterEnded =
    !!me && sections.length > 0 && !sections.some((s) => s.id === me.section_id)

  const sectionName = useCallback(
    (id: string) => sections.find((s) => s.id === id)?.name ?? '',
    [sections],
  )

  const saveProfile = useCallback(
    async (fields: { displayName: string; bio: string; interests: string }) => {
      if (!me) return { error: 'Still loading — try again in a moment.' }
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
      if (!me || !user) return { error: 'Still loading — try again in a moment.' }
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
    if (!me) return { error: 'Still loading — try again in a moment.' }
    try {
      await removeAvatar(me.id)
      setMe((m) => (m ? { ...m, avatar_url: null } : m))
      return {}
    } catch {
      return { error: 'Could not remove the picture. Please try again.' }
    }
  }, [me])

  const saveBanner = useCallback(
    async (file: File) => {
      if (!me || !user) return { error: 'Still loading — try again in a moment.' }
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
      if (!me) return { error: 'Still loading — try again in a moment.' }
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

  // "New badge" nudge: any unlocked achievement whose code the student hasn't
  // viewed in the trophy case yet. `achSeenBump` forces a recompute after marking.
  const [achSeenBump, setAchSeenBump] = useState(0)
  const hasUnseenAchievements = useMemo(() => {
    if (!me) return false
    let seen: string[] = []
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

  /** Exposed for other student pages (e.g. after scanning attendance, or
   * after viewing a classmate's profile) to opportunistically re-check. */
  const syncMyAchievements = useCallback(async () => {
    if (!me) return
    await runAchievementSync(me.id)
  }, [me, runAchievementSync])

  const setDisplayTitleField = useCallback(
    async (title: string | null) => {
      if (!me) return { error: 'Still loading — try again in a moment.' }
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
      if (!me) return { error: 'Still loading — try again in a moment.' }
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

  // Celebrate the queued achievements one at a time — dismissing pops the
  // front of the queue rather than clearing everything at once.
  const unlockedAchievement = unlockQueue[0] ?? null
  const clearUnlockedAchievement = useCallback(() => setUnlockQueue((q) => q.slice(1)), [])

  /** Bell sheet opened — everything up to now counts as read. */
  const markAllRead = useCallback(async () => {
    setUnreadCount(0) // optimistic; a failure just re-counts on the next load
    try {
      await markNotificationsRead()
    } catch {
      /* best-effort */
    }
  }, [])

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
        semesterEnded,
        attendance,
        attendanceLoading,
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

/**
 * Like {@link useStudentData}, but returns `undefined` instead of throwing when
 * rendered outside a `StudentDataProvider`. For components shared across both the
 * student and instructor areas — e.g. the profile-preview sheet, which the
 * instructor's Rank tab reuses with no student context around it.
 */
export function useStudentDataOptional(): StudentDataValue | undefined {
  return useContext(StudentDataContext)
}
