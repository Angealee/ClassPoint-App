import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
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
import type { AttendanceStatus, MyAttendanceEntry, ScanResult } from '@/lib/types'

const entryDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''

function errorText(e: unknown): string {
  const m = (e as { message?: string } | null)?.message
  if (m && m.length <= 160) return m
  return 'Could not check in — scan the current QR and try again.'
}

export function Attendance() {
  const { me, syncMyAchievements } = useStudentData()
  const [history, setHistory] = useState<MyAttendanceEntry[]>([])
  const [loading, setLoading] = useState(true)

  const [scanOpen, setScanOpen] = useState(false)
  const [scanKey, setScanKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const handledRef = useRef(false)

  const load = useCallback(async () => {
    if (!me) return
    setLoading(true)
    try {
      setHistory(await listMyAttendance(me.id))
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false)
    }
  }, [me])

  useEffect(() => {
    void load()
  }, [load])

  function openScan() {
    setResult(null)
    setError(null)
    handledRef.current = false
    setScanKey((k) => k + 1)
    setScanOpen(true)
  }

  function closeScan() {
    setScanOpen(false)
    if (result) void load()
  }

  function scanAgain() {
    setResult(null)
    setError(null)
    handledRef.current = false
    setScanKey((k) => k + 1)
  }

  const onDetect = useCallback(async (text: string) => {
    if (handledRef.current) return
    handledRef.current = true
    const parsed = parsePayload(text)
    if (!parsed) {
      setError('That’s not a ClassPoint code. Point the camera at the QR on screen.')
      return
    }
    setSubmitting(true)
    try {
      const res = await scanAttendance(parsed.sessionId, parsed.windowIndex, parsed.code)
      setResult(res)
      vibrate(res.status === 'present' ? 'point' : 'deduct')
      void syncMyAchievements() // may unlock Checked In / On Time / streaks
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSubmitting(false)
    }
  }, [syncMyAchievements])

  const stats = useMemo(() => {
    const s: Record<AttendanceStatus, number> = {
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      irregular: 0,
    }
    for (const h of history) s[h.status] += 1
    // Excused/irregular classes don't count for you at all, so they're out of
    // the denominator — they can't drag the rate down.
    const counted = s.present + s.late + s.absent
    const rate = counted ? Math.round(((s.present + s.late) / counted) * 100) : 0
    const neutral = s.excused + s.irregular
    return { ...s, total: history.length, counted, neutral, rate }
  }, [history])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold">Attendance</h1>
        <p className="text-sm text-muted">Scan your instructor’s QR to check in.</p>
      </div>

      <Button size="lg" className="w-full" onClick={openScan}>
        <ScanIcon className="h-5 w-5" /> Scan attendance
      </Button>

      {/* Summary */}
      {history.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <Card className="col-span-1 flex flex-col items-center justify-center p-3">
            <p className="font-display text-2xl font-bold tabular-nums text-brand-500">{stats.rate}%</p>
            <p className="text-center text-[11px] leading-tight text-muted">Show-up rate</p>
          </Card>
          <Card className="col-span-3 grid grid-cols-3 divide-x divide-line p-0">
            {(['present', 'late', 'absent'] as const).map((k) => (
              <div key={k} className="flex flex-col items-center justify-center py-3">
                <p className={cn('font-display text-xl font-bold tabular-nums', STATUS_META[k].text)}>
                  {stats[k]}
                </p>
                <p className="text-[11px] text-muted">{STATUS_META[k].label}</p>
              </div>
            ))}
          </Card>
        </div>
      )}

      {stats.neutral > 0 && (
        <p className="px-1 text-xs text-muted">
          {stats.excused > 0 && `${stats.excused} excused`}
          {stats.excused > 0 && stats.irregular > 0 && ' · '}
          {stats.irregular > 0 && `${stats.irregular} irregular`} — those classes don’t count
          against you.
        </p>
      )}

      {/* History */}
      {loading ? (
        <ListSkeleton rows={4} />
      ) : history.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No classes yet. When your instructor starts a class, scan the QR to check in.
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {history.map((h) => (
            <div key={h.recordId} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {h.topic || entryDate(h.startedAt) || 'Class'}
                </p>
                <p className="text-xs text-muted">{entryDate(h.startedAt)}</p>
              </div>
              <StatusChip status={h.status} />
            </div>
          ))}
        </Card>
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
