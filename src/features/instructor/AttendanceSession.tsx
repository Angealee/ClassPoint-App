import { StatusPicker } from '@/components/attendance/StatusPicker'
import { StickyBar } from '@/components/ui/StickyBar'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { Card, Rows } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
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
import { supabase, uniqueChannel } from '@/lib/supabase'
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
  present: STATUS_META.present.text,
  late: STATUS_META.late.text,
  absent: STATUS_META.absent.text,
  excused: STATUS_META.excused.text,
  irregular: STATUS_META.irregular.text,
}

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
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [roster, setRoster] = useState<AttendanceRosterRow[]>([])
  const [manualIds, setManualIds] = useState<Set<string>>(new Set())
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [waitingOnly, setWaitingOnly] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [bigSize, setBigSize] = useState(320)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [ending, setEnding] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState<AttendanceStatus | null>(null)
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
  const [displayOrder, setDisplayOrder] = useState<string[]>([])
  const prevScannedRef = useRef<Set<string>>(new Set())
  const firstOrderRef = useRef(true)

  const startedMs = new Date(session.startedAt).getTime()

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
          void refresh()
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

  useEffect(() => {
    const channel = uniqueChannel(`attendance-${session.id}`)
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

  useEffect(() => {
    if (roster.length === 0) return
    const prevScanned = prevScannedRef.current
    const first = firstOrderRef.current
    // New non-manual scans since the last render — recent-first.
    const newScans = roster
      .filter((r) => r.scannedAt && !prevScanned.has(r.studentId) && !manualIds.has(r.studentId))
      .sort((a, b) => (b.scannedAt ?? '').localeCompare(a.scannedAt ?? ''))
      .map((r) => r.studentId)
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
    for (const r of roster) if (!seen.has(r.studentId)) out.push(r)
    return out
  }, [displayOrder, byId, roster])

  const q = query.trim().toLowerCase()
  const visible = ordered.filter(
    (r) => (!waitingOnly || !r.scannedAt) && (!q || r.fullName.toLowerCase().includes(q)),
  )

  const elapsedMs = Math.max(0, nowMs - startedMs)
  const elapsedMin = elapsedMs / 60000
  const closed = elapsedMin >= session.absentAfterMin
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
          <IconButton
            label={soundOn ? 'Mute scan chime' : 'Play a chime on each scan'}
            title={soundOn ? 'Scan chime on' : 'Scan chime off'}
            variant="outline"
            size="sm"
            round
            aria-pressed={soundOn}
            onClick={toggleSound}
            className={cn(soundOn && 'border-accent-solid bg-accent-solid/10 text-accent')}
            icon={<SoundIcon className="h-4 w-4" />}
          />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-solid/10 px-3 py-1 text-xs font-semibold text-accent">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent-solid" />
            Live
          </span>
        </div>
      </div>

      <Card elevation="raised" className="relative flex flex-col items-center gap-3 p-6">
        {closed ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-solid/10 text-accent">
              <ClockIcon className="h-7 w-7" />
            </span>
            <p className="font-display text-lg font-bold">Attendance closed</p>
            <p className="max-w-[260px] text-xs text-muted">
              The QR stopped after {session.absentAfterMin} minutes. You can still mark students by
              hand below, then end the class to review.
            </p>
          </div>
        ) : (
          <>
                        <IconButton
              label="Present QR fullscreen"
              variant="outline"
              round
              onClick={() => setPresenting(true)}
              className="absolute right-3 top-3"
              icon={<ExpandIcon className="h-4 w-4" />}
            />
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              {payload ? (
                <QrCode value={payload} size={232} />
              ) : (
                <Skeleton className="h-[232px] w-[232px] rounded-xl" />
              )}
            </div>
            <div className="w-full max-w-[248px]">
              <div className="h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent-solid transition-[width] duration-1000 ease-linear"
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

      {waiting.length > 0 &&
        (bulkOpen ? (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-card p-2">
            <span className="shrink-0 px-1 text-xs text-muted">Mark {waiting.length} waiting</span>
            <Button size="sm" className="flex-1" onClick={() => setBulkConfirm('present')}>
              Present
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setBulkConfirm('absent')}
            >
              Absent
            </Button>
                        <IconButton
              label="Cancel"
              size="sm"
              round
              onClick={() => setBulkOpen(false)}
              icon={<XIcon className="h-4 w-4" />}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className="px-1 text-xs font-semibold text-accent transition-opacity hover:opacity-80"
          >
            Mark all {waiting.length} waiting →
          </button>
        ))}

      {roster.length > SEARCH_THRESHOLD && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute z-10 left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search students"
              aria-label="Search students"
              className="h-11 w-full rounded-xl border border-line bg-card pl-9 pr-9 text-base text-ink placeholder:text-muted/70 transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
            />
            {query && (
                            <IconButton
                label="Clear search"
                size="sm"
                round
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                icon={<XIcon className="h-4 w-4" />}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setWaitingOnly((v) => !v)}
            aria-pressed={waitingOnly}
            className={cn(
              'h-11 shrink-0 rounded-xl border px-3 text-sm font-medium transition-colors',
              waitingOnly
                ? 'border-accent-solid bg-accent-solid/10 text-accent'
                : 'border-line text-muted hover:text-ink',
            )}
          >
            Waiting {waiting.length}
          </button>
        </div>
      )}

      {/* Roster */}
      {roster.length === 0 ? (
        <EmptyState>No students in {sectionName} yet — add some in the Students tab.</EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState>No students match that filter.</EmptyState>
      ) : (
        <Rows>
          {visible.map((r) => {
            const open = pickerFor === r.studentId
            const isManual = manualIds.has(r.studentId)
            const flash = flashIds.has(r.studentId)
            return (
              <div
                key={r.studentId}
                className={cn('transition-colors duration-700', flash && 'bg-success-solid/10')}
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
                        {isManual ? 'marked' : 'recorded'} at{' '}
                        <span className="tabular-nums">{scanTime(r.scannedAt)}</span>
                        <span className="text-muted/60"> · {timeAgo(r.scannedAt)}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted/70">not yet · tap to mark</p>
                    )}
                  </div>
                  {isManual && (
                    <span className="shrink-0 rounded-lg bg-card-2 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">
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
                      <StatusPicker
                        className="mx-3.5 mb-3 border-t border-line pt-3"
                        value={r.status}
                        suggested={autoStatus}
                        onPick={(s) => mark(r.studentId, s)}
                        onReset={() => clearMark(r.studentId)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </Rows>
      )}

      <StickyBar>
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
      </StickyBar>

      <AnimatePresence>
        {presenting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-canvas p-6"
          >
                        <IconButton
              label="Exit fullscreen"
              variant="outline"
              size="lg"
              round
              onClick={() => setPresenting(false)}
              className="absolute right-4 top-4"
              icon={<XIcon className="h-6 w-6" />}
            />
            <div className="text-center">
              <p className="font-display text-2xl font-bold">{session.topic || 'Scan to record attendance'}</p>
              <p className="text-sm text-muted">{sectionName}</p>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-lg">
              {payload ? (
                <QrCode value={payload} size={bigSize} />
              ) : (
                <Skeleton className="rounded-xl" style={{ height: bigSize, width: bigSize }} />
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

      <ConfirmDialog
        open={!!bulkConfirm}
        title={`Mark ${waiting.length} waiting as ${bulkConfirm ? STATUS_META[bulkConfirm].label : ''}?`}
        message={
          bulkConfirm === 'absent' ? (
            <>
              Everyone without a scan yet is marked{' '}
              <span className="font-semibold text-ink">Absent</span>. Penalties only apply when you
              finalise the review.
            </>
          ) : (
            <>
              Everyone without a scan yet is marked{' '}
              <span className="font-semibold text-ink">Present</span>. You can still correct
              individuals afterwards.
            </>
          )
        }
        confirmLabel={`Mark ${waiting.length} ${bulkConfirm ? STATUS_META[bulkConfirm].label.toLowerCase() : ''}`}
        variant={bulkConfirm === 'absent' ? 'danger' : 'default'}
        onConfirm={() => {
          const status = bulkConfirm
          setBulkConfirm(null)
          if (status) void markAllWaiting(status)
        }}
        onClose={() => setBulkConfirm(null)}
      />
    </div>
  )
}
