/**
 * One-shot hand-off of a NATIVE-camera event-QR scan (0055).
 *
 * The event QR is a `…/scan#CP1E|…` deep link, so a phone's native camera opens
 * `/scan` (ScanLanding). That route only understands class QRs, so it stashes an
 * event scan here and routes to the in-app event screen, which reads it once and
 * submits it. sessionStorage, NOT the class offline queue: an event award is
 * validated server-side on the spot and there is no "record it offline" story —
 * a stale capture simply expires.
 */
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

/**
 * Read AND clear the capture (so it fires exactly once, even under StrictMode's
 * double-mount). Returns null when absent or older than 2 minutes — the rotating
 * code's window is long gone by then, and auto-submitting it would only show an
 * "expired" error.
 */
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
