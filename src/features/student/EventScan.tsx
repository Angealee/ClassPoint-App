import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { BoltIcon, CheckIcon, ScanIcon } from '@/components/ui/icons'
import { QrScanner } from '@/components/attendance/QrScanner'
import { getMyEventHistory, scanEventAttendance } from '@/lib/api'
import { parseEventPayload } from '@/lib/qr'
import { vibrate } from '@/lib/haptics'
import type { EventHistoryEntry, EventScanResult } from '@/lib/types'
import { useStudentData } from './StudentData'

function errorText(e: unknown): string {
  const m = (e as { message?: string } | null)?.message
  if (m && m.length <= 160) return m
  return 'Could not check in — scan the current QR and try again.'
}

/**
 * The "Event is starting" scan screen (0055). Reached from the global banner on
 * Home. A single flat check-in: scan the event QR, earn the points once. It uses
 * `parseEventPayload` (the CP1E prefix), so a class QR scanned here is rejected —
 * and the class scanner rejects an event QR the same way.
 */
export function EventScan() {
  const { me, liveEvent, liveEventChecked, noteEventCheckedIn } = useStudentData()
  const navigate = useNavigate()
  const [scanning, setScanning] = useState(false)
  const [scanKey, setScanKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<EventScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const detectedRef = useRef(false)

  async function onDetect(text: string) {
    if (detectedRef.current) return
    const parsed = parseEventPayload(text)
    if (!parsed) {
      setError('That is not an event QR — scan the code the event is showing.')
      setScanning(false)
      return
    }
    if (!liveEvent || parsed.eventId !== liveEvent.id) {
      setError('That QR is for a different event.')
      setScanning(false)
      return
    }
    detectedRef.current = true
    setScanning(false)
    setSubmitting(true)
    setError(null)
    try {
      const r = await scanEventAttendance(parsed.eventId, parsed.windowIndex, parsed.code)
      setResult(r)
      noteEventCheckedIn()
      vibrate('point')
    } catch (e) {
      setError(errorText(e))
      detectedRef.current = false
    } finally {
      setSubmitting(false)
    }
  }

  function startScan() {
    detectedRef.current = false
    setError(null)
    setResult(null)
    setScanKey((k) => k + 1)
    setScanning(true)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Event check-in"
        subtitle="Scan the QR at the event to check in."
        fallback="/app"
      />

      {!liveEvent ? (
        <EmptyState
          icon={<ScanIcon />}
          description="When one starts, you'll see it on your home screen."
        >
          No event is running right now.
        </EmptyState>
      ) : result ? (
        <ResultView result={result} onDone={() => navigate('/app')} />
      ) : (
        <Card pad="roomy" className="space-y-4 text-center">
          <div>
            <p className="font-display text-xl font-bold">{liveEvent.name}</p>
            {liveEvent.pointsPerScan > 0 && (
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-reward">
                <BoltIcon className="h-4 w-4" /> +{liveEvent.pointsPerScan} points for checking in
              </p>
            )}
          </div>

          {liveEventChecked && !scanning && !submitting ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-solid/15 text-success">
                <CheckIcon className="h-6 w-6" />
              </span>
              <p className="text-sm font-semibold text-ink">You're already checked in.</p>
            </div>
          ) : scanning ? (
            <div className="space-y-3">
              <QrScanner key={scanKey} onDetect={(t) => void onDetect(t)} />
              <p className="text-center text-xs text-muted">Center the event QR inside the frame.</p>
              <Button variant="ghost" className="w-full text-muted" onClick={() => setScanning(false)}>
                Cancel
              </Button>
            </div>
          ) : submitting ? (
            <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent-solid" />
              Checking you in…
            </div>
          ) : (
            <Button size="lg" className="w-full" onClick={startScan}>
              <ScanIcon className="h-5 w-5" /> Scan to check in
            </Button>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
        </Card>
      )}

      <RecentEvents studentId={me?.id} />
    </div>
  )
}

/** A student's own past event check-ins. Self-contained: its own fetch, fails
 * silent (renders nothing), so a missing RPC never touches the scan flow. */
function RecentEvents({ studentId }: { studentId?: string }) {
  const [history, setHistory] = useState<EventHistoryEntry[]>([])
  useEffect(() => {
    if (!studentId) return
    let active = true
    getMyEventHistory(studentId)
      .then((h) => active && setHistory(h))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [studentId])

  if (history.length === 0) return null

  return (
    <div>
      <p className="mb-2 px-1 text-sm font-semibold text-muted">Your recent events</p>
      <Card pad="none" className="divide-y divide-line">
        {history.slice(0, 10).map((e) => (
          <div key={e.eventId} className="flex items-center gap-3 p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-reward-solid/15 text-reward">
              <CheckIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{e.name}</p>
              <p className="text-xs text-muted">
                {new Date(e.scannedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
                {e.manual ? ' · added by instructor' : ''}
              </p>
            </div>
            {e.points > 0 && (
              <span className="shrink-0 text-sm font-semibold text-reward">+{e.points}</span>
            )}
          </div>
        ))}
      </Card>
    </div>
  )
}

function ResultView({ result, onDone }: { result: EventScanResult; onDone: () => void }) {
  return (
    <Card pad="roomy" className="space-y-4 py-8 text-center">
      <motion.span
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 18 }}
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-solid/15 text-success"
      >
        <CheckIcon className="h-9 w-9" />
      </motion.span>
      <div>
        <p className="font-display text-xl font-bold">
          {result.already ? "You're already in" : "You're checked in!"}
        </p>
        <p className="mt-1 text-sm text-muted">{result.eventName}</p>
      </div>
      {result.points > 0 && !result.already && (
        <p className="inline-flex items-center justify-center gap-1 text-lg font-bold text-reward">
          <BoltIcon className="h-5 w-5" /> +{result.points} points
        </p>
      )}
      <Button variant="outline" className="w-full" onClick={onDone}>
        Done
      </Button>
    </Card>
  )
}
