import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { Avatar } from '@/components/ui/Avatar'
import { BoltIcon, CheckIcon, ExpandIcon, SearchIcon, XIcon } from '@/components/ui/icons'
import { QrCode } from '@/components/attendance/QrCode'
import { useInstructor } from './InstructorLayout'
import {
  endEventSession,
  getActiveEventForInstructor,
  getEventStats,
  listRosterBasics,
  markEventAttendance,
  startEventSession,
} from '@/lib/api'
import {
  QR_STEP_SECONDS,
  buildEventPayload,
  computeCode,
  currentWindow,
  secondsUntilRotate,
} from '@/lib/qr'
import { errorText } from '@/lib/errors'
import type { EventSession, EventStats } from '@/lib/types'

type Person = { id: string; fullName: string; displayName: string; avatarUrl: string | null }

/**
 * Global event console (0055).
 *
 * A special/limited, cross-section check-in. NO section is picked — any active
 * student may scan. The instructor sets a name + flat points, shows the rotating
 * QR, and watches a live count that POLLS get_event_stats (event_attendance is
 * NOT in realtime, so a school-wide event can't push hundreds of row events).
 */
export function EventConsole() {
  const [event, setEvent] = useState<EventSession | null>(null)
  const [checking, setChecking] = useState(true)

  // Resume an already-running event on mount (a reload during the event).
  useEffect(() => {
    let cancelled = false
    getActiveEventForInstructor()
      .then((e) => !cancelled && setEvent(e))
      .catch(() => {})
      .finally(() => !cancelled && setChecking(false))
    return () => {
      cancelled = true
    }
  }, [])

  if (event) {
    return <EventMonitor event={event} onEnded={() => setEvent(null)} />
  }
  return <EventSetup checking={checking} onStarted={setEvent} />
}

/** Create form: name + flat points, then Start. */
function EventSetup({
  checking,
  onStarted,
}: {
  checking: boolean
  onStarted: (e: EventSession) => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [points, setPoints] = useState(5)
  const [starting, setStarting] = useState(false)

  async function onStart() {
    const clean = name.trim()
    if (!clean) return
    setStarting(true)
    try {
      onStarted(await startEventSession(clean, points))
    } catch (e) {
      toast(errorText(e, 'Could not start the event. Try again.'), 'error')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Global event"
        subtitle="A school-wide QR any section can scan."
        fallback="/teach/attendance"
      />
      <Card pad="roomy" className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-reward-solid/15 text-reward">
            <BoltIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display font-bold">Start an event</p>
            <p className="text-xs text-muted">Every student who scans earns the points, once.</p>
          </div>
        </div>

        <Input
          label="Event name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Foundation Day"
          maxLength={80}
        />
        <Input
          label="Points per check-in"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          value={points}
          onChange={(e) => setPoints(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))}
          hint="0 to record attendance without awarding points."
        />

        <Button
          size="lg"
          className="w-full"
          onClick={() => void onStart()}
          disabled={starting || checking || !name.trim()}
          loading={starting}
        >
          {checking ? 'Checking…' : 'Start event & show QR'}
        </Button>
      </Card>
    </div>
  )
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Live monitor: rotating QR + polled total/per-section counts + manual add + End. */
function EventMonitor({ event, onEnded }: { event: EventSession; onEnded: () => void }) {
  const { toast } = useToast()
  const [payload, setPayload] = useState('')
  const [rotateIn, setRotateIn] = useState(QR_STEP_SECONDS)
  const [nowMs, setNowMs] = useState(Date.now())
  const [stats, setStats] = useState<EventStats | null>(null)
  const [ending, setEnding] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  // Fullscreen "present" QR — same as the class session, so a whole hall can scan.
  const [presenting, setPresenting] = useState(false)
  const [bigSize, setBigSize] = useState(320)
  const startedMs = new Date(event.startedAt).getTime()

  // Size the fullscreen QR to the smaller viewport edge.
  useEffect(() => {
    if (!presenting) return
    const calc = () =>
      setBigSize(Math.max(220, Math.min(560, Math.min(window.innerWidth, window.innerHeight) - 96)))
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [presenting])

  // Rotating QR — same pattern as the class session, against the event secret.
  useEffect(() => {
    const secret = event.qrSecret
    if (!secret) return
    let cancelled = false
    let lastWindow = -1
    const update = async () => {
      const now = Date.now()
      setNowMs(now)
      setRotateIn(secondsUntilRotate(now))
      const w = currentWindow(now)
      if (w !== lastWindow) {
        lastWindow = w
        const code = await computeCode(secret, event.id, w)
        if (!cancelled) setPayload(buildEventPayload(event.id, w, code))
      }
    }
    void update()
    const id = window.setInterval(() => void update(), 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [event.id, event.qrSecret])

  // Poll the count — event_attendance isn't in realtime on purpose (scale).
  const refreshStats = useCallback(() => {
    void getEventStats(event.id)
      .then(setStats)
      .catch(() => {})
  }, [event.id])
  useEffect(() => {
    refreshStats()
    const id = window.setInterval(refreshStats, 4000)
    return () => window.clearInterval(id)
  }, [refreshStats])

  async function onEnd() {
    setConfirmEnd(false)
    setEnding(true)
    try {
      await endEventSession(event.id)
      onEnded()
    } catch (e) {
      toast(errorText(e, 'Could not end the event. Try again.'), 'error')
      setEnding(false)
    }
  }

  const maxSection = useMemo(
    () => stats?.bySection.reduce((m, s) => Math.max(m, s.count), 0) ?? 0,
    [stats],
  )

  return (
    <div className="space-y-5">
      <PageHeader title={event.name} subtitle="Live event check-in" fallback="/teach/attendance" />

      <Card pad="roomy" className="relative flex flex-col items-center gap-3">
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
            <div className="h-[232px] w-[232px] animate-pulse rounded-xl bg-card-2" />
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
            Code refreshes in {rotateIn}s ·{' '}
            <span className="tabular-nums">{clock(nowMs - startedMs)}</span> elapsed
            {event.pointsPerScan > 0 ? ` · +${event.pointsPerScan} pts each` : ''}
          </p>
        </div>
      </Card>

      {/* Live count */}
      <Card pad="roomy" className="text-center">
        <p className="font-display text-5xl font-bold tabular-nums text-reward">
          {stats?.total ?? 0}
        </p>
        <p className="text-xs text-muted">checked in</p>
      </Card>

      {/* Per-section turnout */}
      {stats && stats.bySection.length > 0 && (
        <div>
          <p className="mb-2 px-1 text-sm font-semibold text-muted">By section</p>
          <Card className="space-y-2.5 p-4">
            {stats.bySection.map((s) => (
              <div key={s.sectionId ?? 'none'} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-sm font-medium">{s.sectionName}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-card-2">
                  <div
                    className="h-full rounded-full bg-accent-solid"
                    style={{ width: `${maxSection ? (s.count / maxSection) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {s.count}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={() => setAddOpen(true)}>
          Add by hand
        </Button>
        <Button variant="danger" onClick={() => setConfirmEnd(true)} loading={ending} disabled={ending}>
          End event
        </Button>
      </div>

      {/* Fullscreen "present" QR — for a projector / shared screen at a big event. */}
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
              <p className="font-display text-2xl font-bold">{event.name}</p>
              <p className="text-sm text-muted">Scan to check in</p>
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
            <div className="text-center">
              <p className="font-display text-4xl font-bold tabular-nums text-reward">
                {stats?.total ?? 0}
              </p>
              <p className="text-sm text-muted">
                checked in · code refreshes in <span className="tabular-nums">{rotateIn}s</span>
                {event.pointsPerScan > 0 ? ` · +${event.pointsPerScan} pts each` : ''}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ManualAddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        eventId={event.id}
        onAdded={refreshStats}
      />

      <ConfirmDialog
        open={confirmEnd}
        title="End this event?"
        message="Students can no longer check in. Points already earned stay. This can't be undone."
        confirmLabel="End event"
        variant="danger"
        onConfirm={() => void onEnd()}
        onClose={() => setConfirmEnd(false)}
      />
    </div>
  )
}

/** Manual add: pick a section, search, tap a student — the same idempotent award. */
function ManualAddSheet({
  open,
  onClose,
  eventId,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  eventId: string
  onAdded: () => void
}) {
  const { sections } = useInstructor()
  const { toast } = useToast()
  const [sectionId, setSectionId] = useState('')
  const [roster, setRoster] = useState<Person[]>([])
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [query, setQuery] = useState('')
  const [markingId, setMarkingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (!sectionId && sections[0]) setSectionId(sections[0].id)
  }, [open, sections, sectionId])

  useEffect(() => {
    if (!open || !sectionId) return
    let cancelled = false
    setLoadingRoster(true)
    listRosterBasics(sectionId)
      .then((r) => !cancelled && setRoster(r))
      .catch(() => !cancelled && setRoster([]))
      .finally(() => !cancelled && setLoadingRoster(false))
    return () => {
      cancelled = true
    }
  }, [open, sectionId])

  const q = query.trim().toLowerCase()
  const visible = q
    ? roster.filter((p) => p.fullName.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q))
    : roster

  async function add(p: Person) {
    setMarkingId(p.id)
    try {
      const { already } = await markEventAttendance(eventId, p.id)
      toast(already ? `${p.displayName} was already in.` : `Added ${p.displayName}.`, 'success')
      onAdded()
    } catch (e) {
      toast(errorText(e, 'Could not add that student.'), 'error')
    } finally {
      setMarkingId(null)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add a student by hand">
      <div className="space-y-3">
        <Select
          aria-label="Section"
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students"
            className="pl-9"
          />
        </div>

        <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {loadingRoster ? (
            <p className="p-6 text-center text-sm text-muted">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No students match.</p>
          ) : (
            visible.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void add(p)}
                disabled={markingId === p.id}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-card-2 disabled:opacity-50"
              >
                <Avatar name={p.displayName} url={p.avatarUrl} className="h-9 w-9" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.fullName}</span>
                {markingId === p.id ? (
                  <span className="text-xs text-muted">…</span>
                ) : (
                  <CheckIcon className="h-5 w-5 text-muted" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </Sheet>
  )
}
