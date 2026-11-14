import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { pop } from '@/lib/motion'
import { Card, Rows } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { Sheet } from '@/components/ui/Sheet'
import { Spinner } from '@/components/ui/Spinner'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ScanIcon, CheckIcon, WarningIcon } from '@/components/ui/icons'
import { ScanStage } from '@/components/attendance/ScanStage'
import { StudentEventHistory } from '@/components/attendance/StudentEventHistory'
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
import { groupByTerm, termLabel, termOf, termRanges, type TermName } from '@/lib/term'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { rateTone, tally } from '@/lib/attendance'
import { TONE } from '@/lib/tone'
import { OfflineScanCards } from './OfflineScanCards'
import { AbsenceExcuses } from './AbsenceExcuses'
import { LiveClassBanner } from './LiveClassBanner'
import { SemesterEndedBanner } from './SemesterEndedBanner'
import { StreakFlame } from './StreakFlame'
import type { MyAttendanceEntry, ScanResult } from '@/lib/types'

type TermScope = TermName | 'all'

const entryDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''

/** Check-in time, e.g. "9:04 AM". */
const clockTime = (iso: string) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''

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
  const { me, syncMyAchievements, attendanceTick, semesterEnded } = useStudentData()
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

  return (
    <PullToRefresh onRefresh={load}>
    <div className="space-y-5">
      <ScreenTitle title="Attendance" subtitle="Scan your instructor’s QR to record your attendance." />

      <SemesterEndedBanner />

      <LiveClassBanner onScan={openScan} />

      {!semesterEnded && (
        <Button size="lg" className="w-full" onClick={openScan}>
          <ScanIcon className="h-5 w-5" /> Scan attendance
        </Button>
      )}

      <OfflineScanCards
        entries={queue}
        onChanged={() => {
          refreshQueue()
          void load()
        }}
      />

      {history.length > 0 && <StreakFlame />}

      {history.length > 0 && (
        <Card elevation="raised" className="p-0">
          {scopeOptions.length > 0 && (
            <div className="border-b border-line p-3">
              <SegmentedControl
                label="Which term"
                tone="quiet"
                size="sm"
                value={scope}
                onChange={setScope}
                options={scopeOptions}
              />
            </div>
          )}

          <div className="grid grid-cols-3 divide-x divide-line">
            {(['present', 'late', 'absent'] as const).map((k) => (
              <div key={k} className="flex flex-col items-center justify-center py-4">
                <p
                  className={cn(
                    'font-display text-3xl font-bold tabular-nums',
                    STATUS_META[k].text,
                  )}
                >
                  {stats[k]}
                </p>
                <p className="mt-0.5 text-sm text-muted">{STATUS_META[k].label}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate('/app/attendance/stats')}
            className="flex w-full items-baseline justify-between border-t border-line px-4 py-3 text-left transition-colors hover:bg-card-2"
          >
            <span className="text-sm text-muted">Attendance rate</span>
            <span className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  'font-display text-lg font-bold tabular-nums',
                  TONE[rateTone(stats.rate)].text,
                )}
              >
                {stats.counted === 0 ? <span className="text-muted/50">-</span> : `${stats.rate}%`}
              </span>
              <span className="text-sm font-semibold text-accent">Stats ›</span>
            </span>
          </button>
        </Card>
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
        <EmptyState>No classes yet. When your instructor starts a class, scan the QR to record your attendance.</EmptyState>
      ) : (
        <div className="space-y-4">
          {groupByTerm(history, (h) => h.startedAt).map((g) => (
            <div key={g.label}>
              <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted/80">
                {g.label}
              </p>
              <Rows>
                {g.items.map((h) => (
                  <div key={h.recordId} className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {h.topic || entryDate(h.startedAt) || 'Class'}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
                        {[
                          h.subjectCode,
                          h.topic ? entryDate(h.startedAt) : null,
                          h.scannedAt ? `in at ${clockTime(h.scannedAt)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        {h.syncedLate && (
                          <span className="rounded-full bg-card-2 px-2 py-0.5 text-xs font-medium">
                            Recorded offline
                          </span>
                        )}
                      </p>
                    </div>
                    <StatusChip status={h.status} />
                  </div>
                ))}
              </Rows>
            </div>
          ))}
        </div>
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

function ResultView({ result, onDone }: { result: ScanResult; onDone: () => void }) {
  const meta = STATUS_META[result.status]
  const headline =
    result.status === 'present'
      ? 'Attendance recorded'
      : result.status === 'late'
        ? 'Recorded, a bit late'
        : 'Marked absent'
  return (
    <div className="space-y-5 py-2 text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={pop}
        className={cn('mx-auto flex h-20 w-20 items-center justify-center rounded-full', meta.chip)}
      >
        <CheckIcon className="h-10 w-10" />
      </motion.div>
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
