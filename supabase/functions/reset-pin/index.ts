// ClassPoint · Edge Function · reset-pin
// Verifies a one-time PIN reset code (issued by the instructor via
// reset_student_pin) and sets the student's new PIN, i.e. their auth password.
//
// Runs with the service role (auto-provided as SUPABASE_SERVICE_ROLE_KEY) so it
// can update the auth user across RLS. Never expose the service key to the client.
//
// ⚠ Like claim-token, this function must have JWT verification turned OFF in the
// Supabase dashboard — a student resetting a forgotten PIN is not logged in.
// That makes it public, so since 0026 it is rate limited per IP and every
// attempt is recorded in public.auth_events. See ../_shared/security.ts.
//
// Deploy: supabase functions deploy reset-pin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  clientIp,
  json,
  logAuthEvent,
  RATE_LIMIT_MESSAGE,
  corsHeaders,
  tooManyAttempts,
  userAgent,
} from '../_shared/security.ts'

// One message for "no such code" AND "expired" — distinct wording would confirm
// to someone guessing codes which of their guesses matched a real row.
const BAD_CODE = 'That reset code is not valid or has expired. Ask your instructor for a new one.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { ok: false, error: 'Method not allowed.' }, 405)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json(req, { ok: false, error: 'Invalid request.' }, 400)
  }

  const token = String(payload.token ?? '').trim().toUpperCase()
  const pin = String(payload.pin ?? '')

  // Shape checks first — these never reach the code lookup, so a student
  // fumbling their new PIN never counts against the rate limit.
  if (!token) return json(req, { ok: false, error: 'Enter your reset code.' })
  if (pin.length < 6) return json(req, { ok: false, error: 'PIN must be at least 6 characters.' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const ip = clientIp(req)
  const ua = userAgent(req)
  const log = (success: boolean, detail: string, studentId?: string | null) =>
    logAuthEvent(admin, { kind: 'pin_reset', success, ip, userAgent: ua, studentId, detail })

  // 0. Rate limit before touching a code, so guessing costs nothing to serve.
  if (await tooManyAttempts(admin, ip)) {
    await log(false, 'rate_limited')
    return json(req, { ok: false, error: RATE_LIMIT_MESSAGE }, 429)
  }

  // 1. Find the outstanding reset code.
  const { data: secret, error: secretErr } = await admin
    .from('student_secrets')
    .select('student_id, username, reset_expires_at')
    .eq('reset_token', token)
    .maybeSingle()
  if (secretErr) {
    await log(false, 'lookup_failed')
    return json(req, { ok: false, error: 'Lookup failed. Please try again.' }, 500)
  }
  if (!secret) {
    await log(false, 'token_not_found')
    return json(req, { ok: false, error: BAD_CODE })
  }
  if (!secret.reset_expires_at || new Date(secret.reset_expires_at as string) < new Date()) {
    await log(false, 'expired', secret.student_id as string)
    return json(req, { ok: false, error: BAD_CODE })
  }

  // 2. Locate the linked auth account. Both messages below are only reachable
  // AFTER a valid, unexpired code matched, so they leak nothing to a guesser.
  const { data: student, error: studentErr } = await admin
    .from('students')
    .select('user_id')
    .eq('id', secret.student_id)
    .maybeSingle()
  if (studentErr) {
    await log(false, 'lookup_failed', secret.student_id as string)
    return json(req, { ok: false, error: 'Lookup failed. Please try again.' }, 500)
  }
  const userId = student?.user_id as string | null | undefined
  if (!userId) {
    await log(false, 'not_claimed', secret.student_id as string)
    return json(req, { ok: false, error: 'This account is not set up yet. Ask your instructor.' })
  }

  // 3. Set the new PIN.
  const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password: pin })
  if (updErr) {
    await log(false, 'update_failed', secret.student_id as string)
    return json(req, { ok: false, error: 'Could not update your PIN. Please try again.' }, 500)
  }

  // 4. Burn the code so it can't be reused.
  await admin
    .from('student_secrets')
    .update({ reset_token: null, reset_expires_at: null })
    .eq('student_id', secret.student_id)

  await log(true, 'ok', secret.student_id as string)
  return json(req, { ok: true, username: secret.username })
})
