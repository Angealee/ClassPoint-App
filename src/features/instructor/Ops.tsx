import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import {
  forceLeaderboardRefresh,
  getBackupHealth,
  getSectionHeadcounts,
  listAuditLog,
  listAuthEvents,
} from '@/lib/api'
import { AttendanceWorkbook } from './AttendanceWorkbook'
import { Broadcast } from './Broadcast'
import { RiskOverview } from './RiskOverview'
import { errorText } from '@/lib/errors'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { AuditEntry, AuthEvent, BackupHealth } from '@/lib/types'

const AUDIT_PAGE = 25

/**
 * Ops & trust (Phase G).
 *
 * Four systems have been running in this database with no way to look at them:
 * the nightly backup, the audit log, the auth-event trail, and the on-demand
 * leaderboard refresh (granted since 0006 and never once called). Every card
 * here is a read of something that already existed.
 *
 * Deliberately a standalone route rather than a fifth tab — it's a place you go
 * when you have a question, not part of the teaching loop.
 */
export function Ops() {
  const [counts, setCounts] = useState<Record<string, number>>({})

  // Headcounts feed the broadcast composer's recipient number. A failure just
  // leaves it at zero, which disables Send — the safe direction to fail.
  useEffect(() => {
    getSectionHeadcounts()
      .then(setCounts)
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold">Ops &amp; trust</h1>
        <p className="text-sm text-muted">
          What the system has been doing while you weren't looking.
        </p>
      </div>

      {/* Acting-on-students first, inspection below — the order you'd want on
          a Monday morning. */}
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

/* ── Backup health ───────────────────────────────────────────────────────── */

function BackupHealthCard() {
  const [rows, setRows] = useState<BackupHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await getBackupHealth())
    } catch (e) {
      setError(errorText(e, "Couldn't read backup health."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // The nightly job runs at 02:00 Manila. Anything that hasn't captured since
  // yesterday means the cron didn't run — which is the failure this card is for.
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
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
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-brand-500/10 text-brand-500',
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
                      isStale ? 'text-brand-500' : 'text-muted',
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

/* ── Leaderboard refresh ─────────────────────────────────────────────────── */

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

/* ── Auth events ─────────────────────────────────────────────────────────── */

function AuthEventsCard() {
  const [rows, setRows] = useState<AuthEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await listAuthEvents(25))
    } catch (e) {
      setError(errorText(e, "Couldn't read auth events."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // The edge functions lock an IP at 30 failures in 15 minutes (0026). Counting
  // the same window here answers "is this student actually locked out?" — the
  // question this card exists for.
  const cutoff = Date.now() - 15 * 60_000
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
        <p className="mb-3 rounded-xl bg-brand-500/10 px-3 py-2 text-xs text-brand-500">
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
                  'shrink-0 rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold',
                  r.success
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-brand-500/10 text-brand-500',
                )}
              >
                {r.success ? 'ok' : 'fail'}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs">
                {r.kind === 'pin_reset' ? 'PIN reset' : 'Claim'}
                {r.detail && <span className="text-muted"> · {r.detail}</span>}
              </span>
              <span className="shrink-0 font-mono text-[0.65rem] text-muted">{r.ip ?? '—'}</span>
              <span className="shrink-0 text-[0.65rem] text-muted">{timeAgo(r.at)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ── Audit log ───────────────────────────────────────────────────────────── */

const ACTION_TONE: Record<string, string> = {
  delete: 'bg-brand-500/10 text-brand-500',
  hard_delete: 'bg-brand-500/15 text-brand-500',
  archive: 'bg-card-2 text-muted',
  restore: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  broadcast: 'bg-gold-400/15 text-gold-600 dark:text-gold-400',
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
                      'shrink-0 rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold',
                      ACTION_TONE[r.action] ?? 'bg-card-2 text-muted',
                    )}
                  >
                    {r.action}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {r.summary ?? r.tableName}
                  </span>
                  <span className="shrink-0 text-[0.65rem] text-muted">{timeAgo(r.at)}</span>
                </button>
                {expanded === r.id && (
                  // The whole deleted row, verbatim. This is the point of the
                  // audit log — knowing something was deleted is far less
                  // useful than knowing exactly what it contained.
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-card-2 p-3 text-[0.65rem] leading-relaxed">
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

function ErrorLine({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <p className="min-w-0 flex-1 text-sm text-brand-500">{text}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
