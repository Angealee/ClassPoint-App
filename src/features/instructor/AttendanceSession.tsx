import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { ClockIcon, ExpandIcon, SearchIcon, SoundIcon, XIcon } from '@/components/ui/icons'
import { QrCode } from '@/components/attendance/QrCode'
import { StatusChip, STATUS_META } from '@/components/attendance/StatusChip'
import {
  endClassSession,
  listSessionAttendance,
  markAttendanceBulk,
  markAttendanceManually,
  resetAttendance,
} from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { initSound, playSound } from '@/lib/sound'
import {
  QR_STEP_SECONDS,
  buildPayload,
  computeCode,
  currentWindow,
  secondsUntilRotate,
} from '@/lib/qr'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { AttendanceRosterRow, AttendanceStatus, ClassSession } from '@/lib/types'

const ORDER: AttendanceStatus[] = ['present', 'late', 'absent']
/** Show the search/filter bar only once the roster is long enough to warrant it. */
const SEARCH_THRESHOLD = 8

/** Elapsed/countdown as h:mm:ss (e.g. "0:00:38", "1:23:45"). */
function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Wall-clock time a student checked in, e.g. "2:34:15 PM". */
function scanTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

const STATUS_TEXT: Record<AttendanceStatus, string> = {
  present: 'text-emerald-600 dark:text-emerald-400',
  late: 'text-gold-600 dark:text-gold-400',
  absent: 'text-brand-600 dark:text-brand-400',
}

/** The live class session: rotating QR + real-time check-in roster. */
export function AttendanceSession({
  session,
  sectionName,
  onEnd,
}: {
  session: ClassSession
  sectionName: string
  onEnd: () => void
}) {
  const { toast } = useToast()
  const [payload, setPayload] = useState('')
  const [rotateIn, setRotateIn] = useState(QR_STEP_SECONDS)
  const [nowMs, setNowMs] = useState(Date.now())
  const [roster, setRoster] = useState<AttendanceRosterRow[]>([])
  // Students the instructor checked in by hand this session (for the "manual" tag).
  const [manualIds, setManualIds] = useState<Set<string>>(new Set())
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [waitingOnly, setWaitingOnly] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [bigSize, setBigSize] = useState(320)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [ending, setEnding] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  // Play a soft chime + flash a row when a student scans in (instructor opt-in).
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem('cp_attendance_chime') === '1'
    } catch {
      return false
    }
  })
  const soundOnRef = useRef(soundOn)
  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])
  // Rows to briefly highlight because a scan just landed.
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  // Stable roster display order (studentId[]) so a manual mark never re-sorts the
  // list and yanks the instructor's scroll — only genuine scans float to the top.
  const [displayOrder, setDisplayOrder] = useState<string[]>([])
  const prevScannedRef = useRef<Set<string>>(new Set())
  const firstOrderRef = useRef(true)

  const startedMs = new Date(session.startedAt).getTime()

  // Rotating QR: recompute the code whenever the time-window ticks over. The
  // clock keeps ticking (for the elapsed timer), but once the Absent-after time
  // passes we stop issuing codes and clear the QR — check-in is over, since any
  // scan then would be Absent anyway.
  useEffect(() => {
    const secret = session.qrSecret
    if (!secret) return
    let cancelled = false
    let lastWindow = -1
    const startMs = new Date(session.startedAt).getTime()
    const update = async () => {
      const now = Date.now()
      setNowMs(now)
      if ((now - startMs) / 60000 >= session.absentAfterMin) {
        if (!cancelled) setPayload('')
        return
      }
      setRotateIn(secondsUntilRotate(now))
      const w = currentWindow(now)
      if (w !== lastWindow) {
        lastWindow = w
        const code = await computeCode(secret, session.id, w)
        if (!cancelled) setPayload(buildPayload(session.id, w, code))
      }
    }
    void update()
    const id = window.setInterval(() => void update(), 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [session.id, session.qrSecret, session.startedAt, session.absentAfterMin])

  // Fullscreen "present" QR sizes to the smaller viewport edge.
  useEffect(() => {
    if (!presenting) return
    const calc = () =>
      setBigSize(Math.max(220, Math.min(560, Math.min(window.innerWidth, window.innerHeight) - 96)))
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [presenting])

  const refresh = useCallback(async () => {
    try {
      setRoster(await listSessionAttendance(session.id, session.sectionId))
    } catch {
      /* transient — realtime or the next poll will catch up */
    }
  }, [session.id, session.sectionId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Apply a single realtime change in place — no full refetch per check-in, so a
  // 40-student rush stays smooth. DELETEs (a reset) only carry the primary key by
  // default, so those fall back to a reconcile.
  const applyChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (payload.eventType === 'DELETE') {
        void refresh()
        return
      }
      const rec = payload.new as {
        id: string
        student_id: string
        status: AttendanceStatus
        scanned_at: string | null
        committed: boolean
      }
      if (!rec?.student_id) {
        void refresh()
        return
      }
      setRoster((rs) => {
        if (!rs.some((r) => r.studentId === rec.student_id)) {
          void refresh() // a student we don't have yet — reconcile the whole roster
          return rs
        }
        return rs.map((r) =>
          r.studentId === rec.student_id
            ? {
                ...r,
                recordId: rec.id,
                status: rec.status,
                scannedAt: rec.scanned_at,
                committed: rec.committed,
              }
            : r,
        )
      })
    },
    [refresh],
  )

  // Live roster — react as students check in. On (re)subscribe we reconcile with a
  // full fetch, and a slow poll backstops a silently-dropped socket (phone sleep,
  // network blip) so the count never stalls.
  useEffect(() => {
    const channel = supabase
      .channel(`attendance-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_records',
          filter: `session_id=eq.${session.id}`,
        },
        applyChange,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refresh()
      })
    const poll = window.setInterval(() => void refresh(), 20000)
    return () => {
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [session.id, applyChange, refresh])

  const waiting = roster.filter((r) => !r.scannedAt)
  const present = roster.filter((r) => r.status === 'present').length
  const late = roster.filter((r) => r.status === 'late').length

  // Maintain a stable display order + react to freshly-landed scans. A genuine QR
  // scan floats to the top (and optionally flashes/chimes); an instructor's manual
  // mark keeps its slot, so tapping a student far down never resets the scroll.
  useEffect(() => {
    // Wait for the first real roster so a session *resume* seeds silently (no
    // flash/chime for everyone who already scanned) rather than treating the
    // empty initial state as "first".
    if (roster.length === 0) return
    const prevScanned = prevScannedRef.current
    const first = firstOrderRef.current
    // New non-manual scans since the last render — recent-first.
    const newScans = roster
      .filter((r) => r.scannedAt && !prevScanned.has(r.studentId) && !manualIds.has(r.studentId))
      .sort((a, b) => (b.scannedAt ?? '').localeCompare(a.scannedAt ?? ''))
      .map((r) => r.studentId)
    // On the first load, seed the whole scanned group recent-first; after that,
    // only the genuinely-new scans float up.
    const floated = first
      ? roster
          .filter((r) => r.scannedAt && !manualIds.has(r.studentId))
          .sort((a, b) => (b.scannedAt ?? '').localeCompare(a.scannedAt ?? ''))
          .map((r) => r.studentId)
      : newScans

    prevScannedRef.current = new Set(roster.filter((r) => r.scannedAt).map((r) => r.studentId))
    firstOrderRef.current = false

    setDisplayOrder((prev) => {
      const ids = new Set(roster.map((r) => r.studentId))
      let order = prev.filter((id) => ids.has(id))
      for (const r of roster) if (!order.includes(r.studentId)) order.push(r.studentId)
      if (floated.length) {
        const fset = new Set(floated)
        order = [...floated, ...order.filter((id) => !fset.has(id))]
      }
      return order
    })

    // Flash + chime only for scans that arrive after the first load.
    if (!first && newScans.length) {
      if (soundOnRef.current) playSound('point')
      setFlashIds((prev) => new Set([...prev, ...newScans]))
      window.setTimeout(() => {
        setFlashIds((prev) => {
          const n = new Set(prev)
          newScans.forEach((id) => n.delete(id))
          return n
        })
      }, 1600)
    }
  }, [roster, manualIds])

  const byId = useMemo(() => new Map(roster.map((r) => [r.studentId, r])), [roster])
  const ordered = useMemo(() => {
    const seen = new Set<string>()
    const out: AttendanceRosterRow[] = []
    for (const id of displayOrder) {
      const r = byId.get(id)
      if (r) {
        out.push(r)
        seen.add(id)
      }
    }
    // Any roster rows the order effect hasn't placed yet (first seed, or a
    // just-added student) fall in at the end so nobody is ever missing.
    for (const r of roster) if (!seen.has(r.studentId)) out.push(r)
    return out
  }, [displayOrder, byId, roster])

  const q = query.trim().toLowerCase()
  const visible = ordered.filter(
    (r) => (!waitingOnly || !r.scannedAt) && (!q || r.fullName.toLowerCase().includes(q)),
  )

  // What a scan (or a smart-default manual mark) earns right now, and the count
  // down to the next status boundary.
  const elapsedMs = Math.max(0, nowMs - startedMs)
  const elapsedMin = elapsedMs / 60000
  // Past the Absent-after mark, the QR stops and check-in is closed.
  const closed = elapsedMin >= session.absentAfterMin
  // Leave fullscreen automatically once check-in closes (no QR left to present).
  useEffect(() => {
    if (closed) setPresenting(false)
  }, [closed])
  const autoStatus: AttendanceStatus =
    elapsedMin >= session.absentAfterMin
      ? 'absent'
      : elapsedMin >= session.lateAfterMin
        ? 'late'
        : 'present'
  const nextLabel = autoStatus === 'present' ? 'Late' : autoStatus === 'late' ? 'Absent' : null
  const nextInMs =
    autoStatus === 'present'
      ? session.lateAfterMin * 60000 - elapsedMs
      : autoStatus === 'late'
        ? session.absentAfterMin * 60000 - elapsedMs
        : 0

  async function mark(studentId: string, status: AttendanceStatus) {
    setPickerFor(null)
    const prev = roster
    const nowIso = new Date().toISOString()
    setRoster((rs) =>
      rs.map((r) => (r.studentId === studentId ? { ...r, status, scannedAt: nowIso } : r)),
    )
    setManualIds((s) => new Set(s).add(studentId))
    try {
      await markAttendanceManually(session.id, studentId, status)
    } catch {
      setRoster(prev)
      setManualIds((s) => {
        const n = new Set(s)
        n.delete(studentId)
        return n
      })
      toast('Could not mark that student. Try again.', 'error')
    }
  }

  async function clearMark(studentId: string) {
    setPickerFor(null)
    const prev = roster
    setRoster((rs) =>
      rs.map((r) =>
        r.studentId === studentId
          ? { ...r, status: null, scannedAt: null, recordId: null, committed: false }
          : r,
      ),
    )
    setManualIds((s) => {
      const n = new Set(s)
      n.delete(studentId)
      return n
    })
    try {
      await resetAttendance(session.id, studentId)
    } catch {
      setRoster(prev)
      toast('Could not reset that student. Try again.', 'error')
    }
  }

  // Mark everyone still waiting at once (roll call, or auto-absent before ending).
  // They're recorded as manual marks, so the roster order stays put.
  async function markAllWaiting(status: AttendanceStatus) {
    setBulkOpen(false)
    const ids = roster.filter((r) => !r.scannedAt).map((r) => r.studentId)
    if (ids.length === 0) return
    const prev = roster
    const nowIso = new Date().toISOString()
    setRoster((rs) => rs.map((r) => (!r.scannedAt ? { ...r, status, scannedAt: nowIso } : r)))
    setManualIds((s) => {
      const n = new Set(s)
      ids.forEach((id) => n.add(id))
      return n
    })
    try {
      await markAttendanceBulk(
        session.id,
        ids.map((studentId) => ({ studentId, status })),
      )
      toast(`Marked ${ids.length} ${STATUS_META[status].label.toLowerCase()}.`, 'success')
    } catch {
      setRoster(prev)
      setManualIds((s) => {
        const n = new Set(s)
        ids.forEach((id) => n.delete(id))
        return n
      })
      toast('Could not mark everyone. Try again.', 'error')
    }
  }

  function toggleSound() {
    const next = !soundOn
    setSoundOn(next)
    try {
      localStorage.setItem('cp_attendance_chime', next ? '1' : '0')
    } catch {
      /* storage unavailable — the toggle just won't persist */
    }
    if (next) {
      initSound() // this tap unlocks audio
      playSound('point') // confirm it works
    }
  }

  const endedRef = useRef(false)
  async function onEndConfirmed() {
    if (endedRef.current) return
    endedRef.current = true
    setEnding(true)
    try {
      await endClassSession(session.id)
      onEnd()
    } catch {
      toast('Could not end the session. Try again.', 'error')
      endedRef.current = false
      setEnding(false)
      setConfirmEnd(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-bold">
            {session.topic || 'Class in session'}
          </p>
          <p className="text-sm text-muted">
            {sectionName} · <span className="tabular-nums">{clock(nowMs - startedMs)}</span> elapsed
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Mute check-in chime' : 'Play a chime on check-in'}
            title={soundOn ? 'Check-in chime on' : 'Check-in chime off'}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
              soundOn
                ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                : 'border-line text-muted hover:text-ink',
            )}
          >
            <SoundIcon className="h-4 w-4" />
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
            Live
          </span>
        </div>
      </div>

      {/* Rotating QR — or a closed state once the check-in window ends */}
      <Card className="relative flex flex-col items-center gap-3 p-6">
        {closed ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500">
              <ClockIcon className="h-7 w-7" />
            </span>
            <p className="font-display text-lg font-bold">Check-in closed</p>
            <p className="max-w-[260px] text-xs text-muted">
              The QR stopped after {session.absentAfterMin} minutes. You can still mark students by
              hand below, then end the class to review.
            </p>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setPresenting(true)}
              aria-label="Present QR fullscreen"
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
            >
              <ExpandIcon className="h-4 w-4" />
            </button>
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              {payload ? (
                <QrCode value={payload} size={232} />
              ) : (
                <div className="h-[232px] w-[232px] animate-pulse rounded-xl bg-card-2" />
              )}
            </div>
            <div className="w-full max-w-[248px]">
              <div className="h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-brand-500 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${(rotateIn / QR_STEP_SECONDS) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-center text-xs text-muted">
                Code refreshes in {rotateIn}s · Late after {session.lateAfterMin}m · Absent after{' '}
                {session.absentAfterMin}m
              </p>
              <p className="mt-1 text-center text-xs">
                <span className="text-muted">Now marking </span>
                <span className={cn('font-semibold', STATUS_TEXT[autoStatus])}>
                  {STATUS_META[autoStatus].label}
                </span>
                {nextLabel && (
                  <span className="text-muted">
                    {' · '}
                    {nextLabel} in <span className="tabular-nums">{clock(nextInMs)}</span>
                  </span>
                )}
              </p>
            </div>
          </>
        )}
      </Card>

      {/* Live tallies */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Present', value: present, cls: STATUS_TEXT.present },
          { label: 'Late', value: late, cls: STATUS_TEXT.late },
          { label: 'Waiting', value: waiting.length, cls: 'text-muted' },
        ].map((s) => (
          <Card key={s.label} className="p-3 text-center">
            <p className={cn('font-display text-2xl font-bold tabular-nums', s.cls)}>{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Bulk action — mark everyone still waiting in one tap */}
      {waiting.length > 0 &&
        (bulkOpen ? (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-card p-2">
            <span className="shrink-0 px-1 text-xs text-muted">Mark {waiting.length} waiting</span>
            <Button size="sm" className="flex-1" onClick={() => markAllWaiting('present')}>
              Present
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => markAllWaiting('absent')}
            >
              Absent
            </Button>
            <button
              type="button"
              onClick={() => setBulkOpen(false)}
              aria-label="Cancel"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className="px-1 text-xs font-semibold text-brand-500 transition-opacity hover:opacity-80"
          >
            Mark all {waiting.length} waiting →
          </button>
        ))}

      {/* Search + filter (only when the roster is long enough to need it) */}
      {roster.length > SEARCH_THRESHOLD && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search students"
              aria-label="Search students"
              className="h-11 w-full rounded-xl border border-line bg-card pl-9 pr-9 text-[15px] text-ink placeholder:text-muted/70 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setWaitingOnly((v) => !v)}
            aria-pressed={waitingOnly}
            className={cn(
              'h-11 shrink-0 rounded-xl border px-3 text-sm font-medium transition-colors',
              waitingOnly
                ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                : 'border-line text-muted hover:text-ink',
            )}
          >
            Waiting {waiting.length}
          </button>
        </div>
      )}

      {/* Roster */}
      {roster.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No students in {sectionName} yet — add some in the Students tab.
        </Card>
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">No students match that filter.</Card>
      ) : (
        <Card className="divide-y divide-line">
          {visible.map((r) => {
            const open = pickerFor === r.studentId
            const isManual = manualIds.has(r.studentId)
            const flash = flashIds.has(r.studentId)
            return (
              <motion.div
                key={r.studentId}
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                className={cn('transition-colors duration-700', flash && 'bg-emerald-500/10')}
              >
                <button
                  type="button"
                  onClick={() => setPickerFor((id) => (id === r.studentId ? null : r.studentId))}
                  aria-expanded={open}
                  className={cn(
                    'flex w-full items-center gap-3 p-3.5 text-left transition-colors',
                    open ? 'bg-card-2' : !flash && 'hover:bg-card-2',
                  )}
                >
                  <Avatar name={r.fullName} url={r.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.fullName}</p>
                    {r.scannedAt ? (
                      <p className="text-xs text-muted">
                        {isManual ? 'marked' : 'checked in'} at{' '}
                        <span className="tabular-nums">{scanTime(r.scannedAt)}</span>
                        <span className="text-muted/60"> · {timeAgo(r.scannedAt)}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted/70">not yet · tap to mark</p>
                    )}
                  </div>
                  {isManual && (
                    <span className="shrink-0 rounded bg-card-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Manual
                    </span>
                  )}
                  {r.status ? (
                    <StatusChip status={r.status} />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full border-2 border-line" aria-hidden />
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.16 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center gap-2 px-3.5 pb-3">
                        {ORDER.map((s) => {
                          const active = r.status === s
                          const suggested = !active && s === autoStatus
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => mark(r.studentId, s)}
                              className={cn(
                                'h-9 rounded-lg px-3 text-sm font-semibold transition-colors',
                                active
                                  ? s === 'present'
                                    ? 'bg-emerald-500 text-white'
                                    : s === 'late'
                                      ? 'bg-gold-400 text-brand-950'
                                      : 'bg-brand-500 text-white'
                                  : 'bg-card-2 text-muted hover:text-ink',
                                suggested && 'ring-2 ring-brand-500/40',
                              )}
                            >
                              {STATUS_META[s].label}
                            </button>
                          )
                        })}
                        {r.status && (
                          <button
                            type="button"
                            onClick={() => clearMark(r.studentId)}
                            className="ml-auto h-9 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:text-ink"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </Card>
      )}

      <div className="sticky bottom-19 z-10 md:bottom-4">
        <AnimatePresence mode="wait" initial={false}>
          {confirmEnd ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="space-y-2 rounded-2xl border border-line bg-canvas/95 p-3 shadow-lg backdrop-blur"
            >
              <p className="text-center text-sm text-muted">
                End the class?{' '}
                {waiting.length > 0 && (
                  <>
                    <span className="font-semibold text-ink">{waiting.length}</span> still waiting
                    will be marked absent.
                  </>
                )}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setConfirmEnd(false)} disabled={ending}>
                  Keep going
                </Button>
                <Button onClick={onEndConfirmed} disabled={ending}>
                  {ending ? 'Ending…' : 'End & review'}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Button size="lg" className="w-full shadow-lg" onClick={() => setConfirmEnd(true)}>
                End class & review
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Fullscreen "present" QR — scan from a projector / shared screen */}
      <AnimatePresence>
        {presenting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-canvas p-6"
          >
            <button
              type="button"
              onClick={() => setPresenting(false)}
              aria-label="Exit fullscreen"
              className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
            >
              <XIcon className="h-6 w-6" />
            </button>
            <div className="text-center">
              <p className="font-display text-2xl font-bold">{session.topic || 'Scan to check in'}</p>
              <p className="text-sm text-muted">{sectionName}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-lg">
              {payload ? (
                <QrCode value={payload} size={bigSize} />
              ) : (
                <div
                  className="animate-pulse rounded-xl bg-card-2"
                  style={{ height: bigSize, width: bigSize }}
                />
              )}
            </div>
            <p className="text-center text-sm text-muted">
              Code refreshes in <span className="tabular-nums">{rotateIn}s</span> ·{' '}
              <span className={cn('font-semibold', STATUS_TEXT[autoStatus])}>
                {STATUS_META[autoStatus].label}
              </span>{' '}
              now
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
