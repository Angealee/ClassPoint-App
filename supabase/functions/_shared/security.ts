// ClassPoint · Edge Functions · shared security helpers (migration 0026)
//
// Used by the two PUBLIC functions — claim-token and reset-pin. Both run with
// JWT verification turned OFF by design (a student claiming an account or
// resetting a forgotten PIN is not signed in yet), which makes them the app's
// only unauthenticated surface. These helpers give them the three things they
// were missing:
//
//   • CORS      — echo the caller's Origin only when it's allowlisted, instead
//                 of the blanket '*' that let any website POST here from a
//                 student's browser.
//   • Rate limit — count recent FAILURES per IP in public.auth_events.
//   • Audit      — record every attempt so a brute-force run is visible after
//                 the fact instead of leaving no trace at all.
//
// Everything here fails OPEN on infrastructure errors. A logging insert that
// fails, or a counter query that errors, must never stop a legitimate student
// from claiming their account — the security win isn't worth locking a class
// out of the app.

/**
 * Failed attempts allowed per IP inside RATE_WINDOW_MIN before a hard 429.
 *
 * Deliberately generous: a whole classroom shares ONE public IP behind school
 * Wi-Fi NAT, so a strict limit would lock out 40 students the moment a handful
 * mistype their tokens. Brute force is already hopeless against the 64-bit
 * tokens 0026 generates (2^64 guesses), so this is defence in depth against
 * abuse and resource exhaustion, not the primary wall.
 */
export const RATE_LIMIT = 30
export const RATE_WINDOW_MIN = 15

export const RATE_LIMIT_MESSAGE = 'Too many attempts. Please try again in a few minutes.'

/**
 * Minimal shape of the service-role client these helpers need. Typed loosely on
 * purpose — the full SupabaseClient generic buys nothing here and would couple
 * this file to the esm.sh type resolution.
 */
// deno-lint-ignore no-explicit-any
export type AdminClient = { from: (table: string) => any }

export type AuthEventKind = 'claim' | 'pin_reset'

export interface AuthEvent {
  kind: AuthEventKind
  success: boolean
  ip: string | null
  userAgent: string | null
  studentId?: string | null
  /** Coarse machine-readable reason: 'ok', 'token_not_found', 'expired', … */
  detail: string
}

/**
 * Allowlisted browser origins, from the ALLOWED_ORIGINS function secret
 * (comma-separated). FAIL-SAFE: when unset we fall back to '*', i.e. exactly
 * the behaviour before 0026 — a missing secret can never take the app down.
 */
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean)

export function corsHeaders(req: Request): Record<string, string> {
  const origin = (req.headers.get('origin') ?? '').replace(/\/+$/, '')
  // With no allowlist configured, stay permissive. With one configured, echo
  // the origin when it matches; otherwise answer with the first allowed origin
  // so the browser itself blocks the response for everyone else.
  const allow =
    ALLOWED_ORIGINS.length === 0
      ? '*'
      : ALLOWED_ORIGINS.includes(origin)
        ? origin
        : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

/** First hop of x-forwarded-for — the caller as the edge sees them. */
export function clientIp(req: Request): string | null {
  const first = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim()
  return first || null
}

export function userAgent(req: Request): string | null {
  return req.headers.get('user-agent')?.slice(0, 300) ?? null
}

/**
 * True when this IP has burned through RATE_LIMIT failures in the window.
 *
 * Rows logged as 'rate_limited' are excluded from the count on purpose: if
 * blocked attempts fed the counter, a classroom that tripped the limit by
 * accident would keep extending its own lockout by retrying. The window drains
 * 15 minutes after the last GENUINE attempt.
 */
export async function tooManyAttempts(admin: AdminClient, ip: string | null): Promise<boolean> {
  if (!ip) return false
  const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString()
  const { count, error } = await admin
    .from('auth_events')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('success', false)
    .neq('detail', 'rate_limited')
    .gte('at', since)

  if (error) {
    console.error('[auth] rate-limit lookup failed:', error.message)
    return false // fail open — never lock students out over a counter error
  }
  return (count ?? 0) >= RATE_LIMIT
}

/** Record one attempt. Never throws: the audit trail must not break the flow. */
export async function logAuthEvent(admin: AdminClient, event: AuthEvent): Promise<void> {
  const { error } = await admin.from('auth_events').insert({
    kind: event.kind,
    success: event.success,
    ip: event.ip,
    user_agent: event.userAgent,
    student_id: event.studentId ?? null,
    detail: event.detail,
  })
  if (error) console.error('[auth_events] insert failed:', error.message)
}
