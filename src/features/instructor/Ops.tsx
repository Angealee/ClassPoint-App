import { ErrorState } from '@/components/ui/EmptyState'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { CalendarIcon, SaturnIcon, TableIcon } from '@/components/ui/icons'
import { Toggle } from '@/components/ui/Toggle'
import {
  forceLeaderboardRefresh,
  getBackupHealth,
  getSectionHeadcounts,
  getStudentGradesEnabled,
  listAuditLog,
  listAuthEvents,
  setStudentGradesEnabled,
} from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { AttendanceWorkbook } from './AttendanceWorkbook'
import { Broadcast } from './Broadcast'
import { RiskOverview } from './RiskOverview'
import { errorText } from '@/lib/errors'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { AuditEntry, AuthEvent, BackupHealth } from '@/lib/types'

const AUDIT_PAGE = 25

export function Ops() {
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    getSectionHeadcounts()
      .then(setCounts)
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ops & trust"
        subtitle="What the system has been doing while you weren't looking."
        fallback="/teach"
      />

      <SemestersCard />
      <SpaceCard />
      <StudentGradesCard />

      <RiskOverview />
      <Broadcast counts={counts} />
      <AttendanceWorkbook />

      <BackupHealthCard />
      <LeaderboardCard />
      <AuthEventsCard />
      <AuditLogCard />
    </div>
  )
}

function BackupHealthCard() {
  const [rows, setRows] = useState<BackupHealth[]>([])
  const [loadedAt, setLoadedAt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await getBackupHealth())
      setLoadedAt(Date.now())
    } catch (e) {
      setError(errorText(e, "Couldn't read backup health."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const today = new Date(loadedAt).toISOString().slice(0, 10)
  const yesterday = new Date(loadedAt - 86_400_000).toISOString().slice(0, 10)
  const stale = rows.filter((r) => !r.lastSnapshot || r.lastSnapshot < yesterday)
  const healthy = rows.length > 0 && stale.length === 0

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Backup health</h2>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <ErrorLine text={error} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          No backup tables yet — the nightly job creates them on its first run.
        </p>
      ) : (
        <>
          <div
            className={cn(
              'mb-3 rounded-xl px-3 py-2 text-sm font-medium',
              healthy
                ? 'bg-success-solid/10 text-success'
                : 'bg-danger-solid/10 text-danger',
            )}
          >
            {healthy
              ? `All ${rows.length} tables backed up${
                  rows[0]?.lastSnapshot === today ? ' today' : ' yesterday'
                }.`
              : `${stale.length} of ${rows.length} tables haven't backed up since ${yesterday}.`}
          </div>
          <div className="divide-y divide-line">
            {rows.map((r) => {
              const isStale = !r.lastSnapshot || r.lastSnapshot < yesterday
              return (
                <div key={r.tableName} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.tableName}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {r.rowCount.toLocaleString()} rows · {r.snapshotDays}d kept
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-xs font-semibold tabular-nums',
                      isStale ? 'text-danger' : 'text-muted',
                    )}
                  >
                    {r.lastSnapshot ?? 'never'}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}

function LeaderboardCard() {
  const { toast } = useToast()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      await forceLeaderboardRefresh()
      toast('Leaderboard rebuilt.', 'success')
    } catch (e) {
      toast(errorText(e, "Couldn't rebuild the leaderboard."), 'error')
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">Leaderboard</h2>
        <p className="text-xs text-muted">
          The board is frozen and rebuilt at 12:30 and 19:30. Rebuild it now to
          publish points awarded since.
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm(true)}>
        {busy ? 'Rebuilding…' : 'Rebuild now'}
      </Button>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void run()}
        busy={busy}
        variant="default"
        title="Rebuild the leaderboard?"
        message="Every student's rank is recalculated and republished immediately."
        detail="Anyone who climbed since the last freeze will see their new rank — and anyone who slipped will see that too."
        confirmLabel="Rebuild"
      />
    </Card>
  )
}

function AuthEventsCard() {
  const [rows, setRows] = useState<AuthEvent[]>([])
  const [loadedAt, setLoadedAt] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await listAuthEvents(25))
      setLoadedAt(Date.now())
    } catch (e) {
      setError(errorText(e, "Couldn't read auth events."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const cutoff = loadedAt - 15 * 60_000
  const recentFails = new Map<string, number>()
  for (const r of rows) {
    if (r.success || !r.ip || r.detail === 'rate_limited') continue
    if (new Date(r.at).getTime() < cutoff) continue
    recentFails.set(r.ip, (recentFails.get(r.ip) ?? 0) + 1)
  }
  const hot = [...recentFails.entries()].filter(([, n]) => n >= 5)

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Claim &amp; PIN-reset attempts</h2>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {hot.length > 0 && (
        <p className="mb-3 rounded-xl bg-warn-solid/10 px-3 py-2 text-xs text-warn">
          {hot.map(([ip, n]) => `${ip}: ${n} failures`).join(' · ')} in the last 15
          minutes. The limiter blocks at 30 — a whole class shares one network
          address, so this is usually a shared wifi, not an attack.
        </p>
      )}

      {loading ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <ErrorLine text={error} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing yet. Rows appear when a student claims an account or resets a PIN.
        </p>
      ) : (
        <div className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-2">
              <span
                className={cn(
                  'shrink-0 rounded-lg px-1.5 py-0.5 text-2xs font-semibold',
                  r.success
                    ? 'bg-success-solid/10 text-success'
                    : 'bg-danger-solid/10 text-danger',
                )}
              >
                {r.success ? 'ok' : 'fail'}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">
                {r.kind === 'pin_reset' ? 'PIN reset' : 'Claim'}
                {r.detail && <span className="text-muted"> · {r.detail}</span>}
              </span>
              <span className="shrink-0 font-mono text-2xs text-muted">{r.ip ?? '—'}</span>
              <span className="shrink-0 text-2xs text-muted">{timeAgo(r.at)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

const ACTION_TONE: Record<string, string> = {
  delete: 'bg-danger-solid/10 text-danger',
  hard_delete: 'bg-danger-solid/15 text-danger',
  archive: 'bg-card-2 text-muted',
  restore: 'bg-success-solid/10 text-success',
  broadcast: 'bg-gold-400/15 text-reward',
}

function AuditLogCard() {
  const [rows, setRows] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const first = await listAuditLog(AUDIT_PAGE)
      setRows(first)
      setHasMore(first.length === AUDIT_PAGE)
    } catch (e) {
      setError(errorText(e, "Couldn't read the audit log."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const next = await listAuditLog(AUDIT_PAGE, rows.length)
      setRows((prev) => [...prev, ...next])
      setHasMore(next.length === AUDIT_PAGE)
    } catch (e) {
      setError(errorText(e, "Couldn't load older entries."))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Audit log</h2>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted">
        Every delete, archive and broadcast, with the full record of what was
        removed. Kept for a year.
      </p>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorLine text={error} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing destructive has happened. Good.</p>
      ) : (
        <>
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <div key={r.id} className="py-2">
                <button
                  type="button"
                  onClick={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
                  className="flex w-full items-center gap-2 text-left"
                  aria-expanded={expanded === r.id}
                >
                  <span
                    className={cn(
                      'shrink-0 rounded-lg px-1.5 py-0.5 text-2xs font-semibold',
                      ACTION_TONE[r.action] ?? 'bg-card-2 text-muted',
                    )}
                  >
                    {r.action}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {r.summary ?? r.tableName}
                  </span>
                  <span className="shrink-0 text-2xs text-muted">{timeAgo(r.at)}</span>
                </button>
                {expanded === r.id && (
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-card-2 p-3 text-2xs leading-relaxed">
                    {JSON.stringify(r.rowData, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
          {hasMore && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? 'Loading…' : 'Load older'}
            </Button>
          )}
        </>
      )}
    </Card>
  )
}

function SpaceCard() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate('/teach/space')}
      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-4 text-left transition-colors hover:bg-card-2"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-solid/10 text-accent">
        <SaturnIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Student Space</span>
        <span className="block text-sm text-muted">
          Who is in the beta, muted students, and the switch that turns it all off.
        </span>
      </span>
      <span className="shrink-0 text-lg text-muted">›</span>
    </button>
  )
}

function StudentGradesCard() {
  const { toast } = useToast()
  const [on, setOn] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(() => {
    getStudentGradesEnabled()
      .then((value) => {
        setOn(value)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function apply(next: boolean) {
    setBusy(true)
    try {
      const result = await setStudentGradesEnabled(next)
      setOn(result.enabled)
      setConfirming(false)
      toast(
        next
          ? result.notified > 0
            ? `Students can now see their grades — ${result.notified} notified.`
            : 'Students can now see their grades.'
          : 'Grades are hidden again — students still see their scores.',
        'success',
      )
    } catch (e) {
      toast(errorText(e, 'Could not change that.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-solid/10 text-accent">
          <TableIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Student grades</span>
          <span className="block text-sm text-muted">
            {failed
              ? 'Couldn’t read the setting. This needs migration 0062 applied.'
              : on
                ? 'Students see their scores AND their grade (the term figure and the part scores).'
                : 'Grades hidden. Students still see their scores and can use points assist — just not the grade.'}
          </span>
          {failed && (
            <button type="button" onClick={load} className="mt-1 text-xs font-semibold text-accent">
              Try again
            </button>
          )}
        </span>
        {on !== null && (
          <Toggle
            on={on}
            busy={busy}
            label="Students can see their grades"
            onChange={(next) => (next ? setConfirming(true) : void apply(false))}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        variant="default"
        title="Open grades to students?"
        message="Every student will see a “so far” grade for each subject and a score for each part, on top of the scores they can already see. Using points works the same either way."
        detail="Check the marks first. Every student in a class that has marks is sent a notification, and a student who has seen a grade has seen it."
        confirmLabel="Open grades"
        busy={busy}
        onConfirm={() => apply(true)}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}

function ErrorLine({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <ErrorState inline onRetry={onRetry}>
      {text}
    </ErrorState>
  )
}

function SemestersCard() {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navigate('/teach/semesters')}
      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card p-4 text-left transition-colors hover:bg-card-2"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-solid/10 text-accent">
        <CalendarIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Semester &amp; subjects</span>
        <span className="block text-sm text-muted">
          Term dates, subjects, and rolling over to a new semester.
        </span>
      </span>
      <span className="shrink-0 text-lg text-muted">›</span>
    </button>
  )
}