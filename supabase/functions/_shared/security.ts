
export const RATE_LIMIT = 30
export const RATE_WINDOW_MIN = 15

export const RATE_LIMIT_MESSAGE = 'Too many attempts. Please try again in a few minutes.'

// deno-lint-ignore no-explicit-any
export type AdminClient = { from: (table: string) => any }

export type AuthEventKind = 'claim' | 'pin_reset'

export interface AuthEvent {
  kind: AuthEventKind
  success: boolean
  ip: string | null
  userAgent: string | null
  studentId?: string | null
  detail: string
}

function parseOrigin(raw: string): string | null {
  const s = raw.trim().replace(/\/+$/, '')
  if (!s) return null
  if (/[<>\s]/.test(s)) return null
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.origin
  } catch {
    return null
  }
}

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map(parseOrigin)
  .filter((o): o is string => o !== null)

export function corsHeaders(req: Request): Record<string, string> {
  const origin = parseOrigin(req.headers.get('origin') ?? '') ?? ''
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

export function clientIp(req: Request): string | null {
  const first = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim()
  return first || null
}

export function userAgent(req: Request): string | null {
  return req.headers.get('user-agent')?.slice(0, 300) ?? null
}

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
    return false
  }
  return (count ?? 0) >= RATE_LIMIT
}

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
