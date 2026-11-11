import { submitOfflineScan } from '@/lib/api'
import type { AttendanceStatus, OfflineScanOutcome } from '@/lib/types'

const KEY = 'cp_offline_scans_v1'

export interface OfflineScanEntry {
  id: string
  sessionId: string
  windowIndex: number
  code: string
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
    storageDegraded = true
    memoryFallback = entries
  }
}

export function loadQueue(): OfflineScanEntry[] {
  return load()
}

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

export function dismiss(id: string): void {
  save(load().filter((e) => e.id !== id))
}

const TERMINAL_FAIL: OfflineScanOutcome[] = [
  'expired',
  'invalid',
  'session_missing',
  'wrong_section',
]

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
