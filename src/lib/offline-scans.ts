/**
 * Offline attendance queue.
 *
 * A student with no data scans the QR optically (works offline); the proof —
 * the (session, window, code) triple, which is self-authenticating via the
 * server-side HMAC — is written here FIRST (capture-first, synchronous), then
 * submitted. It syncs on app start, on the `online` event, and on the
 * Attendance page. Resolved entries persist until the student dismisses them,
 * so the next app open always shows the outcome.
 *
 * localStorage (not IndexedDB): entries are tiny and few; iOS PWAs lack
 * Background Sync so app-open sync is the baseline regardless; the synchronous
 * write is what makes capture-first race-free; and it survives Workbox precache
 * swaps. Falls back to an in-memory array if storage is unavailable.
 */
import { submitOfflineScan } from '@/lib/api'
import type { AttendanceStatus, OfflineScanOutcome } from '@/lib/types'

const KEY = 'cp_offline_scans_v1'

export interface OfflineScanEntry {
  id: string
  sessionId: string
  windowIndex: number
  code: string
  /** Client clock — DISPLAY ONLY. The server derives real time from the window. */
  capturedAt: string
  state: 'queued' | 'recorded' | 'failed'
  attempts: number
  outcome?: OfflineScanOutcome
  resultStatus?: AttendanceStatus | null
  topic?: string | null
  syncedAt?: string
}

let memoryFallback: OfflineScanEntry[] | null = null
let syncing = false
/** Set true the first time storage throws, so callers can warn once. */
export let storageDegraded = false

function load(): OfflineScanEntry[] {
  if (memoryFallback) return memoryFallback
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as OfflineScanEntry[]) : []
  } catch {
    storageDegraded = true
    memoryFallback = []
    return memoryFallback
  }
}

function save(entries: OfflineScanEntry[]): void {
  if (memoryFallback) {
    memoryFallback = entries
    return
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // Quota exceeded or private-mode unavailable — fall back to memory so the
    // current session still works. A one-time warning is surfaced by callers.
    storageDegraded = true
    memoryFallback = entries
  }
}

export function loadQueue(): OfflineScanEntry[] {
  return load()
}

/**
 * Add a captured scan. Deduped per session: a re-scan of the same session's QR
 * replaces the queued entry with the fresher window (unless it already resolved).
 */
export function enqueue(input: {
  sessionId: string
  windowIndex: number
  code: string
}): OfflineScanEntry {
  const entries = load()
  const existing = entries.find((e) => e.sessionId === input.sessionId && e.state === 'queued')
  if (existing) {
    existing.windowIndex = input.windowIndex
    existing.code = input.code
    existing.capturedAt = new Date().toISOString()
    save(entries)
    return existing
  }
  const entry: OfflineScanEntry = {
    id: crypto.randomUUID(),
    sessionId: input.sessionId,
    windowIndex: input.windowIndex,
    code: input.code,
    capturedAt: new Date().toISOString(),
    state: 'queued',
    attempts: 0,
  }
  entries.unshift(entry)
  save(entries)
  return entry
}

/** Remove one entry (dismiss a resolved card, or drop an online-handled scan). */
export function dismiss(id: string): void {
  save(load().filter((e) => e.id !== id))
}

const TERMINAL_FAIL: OfflineScanOutcome[] = [
  'expired',
  'invalid',
  'session_missing',
  'wrong_section',
]

/**
 * Submit every queued entry, oldest-attempt first. Recorded/upgraded/already →
 * resolved (kept until dismissed). Terminal server outcomes → failed. Transport
 * errors (still offline) leave the entry queued and stop the run. Returns
 * whether anything changed so callers can refresh.
 */
export async function syncOfflineScans(): Promise<boolean> {
  if (syncing) return false
  syncing = true
  let changed = false
  try {
    // Re-read each pass; the queue can shrink as we go.
    for (const entry of load().filter((e) => e.state === 'queued')) {
      try {
        const res = await submitOfflineScan(entry.sessionId, entry.windowIndex, entry.code)
        const entries = load()
        const target = entries.find((e) => e.id === entry.id)
        if (!target) continue // dismissed mid-flight
        target.attempts += 1
        target.outcome = res.outcome
        target.topic = res.topic
        target.resultStatus = res.status
        target.syncedAt = new Date().toISOString()
        target.state = TERMINAL_FAIL.includes(res.outcome) ? 'failed' : 'recorded'
        save(entries)
        changed = true
      } catch {
        // Transport failure — still offline. Bump attempts, stop the loop.
        const entries = load()
        const target = entries.find((e) => e.id === entry.id)
        if (target) {
          target.attempts += 1
          save(entries)
        }
        break
      }
    }
  } finally {
    syncing = false
  }
  return changed
}
