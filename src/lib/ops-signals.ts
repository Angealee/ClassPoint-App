import type { AuthEvent, BackupHealth } from '@/lib/types'

/*
 * What the Ops screen decides from raw rows. Pure, because the plate at the top says "3 need you"
 * and the rows beneath have to agree with it; a count computed in two places is how a screen ends
 * up saying "All clear" over a red banner.
 */

export type OpsTab = 'attention' | 'tools' | 'setup' | 'health'

export const OPS_TABS: ReadonlyArray<{ value: OpsTab; label: string }> = [
  { value: 'attention', label: 'Attention' },
  { value: 'tools', label: 'Tools' },
  { value: 'setup', label: 'Setup' },
  { value: 'health', label: 'Health' },
]

export const isOpsTab = (v: string | null): v is OpsTab => OPS_TABS.some((t) => t.value === v)

const DAY_MS = 86_400_000
const dayKey = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** A table is behind when its newest snapshot is older than yesterday (UTC date, as stored). */
export function staleBackups(rows: readonly BackupHealth[], now: number): BackupHealth[] {
  const yesterday = new Date(now - DAY_MS).toISOString().slice(0, 10)
  return rows.filter((r) => !r.lastSnapshot || r.lastSnapshot < yesterday)
}

/**
 * Addresses with at least five failed attempts in the last 15 minutes. Rate-limited rows are left
 * out on purpose: they are the limiter doing its job, and counting them would let one bad minute
 * keep an address "hot" for as long as it keeps retrying.
 */
export function hotIps(events: readonly AuthEvent[], now: number): Array<[string, number]> {
  const cutoff = now - 15 * 60_000
  const fails = new Map<string, number>()
  for (const e of events) {
    if (e.success || !e.ip || e.detail === 'rate_limited') continue
    if (new Date(e.at).getTime() < cutoff) continue
    fails.set(e.ip, (fails.get(e.ip) ?? 0) + 1)
  }
  return [...fails.entries()].filter(([, n]) => n >= 5)
}

export interface AuthDay {
  /** yyyy-mm-dd in the viewer's own calendar. */
  day: string
  ok: number
  failed: number
  limited: number
}

/** Oldest first, one entry per day including quiet ones, so a gap reads as a gap. */
export function authByDay(events: readonly AuthEvent[], now: number, days = 7): AuthDay[] {
  const out: AuthDay[] = []
  const index = new Map<string, AuthDay>()
  for (let i = days - 1; i >= 0; i--) {
    const d: AuthDay = { day: dayKey(now - i * DAY_MS), ok: 0, failed: 0, limited: 0 }
    out.push(d)
    index.set(d.day, d)
  }
  for (const e of events) {
    const d = index.get(dayKey(new Date(e.at).getTime()))
    if (!d) continue
    if (e.detail === 'rate_limited') d.limited += 1
    else if (e.success) d.ok += 1
    else d.failed += 1
  }
  return out
}

export interface AuthSummary {
  ok: number
  failed: number
  limited: number
}

export function authLast24h(events: readonly AuthEvent[], now: number): AuthSummary {
  const cutoff = now - DAY_MS
  const s: AuthSummary = { ok: 0, failed: 0, limited: 0 }
  for (const e of events) {
    if (new Date(e.at).getTime() < cutoff) continue
    if (e.detail === 'rate_limited') s.limited += 1
    else if (e.success) s.ok += 1
    else s.failed += 1
  }
  return s
}

export type AttentionKey = 'requests' | 'finalize' | 'risk' | 'backup' | 'signins'

export interface AttentionInput {
  /** Each is null when its source failed to load: a signal we cannot read is not a signal. */
  requests: number | null
  finalize: number | null
  risk: number | null
  backup: number | null
  signins: number | null
}

export interface AttentionItem {
  key: AttentionKey
  count: number
}

/** The order is urgency: a class waiting to be finalised outranks a backup that is a day behind. */
const ORDER: AttentionKey[] = ['finalize', 'requests', 'risk', 'backup', 'signins']

export function attentionItems(input: AttentionInput): AttentionItem[] {
  return ORDER.flatMap((key) => {
    const count = input[key]
    return count !== null && count > 0 ? [{ key, count }] : []
  })
}

/** Strips what would change the meaning of a PostgREST `or(...)` filter. */
export const cleanSearch = (q: string): string => q.replace(/[%,()*\\]/g, ' ').replace(/\s+/g, ' ').trim()
