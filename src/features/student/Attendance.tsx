import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { pop } from '@/lib/motion'
import { Rows } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { Sheet } from '@/components/ui/Sheet'
import { Spinner } from '@/components/ui/Spinner'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ScanIcon, CheckIcon, WarningIcon } from '@/components/ui/icons'
import { ScanStage } from '@/components/attendance/ScanStage'
import { StudentEventHistory } from '@/components/attendance/StudentEventHistory'
import { AttendancePlate } from '@/components/attendance/AttendancePlate'
import { StatusChip, STATUS_META } from '@/components/attendance/StatusChip'
import { useStudentData } from '@/features/student/StudentData'
import { listMyAttendance, scanAttendance } from '@/lib/api'
import { parsePayload } from '@/lib/qr'
import { vibrate } from '@/lib/haptics'
import { cn } from '@/lib/cn'
import {
  dismiss as dismissScan,
  enqueue as enqueueScan,
  loadQueue,
  syncOfflineScans,
  type OfflineScanEntry,
} from '@/lib/offline-scans'
import { groupByWeek, termLabel, termOf, termRanges, type TermName } from '@/lib/term'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { tally, trailKind, trailOf } from '@/lib/attendance'
import { OfflineScanCards } from './OfflineScanCards'
import { AbsenceExcuses } from './AbsenceExcuses'
import { LiveClassBanner } from './LiveClassBanner'
import { SemesterEndedBanner } from './SemesterEndedBanner'
import { LiveScanBar } from './LiveScanBar'
import type { MyAttendanceEntry, ScanResult } from '@/lib/types'

type TermScope = TermName | 'all'

/** Check-in time, e.g. "9:04 AM". */
const clockTime = (iso: string) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''

/** "Thu, Nov 12": the weekday matters in a log grouped by week. */
const dayLabel = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : ''

function errorText(e: unknown): string {
  const m = (e as { message?: string } | null)?.message
  if (m && m.length <= 160) return m
  return 'Could not record your attendance, scan the current QR and try again.'
}

function isOffline(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (e instanceof TypeError) return true
  const err = e as { status?: number; code?: string; message?: string } | null
  if (err?.status || err?.code) return false // a real server response — not offline
  const m = err?.message?.toLowerCase() ?? ''
  return m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')
}

export function Attendance() {
  const {
    me,
    syncMyAchievements,
    attendanceTick,
    semesterEnded,
    liveSession,
    liveStatus,
    achievementProgress,
  } = useStudentData()
  const reduced = useReducedMotion() ?? false
  const [flashId, setFlashId] = useState<string | null>(null)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [history, setHistory] = useState<MyAttendanceEntry[]>([])
  const [loading, setLoading] = useState(true)

  const [scanOpen, setScanOpen] = useState(false)
  const [scanKey, setScanKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedOffline, setSavedOffline] = useState<string | null>(null)
  const [queue, setQueue] = useState<OfflineScanEntry[]>([])
  const [loadError, setLoadError] = useState(false)
  const handledRef = useRef(false)

  const refreshQueue = useCallback(() => setQueue(loadQueue()), [])

  const load = useCallback(async () => {
    if (!me) return
    setLoading(true)
    setLoadError(false)
    try {
      setHistory(await listMyAttendance(me.id))
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [me])

  useEffect(() => {
    void load()
    void syncOfflineScans().then((changed) => {
      refreshQueue()
      if (changed) void load()
    })
    refreshQueue()
  }, [load, refreshQueue])

  useEffect(() => {
    if (attendanceTick > 0) void load()
  }, [attendanceTick, load])

  useEffect(() => {
    if (searchParams.get('scan') === null) return
    setSearchParams((p) => {
      const next = new URLSearchParams(p)
      next.delete('scan')
      return next
    }, { replace: true })
    openScan()
  }, [searchParams, setSearchParams])

  function openScan() {
    setResult(null)
    setError(null)
    setSavedOffline(null)
    handledRef.current = false
    setScanKey((k) => k + 1)
    setScanOpen(true)
  }

  function closeScan() {
    setScanOpen(false)
    if (result || savedOffline) void load()
    refreshQueue()
  }

  function scanAgain() {
    setResult(null)
    setError(null)
    setSavedOffline(null)
    handledRef.current = false
    setScanKey((k) => k + 1)
  }

  const onDetect = useCallback(
    async (text: string) => {
      if (handledRef.current) return
      handledRef.current = true
      const parsed = parsePayload(text)
      if (!parsed) {
        setError('That’s not a ClassPoint code. Point the camera at the QR on screen.')
        return
      }

      const entry = enqueueScan({
        sessionId: parsed.sessionId,
        windowIndex: parsed.windowIndex,
        code: parsed.code,
      })

      setSubmitting(true)
      try {
        const res = await scanAttendance(parsed.sessionId, parsed.windowIndex, parsed.code)
        dismissScan(entry.id)
        setResult(res)
        vibrate(res.status === 'present' ? 'point' : 'deduct')
        void syncMyAchievements()
      } catch (e) {
        if (isOffline(e)) {
          // Keep the queued proof; reassure the student it's saved.
          setSavedOffline(new Date(entry.capturedAt).toLocaleTimeString())
          vibrate('point')
        } else {
          dismissScan(entry.id)
          setError(errorText(e))
        }
      } finally {
        setSubmitting(false)
        refreshQueue()
      }
    },
    [syncMyAchievements, refreshQueue],
  )

  const [scope, setScope] = useState<TermScope>('all')

  const scopeOptions = useMemo(() => {
    const seen = new Set(history.map((h) => termOf(h.startedAt)).filter(Boolean))
    const terms = termRanges()
      .filter((r) => seen.has(r.term))
      .map((r) => ({ value: r.term as TermScope, label: termLabel(r.term) }))
    return terms.length > 1 ? [{ value: 'all' as TermScope, label: 'Overall' }, ...terms] : []
  }, [history])

  const scoped = useMemo(
    () => (scope === 'all' ? history : history.filter((h) => termOf(h.startedAt) === scope)),
    [history, scope],
  )
  const stats = useMemo(() => tally(scoped), [scoped])

  const liveScanning = !!liveSession && liveStatus === null

  function jumpToClass(recordId: string) {
    const el = document.getElementById(`rec-${recordId}`)
    if (!el) return
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
    setFlashId(recordId)
    window.setTimeout(() => setFlashId((cur) => (cur === recordId ? null : cur)), 1600)
  }

  return (
    <PullToRefresh onRefresh={load}>
    <div className={cn('space-y-5', liveScanning && !semesterEnded && 'pb-20 md:pb-0')}>
      <ScreenTitle title="Attendance" subtitle="Scan your instructor’s QR to record your attendance." />

      <SemesterEndedBanner />

      {/* A class that is live and not yet scanned gets the thumb-zone bar; once you are in, the
          plain "you're in" banner takes its place. */}
      {liveSession && liveStatus !== null && <LiveClassBanner onScan={openScan} />}
      {!semesterEnded && <LiveScanBar onScan={openScan} />}

      <OfflineScanCards
        entries={queue}
        onChanged={() => {
          refreshQueue()
          void load()
        }}
      />

      {history.length > 0 && (
        <div className="space-y-2">
          {scopeOptions.length > 0 && (
            <SegmentedControl
              label="Which term"
              tone="quiet"
              size="sm"
              value={scope}
              onChange={setScope}
              options={scopeOptions}
            />
          )}
          <AttendancePlate
            scopeLabel={scope === 'all' ? 'Overall' : termLabel(scope)}
            stats={stats}
            trail={trailOf(scoped, 10)}
            streak={achievementProgress?.present_streak ?? null}
            reduced={reduced}
            onPickClass={jumpToClass}
            onStats={() => navigate('/app/attendance/stats')}
            onScan={!semesterEnded && !liveScanning ? openScan : undefined}
          />
        </div>
      )}

      {!loading && me && (
        <AbsenceExcuses studentId={me.id} history={history} onChanged={load} />
      )}

      {/* History */}
      {loading ? (
        <ListSkeleton rows={4} />
      ) : loadError ? (
        <ErrorState
          onRetry={() => void load()}
          detail="Your record is safe, this is just the connection."
        >
          Couldn’t load your attendance.
        </ErrorState>
      ) : history.length === 0 ? (
        <div className="space-y-3">
          <EmptyState>
            No classes yet. When your instructor starts a class, scan the QR to record your attendance.
          </EmptyState>
          {!semesterEnded && !liveScanning && (
            <Button size="lg" className="w-full" onClick={openScan}>
              <ScanIcon className="h-5 w-5" /> Scan attendance
            </Button>
          )}
        </div>
      ) : (
        <WeekLog history={history} flashId={flashId} />
      )}

      {me && <StudentEventHistory studentId={me.id} />}

      <Sheet open={scanOpen} onClose={closeScan} variant="screen" title="Scan attendance">
        {submitting ? (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted">
            <Spinner className="h-8 w-8" />
            Recording your attendance…
          </div>
        ) : result ? (
          <ResultView result={result} onDone={closeScan} />
        ) : savedOffline ? (
          <div className="space-y-5 py-2 text-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={pop}
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-solid/12 text-success"
            >
              <CheckIcon className="h-10 w-10" />
            </motion.div>
            <div className="space-y-1">
              <p className="font-display text-xl font-bold">Saved, your attendance is recorded</p>
              <p className="mx-auto max-w-xs text-sm text-muted">
                You scanned at {savedOffline}. It'll sync automatically when you're back online.
                and your status counts from when you scanned, not when it syncs.
              </p>
            </div>
            <Button size="lg" className="w-full" onClick={closeScan}>
              Done
            </Button>
          </div>
        ) : error ? (
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger-solid/10 text-danger">
              <WarningIcon className="h-7 w-7" />
            </div>
            <p className="text-sm text-ink">{error}</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={closeScan}>
                Close
              </Button>
              <Button className="flex-1" onClick={scanAgain}>
                Scan again
              </Button>
            </div>
          </div>
        ) : (
          <ScanStage
            scanKey={scanKey}
            onDetect={onDetect}
            caption="Point your camera at the QR your instructor is showing."
          />
        )}
      </Sheet>
    </div>
    </PullToRefresh>
  )
}

/** The log, grouped by week, with a dot per class. Newest week first. */
function WeekLog({ history, flashId }: { history: MyAttendanceEntry[]; flashId: string | null }) {
  const groups = groupByWeek(history, (h) => h.startedAt)
  return (
    <div className="space-y-4">
      {groups.map((g, i) => {
        const newTerm = i === 0 || groups[i - 1].term !== g.term
        return (
          <div key={g.week}>
            {newTerm && (
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">
                {g.term ? termLabel(g.term) : 'Earlier'}
              </p>
            )}
            <p className="mb-1.5 px-1 text-xs text-muted">{g.label}</p>
            <Rows>
              {g.items.map((h) => {
                const kind = trailKind(h.status)
                const meta = STATUS_META[h.status]
                const timed = (h.status === 'present' || h.status === 'late') && h.scannedAt
                return (
                  <div
                    key={h.recordId}
                    id={`rec-${h.recordId}`}
                    className={cn(
                      'flex items-center gap-3 px-3.5 py-3 transition-colors',
                      flashId === h.recordId && 'bg-accent-solid/10',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        kind === 'neutral' ? 'border-2 border-muted' : meta.dot,
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {h.topic || h.subjectCode || 'Class'}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                        {[h.topic ? h.subjectCode : null, dayLabel(h.startedAt)]
                          .filter(Boolean)
                          .join(' · ')}
                        {h.syncedLate && (
                          <span className="rounded-full bg-card-2 px-2 py-0.5 text-2xs font-medium">
                            Recorded offline
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs tabular-nums">
                      <p className={cn('font-semibold', meta.text)}>{meta.label}</p>
                      {timed && <p className="text-muted">{clockTime(h.scannedAt as string)}</p>}
                    </div>
                  </div>
                )
              })}
            </Rows>
          </div>
        )
      })}
    </div>
  )
}

function ResultView({ result, onDone }: { result: ScanResult; onDone: () => void }) {
  const reduced = useReducedMotion() ?? false
  const meta = STATUS_META[result.status]
  const headline =
    result.status === 'present'
      ? 'Attendance recorded'
      : result.status === 'late'
        ? 'Recorded, a bit late'
        : 'Marked absent'
  return (
    <div className="space-y-5 py-2 text-center">
      <div className={cn('relative mx-auto h-20 w-20', meta.text)}>
        {!reduced && (
          <motion.span
            aria-hidden
            initial={{ scale: 0.7, opacity: 0.8 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            className="absolute inset-0 rounded-full border-2 border-current"
          />
        )}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={pop}
          className={cn('relative flex h-20 w-20 items-center justify-center rounded-full', meta.chip)}
        >
          <CheckIcon className="h-10 w-10" />
        </motion.div>
      </div>
      <div className="space-y-1">
        <p className="font-display text-xl font-bold">{headline}</p>
        <div className="flex items-center justify-center gap-2">
          <StatusChip status={result.status} />
          {result.already && <span className="text-xs text-muted">already recorded</span>}
        </div>
        {result.topic && <p className="text-sm text-muted">{result.topic}</p>}
      </div>
      <Button size="lg" className="w-full" onClick={onDone}>
        Done
      </Button>
    </div>
  )
}
