import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { listAuditLog } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { AuditEntry } from '@/lib/types'
import { OpsCard, RefreshButton, SourceError } from './parts'

const PAGE = 25

/** Every action the app writes (audit_log_action_check), grouped by what it means to you. */
const ACTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'delete', label: 'Deleted' },
  { value: 'hard_delete', label: 'Permanently deleted' },
  { value: 'archive', label: 'Archived' },
  { value: 'restore', label: 'Restored' },
  { value: 'broadcast', label: 'Broadcasts' },
  { value: 'promote', label: 'Promoted' },
  { value: 'semester_activate', label: 'Semester activated' },
  { value: 'edit_name', label: 'Name edits' },
  { value: 'grade_boost', label: 'Points assist' },
  { value: 'grade_visibility', label: 'Grades switch' },
  { value: 'peer_eval', label: 'Peer evaluation' },
  { value: 'peer_group', label: 'Peer groups' },
  { value: 'space_break_glass', label: 'Private chat reads' },
]

const TONE: Record<string, string> = {
  delete: 'bg-danger-solid/10 text-danger',
  hard_delete: 'bg-danger-solid/15 text-danger',
  space_break_glass: 'bg-warn-solid/15 text-warn',
  archive: 'bg-card-2 text-muted',
  restore: 'bg-success-solid/10 text-success',
  broadcast: 'bg-gold-400/15 text-reward',
}

const label = (action: string) => ACTIONS.find((a) => a.value === action)?.label ?? action

/**
 * Filtering is done by the DATABASE, not over what is already on screen: the log is paged, so a
 * client-side filter would only ever search the 25 newest rows. The list below is KEYED on the
 * filter, so a new filter mounts a fresh list that loads itself (no setState-in-effect).
 */
export function AuditLog() {
  const [action, setAction] = useState('')
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [bump, setBump] = useState(0)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  function onSearch(v: string) {
    setText(v)
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setSearch(v), 350)
  }

  return (
    <OpsCard
      title="Audit log"
      description="Every delete, archive, broadcast and rollover, with the full record of what changed. Kept for a year."
      action={<RefreshButton onClick={() => setBump((n) => n + 1)} />}
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <Select aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Search the log"
          value={text}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search a name or table"
          inputMode="search"
        />
      </div>
      <AuditRows key={`${action}|${search}|${bump}`} action={action} search={search} />
    </OpsCard>
  )
}

function AuditRows({ action, search }: { action: string; search: string }) {
  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const filter = { action: action || undefined, search }

  const first = useCallback(async () => {
    try {
      const page = await listAuditLog(PAGE, 0, { action: action || undefined, search })
      setRows(page)
      setHasMore(page.length === PAGE)
    } catch (e) {
      setError(errorText(e, "Couldn't read the audit log."))
    }
  }, [action, search])

  useEffect(() => {
    void first()
  }, [first])

  async function loadMore() {
    if (!rows) return
    setMore(true)
    try {
      const next = await listAuditLog(PAGE, rows.length, filter)
      setRows([...rows, ...next])
      setHasMore(next.length === PAGE)
    } catch (e) {
      setError(errorText(e, "Couldn't load older entries."))
    } finally {
      setMore(false)
    }
  }

  if (error) return <SourceError message={error} onRetry={() => { setError(null); setRows(null); void first() }} />
  if (rows === null) return <ListSkeleton rows={4} />
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted">
        {action || search ? 'Nothing matches that.' : 'Nothing destructive has happened. Good.'}
      </p>
    )
  }

  return (
    <>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="py-1">
            <button
              type="button"
              onClick={() => setOpen((cur) => (cur === r.id ? null : r.id))}
              aria-expanded={open === r.id}
              className="grid min-h-11 w-full grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-left"
            >
              <span
                className={cn(
                  'truncate rounded-lg px-2 py-0.5 text-center text-2xs font-semibold',
                  TONE[r.action] ?? 'bg-card-2 text-muted',
                )}
                title={r.action}
              >
                {label(r.action)}
              </span>
              <span className="truncate text-xs">{r.summary ?? r.tableName}</span>
              <span className="text-2xs text-muted">{timeAgo(r.at)}</span>
            </button>
            {open === r.id && (
              <pre className="mb-1 mt-1 max-h-64 overflow-auto rounded-lg bg-card-2 p-3 text-2xs leading-relaxed">
                {JSON.stringify(r.rowData, null, 2)}
              </pre>
            )}
          </li>
        ))}
      </ul>
      {hasMore && (
        <Button variant="outline" size="sm" className="mt-3 w-full" disabled={more} onClick={() => void loadMore()}>
          {more ? 'Loading…' : 'Load older'}
        </Button>
      )}
    </>
  )
}
