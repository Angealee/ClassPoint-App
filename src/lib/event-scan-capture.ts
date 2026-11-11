const KEY = 'cp_event_scan_v1'

export interface EventScanCapture {
  eventId: string
  windowIndex: number
  code: string
  at: number
}

export function writeEventScanCapture(c: {
  eventId: string
  windowIndex: number
  code: string
}): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...c, at: Date.now() }))
  } catch {
    /* storage unavailable — the student can still scan in-app */
  }
}

export function readEventScanCapture(): EventScanCapture | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    sessionStorage.removeItem(KEY)
    const c = JSON.parse(raw) as EventScanCapture
    if (
      !c ||
      typeof c.eventId !== 'string' ||
      !Number.isFinite(c.windowIndex) ||
      typeof c.code !== 'string' ||
      Date.now() - (c.at ?? 0) > 120000
    ) {
      return null
    }
    return c
  } catch {
    return null
  }
}
