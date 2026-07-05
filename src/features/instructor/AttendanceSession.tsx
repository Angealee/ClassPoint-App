import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { QrCode } from '@/components/attendance/QrCode'
import { StatusChip } from '@/components/attendance/StatusChip'
import { endClassSession, listSessionAttendance } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import {
  QR_STEP_SECONDS,
  buildPayload,
  computeCode,
  currentWindow,
  secondsUntilRotate,
} from '@/lib/qr'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { AttendanceRosterRow, ClassSession } from '@/lib/types'

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
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
  const [ending, setEnding] = useState(false)

  const startedMs = new Date(session.startedAt).getTime()

  // Rotating QR: recompute the code whenever the time-window ticks over.
  useEffect(() => {
    const secret = session.qrSecret
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
  }, [session.id, session.qrSecret])

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

  // Live roster — react as students check in (realtime is the sanctioned place
  // for a direct Supabase channel, mirroring StudentData).
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
        () => void refresh(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [session.id, refresh])

  const scanned = roster.filter((r) => r.scannedAt)
  const waiting = roster.filter((r) => !r.scannedAt)
  const present = roster.filter((r) => r.status === 'present').length
  const late = roster.filter((r) => r.status === 'late').length

  // Most-recent check-ins first, then everyone still waiting (A–Z).
  const ordered = [
    ...scanned.sort((a, b) => (b.scannedAt ?? '').localeCompare(a.scannedAt ?? '')),
    ...waiting,
  ]

  const endedRef = useRef(false)
  async function onEndClick() {
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
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
          Live
        </span>
      </div>

      {/* Rotating QR */}
      <Card className="flex flex-col items-center gap-3 p-6">
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
        </div>
      </Card>

      {/* Live tallies */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Present', value: present, cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Late', value: late, cls: 'text-gold-600 dark:text-gold-400' },
          { label: 'Waiting', value: waiting.length, cls: 'text-muted' },
        ].map((s) => (
          <Card key={s.label} className="p-3 text-center">
            <p className={cn('font-display text-2xl font-bold tabular-nums', s.cls)}>{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Roster */}
      {roster.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No students in {sectionName} yet — add some in the Students tab.
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {ordered.map((r) => (
            <motion.div
              key={r.studentId}
              layout
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              className="flex items-center gap-3 p-3.5"
            >
              <Avatar name={r.fullName} url={r.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.fullName}</p>
                {r.scannedAt ? (
                  <p className="text-xs text-muted">checked in {timeAgo(r.scannedAt)}</p>
                ) : (
                  <p className="text-xs text-muted/70">not yet</p>
                )}
              </div>
              {r.status ? (
                <StatusChip status={r.status} />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full border-2 border-line" aria-hidden />
              )}
            </motion.div>
          ))}
        </Card>
      )}

      <div className="sticky bottom-19 z-10 md:bottom-4">
        <Button size="lg" className="w-full shadow-lg" onClick={onEndClick} disabled={ending}>
          {ending ? 'Ending…' : 'End class & review'}
        </Button>
      </div>
    </div>
  )
}
