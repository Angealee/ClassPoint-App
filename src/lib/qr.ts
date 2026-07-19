/**
 * Rotating attendance-QR codes.
 *
 * The instructor's browser holds the session's secret (from start_class_session)
 * and derives a short code that changes every QR_STEP_SECONDS. The QR encodes the
 * session id, the current time-window index, and that code. When a student scans
 * it, `scan_attendance` (SECURITY DEFINER) re-derives the same HMAC server-side
 * and rejects any window that isn't current — so a screenshot shared with an
 * absent classmate stops working within ~30 seconds.
 *
 * This MUST stay byte-for-byte compatible with the Postgres side in
 * migration 0014: HMAC-SHA256(key = secret, msg = `${sessionId}.${window}`),
 * lowercase hex, first 16 chars.
 */

/** Seconds each QR code is valid before it rotates. Mirrors the SQL (15s). */
export const QR_STEP_SECONDS = 15

const PREFIX = 'CP1'

/** The current time-window index (integer that ticks every QR_STEP_SECONDS). */
export function currentWindow(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / QR_STEP_SECONDS)
}

/** Seconds remaining before the code rotates to the next window. */
export function secondsUntilRotate(nowMs: number = Date.now()): number {
  const stepMs = QR_STEP_SECONDS * 1000
  return Math.ceil((stepMs - (nowMs % stepMs)) / 1000)
}

/** Derive the rotating code for a session + window (matches the SQL HMAC). */
export async function computeCode(
  secret: string,
  sessionId: string,
  windowIndex: number,
): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${sessionId}.${windowIndex}`))
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex.slice(0, 16)
}

/** The raw `CP1|…` core the HMAC covers — used inside the deep-link URL. */
export function buildCore(sessionId: string, windowIndex: number, code: string): string {
  return `${PREFIX}|${sessionId}|${windowIndex}|${code}`
}

/**
 * Encode the QR payload the student scans — now a deep-link URL so a phone's
 * NATIVE camera can offer "Open link" straight into the app's /scan route. The
 * raw code rides in the hash fragment (never sent to the server / logs, and
 * survives SPA routing). The in-app scanner still accepts the bare `CP1|…`
 * form too (see parsePayload), so old-format codes and both scanners work.
 */
export function buildPayload(sessionId: string, windowIndex: number, code: string): string {
  const core = buildCore(sessionId, windowIndex, code)
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://classpoint.app'
  return `${origin}/scan#${core}`
}

export interface ScannedPayload {
  sessionId: string
  windowIndex: number
  code: string
}

/**
 * Parse a scanned string back into its parts, or null if it isn't ours.
 * Accepts BOTH the new deep-link URL (`https://…/scan#CP1|…`) and the legacy
 * bare payload (`CP1|…`), so a rollback is just reverting buildPayload.
 */
export function parsePayload(text: string): ScannedPayload | null {
  let raw = text.trim()
  // Strip any `…/scan#` (or `…#`) prefix down to the `CP1|…` core.
  const hash = raw.lastIndexOf('#')
  if (hash !== -1) raw = raw.slice(hash + 1)
  const parts = raw.split('|')
  if (parts.length !== 4 || parts[0] !== PREFIX) return null
  const [, sessionId, win, code] = parts
  const windowIndex = Number(win)
  if (!sessionId || !Number.isFinite(windowIndex) || !code) return null
  return { sessionId, windowIndex, code }
}

/** Build the full, ready-to-render payload for a session's current window. */
export async function buildCurrentPayload(
  secret: string,
  sessionId: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const win = currentWindow(nowMs)
  const code = await computeCode(secret, sessionId, win)
  return buildPayload(sessionId, win, code)
}
