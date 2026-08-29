import { EmptyState } from '@/components/ui/EmptyState'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card, Rows } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { Sheet } from '@/components/ui/Sheet'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ScanIcon, CheckIcon } from '@/components/ui/icons'
import { QrScanner } from '@/components/attendance/QrScanner'
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
import { groupByTerm } from '@/lib/term'
import { rateTone, tally } from '@/lib/attendance'
import { TONE } from '@/lib/tone'
import { OfflineScanCards } from './OfflineScanCards'
import { AbsenceExcuses } from './AbsenceExcuses'
import { LiveClassBanner } from './LiveClassBanner'
import { SemesterEndedBanner } from './SemesterEndedBanner'
import { StreakFlame } from './StreakFlame'
import type { MyAttendanceEntry, ScanResult } from '@/lib/types'

const entryDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''

/** Check-in time, e.g. "9:04 AM". */
const clockTime = (iso: string) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''

function errorText(e: unknown): string {
  const m = (e as { message?: string } | null)?.message
  if (m && m.length <= 160) return m
  return 'Could not check in — scan the current QR and try again.'
}

/**
 * Did the scan fail because we couldn't reach the server (vs. the server
 * actively rejecting the payload)? A transport failure = keep the queued proof;
 * a server rejection = drop it. supabase-js surfaces network failures as a
 * TypeError ("Failed to fetch") with no HTTP status/code.
 */
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
  // Set when a scan couldn't reach the server — shows the optimistic "saved,
  // will sync" pane instead of an error.
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
      // A failed fetch used to leave history empty, so the screen said "No
      // classes yet" — telling a student their whole record didn't exist.
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [me])

  useEffect(() => {
    void load()
    // Flush any queued offline scans the moment this page opens, then reflect
    // their resolved state; refresh history if something recorded.
    void syncOfflineScans().then((changed) => {
      refreshQueue()
      if (changed) void load()
    })
    refreshQueue()
  }, [load, refreshQueue])

  // An instructor correcting a status (or committing penalties) now reaches this
  // screen live — attendance_records has been in the realtime publication since
  // 0014, but nothing was listening until Phase B.
  useEffect(() => {
    if (attendanceTick > 0) void load()
  }, [attendanceTick, load])

  // Arriving from the Dashboard's live-class banner (`?scan=1`): open the
  // scanner straight away rather than making the student find the button on a
  // screen they were pushed to. The param is stripped so a back-navigation or a
  // refresh doesn't re-open it.
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

      // Capture-first: persist the proof BEFORE the network call, so a crash or
      // a dead connection can never lose it. Removed again only if the server
      // accepts (or explicitly rejects) it right now.
      const entry = enqueueScan({
        sessionId: parsed.sessionId,
        windowIndex: parsed.windowIndex,
        code: parsed.code,
      })

      setSubmitting(true)
      try {
        const res = await scanAttendance(parsed.sessionId, parsed.windowIndex, parsed.code)
        dismissScan(entry.id) // the online path handled it — no queue entry needed
        setResult(res)
        vibrate(res.status === 'present' ? 'point' : 'deduct')
        void syncMyAchievements() // may unlock Checked In / On Time / streaks
      } catch (e) {
        if (isOffline(e)) {
          // Keep the queued proof; reassure the student it's saved.
          setSavedOffline(new Date(entry.capturedAt).toLocaleTimeString())
          vibrate('point')
        } else {
          // The server actively refused THIS payload (expired/wrong section/
          // ended) — queuing it for later would just re-fail. Drop it.
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

  const stats = useMemo(() => tally(history), [history])

  return (
    // Pull-to-refresh: this is the screen where a student most wants to force a
    // re-check ("did my check-in actually land?").
    <PullToRefresh onRefresh={load}>
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold">Attendance</h1>
        <p className="text-sm text-muted">Scan your instructor’s QR to check in.</p>
      </div>

      {/* Read-only, because their semester is over (0035). */}
      <SemesterEndedBanner />

      {/* Class is running right now (0033). Renders nothing when it isn't, and
          opens the scanner in place — this screen already owns that sheet. */}
      <LiveClassBanner onScan={openScan} />

      {/* Hidden once the semester has ended: scan_attendance refuses these
          check-ins server-side (0035), so offering the button would only walk
          the student into a camera and then an error. */}
      {!semesterEnded && (
        <Button size="lg" className="w-full" onClick={openScan}>
          <ScanIcon className="h-5 w-5" /> Scan attendance
        </Button>
      )}

      {/* Offline check-ins waiting to sync / their outcomes. */}
      <OfflineScanCards
        entries={queue}
        onChanged={() => {
          refreshQueue()
          void load()
        }}
      />

      {/* The streak, permanently visible (Phase F) — it used to disappear the
          moment its badge unlocked. */}
      {history.length > 0 && <StreakFlame />}

      {/* Summary — ONE card, counts first.
          The show-up rate used to open this screen as a large brand-red number,
          which meant the first thing a struggling student saw was their worst
          figure. It's still here (it's the number that matters for a grade) but
          as a calm footer line: the counts are what you act on. */}
      {history.length > 0 && (
        <Card className="p-0">
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
          {/* The permanent entry point to the detailed stats screen. Deliberately
             here rather than on the Dashboard: this row IS the summary the stats
             screen expands on, and a link here survives any home-screen rebuild. */}
          <button
            type="button"
            onClick={() => navigate('/app/attendance/stats')}
            className="flex w-full items-baseline justify-between border-t border-line px-4 py-3 text-left transition-colors hover:bg-card-2"
          >
            <span className="text-sm text-muted">Show-up rate</span>
            <span className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  'font-display text-lg font-bold tabular-nums',
                  TONE[rateTone(stats.rate)].text,
                )}
              >
                {stats.rate}%
              </span>
              <span className="text-sm font-semibold text-accent">Stats ›</span>
            </span>
          </button>
        </Card>
      )}


      {/* Absence-excuse flow (DCT-CCS admission slip) — sits above history. */}
      {!loading && me && (
        <AbsenceExcuses studentId={me.id} history={history} onChanged={load} />
      )}

      {/* History */}
      {loading ? (
        <ListSkeleton rows={4} />
      ) : loadError ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-brand-500">Couldn’t load your attendance.</p>
          <p className="mt-1 text-xs text-muted">
            Your record is safe — this is just the connection.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            Try again
          </Button>
        </Card>
      ) : history.length === 0 ? (
        <EmptyState>No classes yet. When your instructor starts a class, scan the QR to check in.</EmptyState>
      ) : (
        /* Grouped by term (0027 dates, now configured for the student area
           too). The changelog promised this; until Phase F the history was one
           undifferentiated list, so a student couldn't tell which absences fell
           in the term being graded. */
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
                        {/* Built from parts and joined once. Concatenating
                            "x · " fragments left a doubled separator whenever a
                            middle piece was absent — and the date piece is
                            absent for every session without a topic, because
                            the title above already IS the date. */}
                        {[
                          h.subjectCode,
                          h.topic ? entryDate(h.startedAt) : null,
                          h.scannedAt ? `in at ${clockTime(h.scannedAt)}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        {h.syncedLate && (
                          <span className="rounded-full bg-card-2 px-2 py-0.5 text-xs font-medium">
                            Offline check-in
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

      {/* Scan sheet */}
      <Sheet open={scanOpen} onClose={closeScan} title="Scan attendance">
        {submitting ? (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-brand-500" />
            Checking you in…
          </div>
        ) : result ? (
          <ResultView result={result} onDone={closeScan} />
        ) : savedOffline ? (
          <div className="space-y-5 py-2 text-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success-solid/12 text-success"
            >
              <CheckIcon className="h-10 w-10" />
            </motion.div>
            <div className="space-y-1">
              <p className="font-display text-xl font-bold">Saved — you're checked in</p>
              <p className="mx-auto max-w-xs text-sm text-muted">
                You scanned at {savedOffline}. It'll sync automatically when you're back online —
                and your status counts from when you scanned, not when it syncs.
              </p>
            </div>
            <Button size="lg" className="w-full" onClick={closeScan}>
              Done
            </Button>
          </div>
        ) : error ? (
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/10 text-2xl">
              ⚠️
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
          <div className="space-y-3">
            <QrScanner key={scanKey} onDetect={onDetect} />
            <p className="text-center text-xs text-muted">
              Center the QR your instructor is showing inside the frame.
            </p>
          </div>
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
      ? 'You’re checked in!'
      : result.status === 'late'
        ? 'Checked in — a bit late'
        : 'Marked absent'
  return (
    <div className="space-y-5 py-2 text-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
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
