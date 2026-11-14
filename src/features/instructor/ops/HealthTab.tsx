import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import { authByDay, authLast24h, hotIps, staleBackups } from '@/lib/ops-signals'
import type { AuthEvent, BackupHealth } from '@/lib/types'
import type { Source } from './useSource'
import { AuditLog } from './AuditLog'
import { OpsCard, RefreshButton, SourceError } from './parts'

export function HealthTab({
  backup,
  reloadBackup,
  auth,
  reloadAuth,
}: {
  backup: Source<BackupHealth[]>
  reloadBackup: () => void
  auth: Source<AuthEvent[]>
  reloadAuth: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <SecurityCard auth={auth} reload={reloadAuth} />
        <BackupCard backup={backup} reload={reloadBackup} />
      </div>
      <AuditLog />
    </div>
  )
}

function Figure({ value, label, tone }: { value: number; label: string; tone?: 'danger' | 'warn' }) {
  return (
    <div className="min-w-0 rounded-xl bg-card-2 px-3 py-2.5">
      <p
        className={cn(
          'font-display text-2xl font-bold leading-none tabular-nums',
          value > 0 && tone === 'danger' && 'text-danger',
          value > 0 && tone === 'warn' && 'text-warn',
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 truncate text-2xs text-muted">{label}</p>
    </div>
  )
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' })

function SecurityCard({ auth, reload }: { auth: Source<AuthEvent[]>; reload: () => void }) {
  const [all, setAll] = useState(false)
  const busy = auth.status === 'ready' && auth.refreshing

  return (
    <OpsCard
      title="Sign-in security"
      description="Claim and PIN-reset attempts. Ordinary sign-ins go straight to the auth provider and are not recorded here."
      action={<RefreshButton onClick={reload} busy={busy} />}
    >
      {auth.status === 'loading' ? (
        <ListSkeleton rows={3} />
      ) : auth.status === 'error' ? (
        <SourceError message={auth.message} onRetry={reload} />
      ) : (
        <SecurityBody events={auth.data} now={auth.at} all={all} onToggle={() => setAll((v) => !v)} />
      )}
    </OpsCard>
  )
}

function SecurityBody({
  events,
  now,
  all,
  onToggle,
}: {
  events: AuthEvent[]
  now: number
  all: boolean
  onToggle: () => void
}) {
  const day = authLast24h(events, now)
  const days = authByDay(events, now, 7)
  const peak = Math.max(1, ...days.map((d) => d.ok + d.failed + d.limited))
  const hot = hotIps(events, now)
  const shown = all ? events.slice(0, 25) : events.slice(0, 6)

  return (
    <div className="space-y-4">
      <div>
      <p className="mb-2 text-2xs font-semibold uppercase tracking-widest text-muted">Last 24 hours</p>
      <div className="grid grid-cols-3 gap-2">
        <Figure value={day.ok} label="Succeeded" />
        <Figure value={day.failed} label="Failed" tone="danger" />
        <Figure value={day.limited} label="Limited" tone="warn" />
      </div>
      </div>

      <div>
        <div
          role="img"
          aria-label={`Attempts per day this week: ${days.map((d) => d.ok + d.failed + d.limited).join(', ')}`}
          className="flex h-14 items-end gap-1.5"
        >
          {days.map((d) => {
            const total = d.ok + d.failed + d.limited
            return (
              <div
                key={d.day}
                className="flex h-full min-w-0 flex-1 flex-col justify-end"
                title={`${d.day}: ${d.ok} ok, ${d.failed} failed, ${d.limited} limited`}
              >
                {total === 0 ? (
                  <div className="h-0.5 rounded-full bg-line" />
                ) : (
                  <div
                    className="flex flex-col-reverse overflow-hidden rounded-md"
                    style={{ height: `${(total / peak) * 100}%` }}
                  >
                    <div className="bg-success-solid/70" style={{ flexGrow: d.ok }} />
                    <div className="bg-warn-solid" style={{ flexGrow: d.limited }} />
                    <div className="bg-danger-solid" style={{ flexGrow: d.failed }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-1 flex gap-1.5" aria-hidden>
          {days.map((d) => (
            <span key={d.day} className="min-w-0 flex-1 text-center text-2xs text-muted">
              {WEEKDAY.format(new Date(`${d.day}T12:00:00`))}
            </span>
          ))}
        </div>
        {events.length >= 300 && (
          <p className="mt-2 text-2xs text-muted">Showing the latest 300 attempts, so the oldest days may be partial.</p>
        )}
      </div>

      {hot.length > 0 && (
        <p className="rounded-xl bg-warn-solid/10 px-3 py-2 text-xs text-warn">
          {hot.map(([ip, n]) => `${ip}: ${n} failures`).join(' · ')} in the last 15 minutes. The limiter blocks at 30,
          and a whole class shares one network address, so this is usually shared wifi, not an attack.
        </p>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet. Rows appear when a student claims an account or resets a PIN.</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {shown.map((r) => (
              <li key={r.id} className="flex min-h-11 items-center gap-3 py-1.5">
                <span
                  className={cn(
                    'w-9 shrink-0 rounded-lg py-0.5 text-center text-2xs font-semibold',
                    r.success ? 'bg-success-solid/10 text-success' : 'bg-danger-solid/10 text-danger',
                  )}
                >
                  {r.success ? 'ok' : 'fail'}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">
                  {r.kind === 'pin_reset' ? 'PIN reset' : 'Claim'}
                  {r.detail && <span className="text-muted"> · {r.detail}</span>}
                </span>
                <span className="hidden shrink-0 font-mono text-2xs text-muted sm:inline">{r.ip ?? '-'}</span>
                <span className="shrink-0 text-2xs text-muted">{timeAgo(r.at)}</span>
              </li>
            ))}
          </ul>
          {events.length > 6 && (
            <Button variant="ghost" size="sm" className="w-full" onClick={onToggle}>
              {all ? 'Show fewer' : `Show ${Math.min(events.length, 25)} recent`}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function BackupCard({ backup, reload }: { backup: Source<BackupHealth[]>; reload: () => void }) {
  const [all, setAll] = useState(false)
  const busy = backup.status === 'ready' && backup.refreshing

  return (
    <OpsCard
      title="Backups"
      description="Every critical table is copied nightly at 02:00 Manila and kept for two weeks (a year for grades)."
      action={<RefreshButton onClick={reload} busy={busy} />}
    >
      {backup.status === 'loading' ? (
        <ListSkeleton rows={3} />
      ) : backup.status === 'error' ? (
        <SourceError message={backup.message} onRetry={reload} />
      ) : backup.data.length === 0 ? (
        <p className="text-sm text-muted">No backup tables yet, the nightly job creates them on its first run.</p>
      ) : (
        <BackupBody rows={backup.data} now={backup.at} all={all} onToggle={() => setAll((v) => !v)} />
      )}
    </OpsCard>
  )
}

function BackupBody({
  rows,
  now,
  all,
  onToggle,
}: {
  rows: BackupHealth[]
  now: number
  all: boolean
  onToggle: () => void
}) {
  const stale = staleBackups(rows, now)
  const healthy = stale.length === 0
  const today = new Date(now).toISOString().slice(0, 10)
  const staleSet = new Set(stale.map((r) => r.tableName))
  const ordered = [...rows].sort((a, b) => Number(staleSet.has(b.tableName)) - Number(staleSet.has(a.tableName)))
  const shown = all ? ordered : ordered.slice(0, Math.max(4, stale.length))

  return (
    <div className="space-y-3">
      <p
        className={cn(
          'rounded-xl px-3 py-2 text-sm font-medium',
          healthy ? 'bg-success-solid/10 text-success' : 'bg-danger-solid/10 text-danger',
        )}
      >
        {healthy
          ? `All ${rows.length} tables backed up${rows[0]?.lastSnapshot === today ? ' today' : ' yesterday'}.`
          : `${stale.length} of ${rows.length} tables are behind.`}
      </p>
      <ul className="divide-y divide-line">
        {shown.map((r) => {
          const behind = staleSet.has(r.tableName)
          return (
            <li key={r.tableName} className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-1.5">
              <span className="truncate font-mono text-xs">{r.tableName}</span>
              <span className={cn('text-xs font-semibold tabular-nums', behind ? 'text-danger' : 'text-muted')}>
                {r.lastSnapshot ?? 'never'}
              </span>
              <span className="col-span-2 text-2xs tabular-nums text-muted">
                {r.rowCount.toLocaleString()} rows · {r.snapshotDays} days kept
              </span>
            </li>
          )
        })}
      </ul>
      {rows.length > 4 && (
        <Button variant="ghost" size="sm" className="w-full" onClick={onToggle}>
          {all ? 'Show fewer' : `Show all ${rows.length} tables`}
        </Button>
      )}
    </div>
  )
}
