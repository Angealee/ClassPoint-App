
export const QR_STEP_SECONDS = 15

const PREFIX = 'CP1'

export function currentWindow(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / QR_STEP_SECONDS)
}

export function secondsUntilRotate(nowMs: number = Date.now()): number {
  const stepMs = QR_STEP_SECONDS * 1000
  return Math.ceil((stepMs - (nowMs % stepMs)) / 1000)
}

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

export function buildCore(sessionId: string, windowIndex: number, code: string): string {
  return `${PREFIX}|${sessionId}|${windowIndex}|${code}`
}

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

export function parsePayload(text: string): ScannedPayload | null {
  let raw = text.trim()
  const hash = raw.lastIndexOf('#')
  if (hash !== -1) raw = raw.slice(hash + 1)
  const parts = raw.split('|')
  if (parts.length !== 4 || parts[0] !== PREFIX) return null
  const [, sessionId, win, code] = parts
  const windowIndex = Number(win)
  if (!sessionId || !Number.isFinite(windowIndex) || !code) return null
  return { sessionId, windowIndex, code }
}

export async function buildCurrentPayload(
  secret: string,
  sessionId: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const win = currentWindow(nowMs)
  const code = await computeCode(secret, sessionId, win)
  return buildPayload(sessionId, win, code)
}

const EVENT_PREFIX = 'CP1E'

export interface ScannedEventPayload {
  eventId: string
  windowIndex: number
  code: string
}

export function buildEventCore(eventId: string, windowIndex: number, code: string): string {
  return `${EVENT_PREFIX}|${eventId}|${windowIndex}|${code}`
}

export function buildEventPayload(eventId: string, windowIndex: number, code: string): string {
  const core = buildEventCore(eventId, windowIndex, code)
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://classpoint.app'
  return `${origin}/scan#${core}`
}

export function parseEventPayload(text: string): ScannedEventPayload | null {
  let raw = text.trim()
  const hash = raw.lastIndexOf('#')
  if (hash !== -1) raw = raw.slice(hash + 1)
  const parts = raw.split('|')
  if (parts.length !== 4 || parts[0] !== EVENT_PREFIX) return null
  const [, eventId, win, code] = parts
  const windowIndex = Number(win)
  if (!eventId || !Number.isFinite(windowIndex) || !code) return null
  return { eventId, windowIndex, code }
}

/** The event's ready-to-render payload for the current window. */
export async function buildCurrentEventPayload(
  secret: string,
  eventId: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const win = currentWindow(nowMs)
  const code = await computeCode(secret, eventId, win)
  return buildEventPayload(eventId, win, code)
}
