// ClassPoint · Edge Function · claim-token
// Verifies a one-time claim token, creates the student's auth account
// (synthetic email + PIN), and links it to their roster row.
//
// Runs with the service role (auto-provided as SUPABASE_SERVICE_ROLE_KEY),
// so it can write across RLS. Never expose the service key to the client.
//
// ⚠ This function must have JWT verification turned OFF in the Supabase
// dashboard — a student claiming their account is not logged in yet. That makes
// it public, so since 0026 it is rate limited per IP and every attempt is
// recorded in public.auth_events. See supabase/functions/_shared/security.ts.
//
// Deploy: supabase functions deploy claim-token

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

const STUDENT_DOMAIN = 'students.classpoint.app'
const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/

// One message for "no such token" AND "already claimed". Distinct wording would
// tell someone guessing tokens which of their guesses hit a real row.
const BAD_TOKEN = 'That token is not valid or has already been used.'

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
  const username = String(payload.username ?? '').trim().toLowerCase()
  const pin = String(payload.pin ?? '')
  const displayName = payload.display_name ? String(payload.display_name).trim() : null

  // Shape checks first — a mistyped username is a typo, not an attack, so these
  // never reach the token lookup and never count against the rate limit.
  if (!token) return json(req, { ok: false, error: 'Enter your token.' })
  if (!USERNAME_RE.test(username)) {
    return json(req, {
      ok: false,
      error:
        'Username must be 3–20 characters: lowercase letters, numbers, or underscores, starting with a letter.',
    })
  }
  if (pin.length < 6) return json(req, { ok: false, error: 'PIN must be at least 6 characters.' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const ip = clientIp(req)
  const ua = userAgent(req)
  const log = (success: boolean, detail: string, studentId?: string | null) =>
    logAuthEvent(admin, { kind: 'claim', success, ip, userAgent: ua, studentId, detail })

  // 0. Rate limit before touching a token, so guessing costs nothing to serve.
  if (await tooManyAttempts(admin, ip)) {
    await log(false, 'rate_limited')
    return json(req, { ok: false, error: RATE_LIMIT_MESSAGE }, 429)
  }

  // 1. Find an unclaimed token.
  const { data: secret, error: secretErr } = await admin
    .from('student_secrets')
    .select('student_id, claimed_at')
    .eq('claim_token', token)
    .maybeSingle()
  if (secretErr) {
    await log(false, 'lookup_failed')
    return json(req, { ok: false, error: 'Lookup failed. Please try again.' }, 500)
  }
  if (!secret) {
    await log(false, 'token_not_found')
    return json(req, { ok: false, error: BAD_TOKEN })
  }
  if (secret.claimed_at) {
    await log(false, 'token_used', secret.student_id as string)
    return json(req, { ok: false, error: BAD_TOKEN })
  }

  // 1b. An archived roster row can't be claimed — prevents a "ghost" account
  // that could sign in while invisible everywhere. Restore first, then claim.
  // This message stays specific on purpose: it is only reachable AFTER a valid,
  // unclaimed token matched, so it tells an attacker nothing — and it tells a
  // real student exactly what to do.
  const { data: studentRow, error: studentErr } = await admin
    .from('students')
    .select('archived_at')
    .eq('id', secret.student_id)
    .maybeSingle()
  if (studentErr || !studentRow) {
    await log(false, 'lookup_failed', secret.student_id as string)
    return json(req, { ok: false, error: 'Lookup failed. Please try again.' }, 500)
  }
  if (studentRow.archived_at) {
    await log(false, 'archived', secret.student_id as string)
    return json(req, {
      ok: false,
      error: 'This account has been archived — talk to your instructor.',
    })
  }

  // 2. Check username availability (the unique index is the real guard).
  const { data: taken } = await admin
    .from('student_secrets')
    .select('student_id')
    .eq('username', username)
    .maybeSingle()
  if (taken) {
    await log(false, 'username_taken', secret.student_id as string)
    return json(req, { ok: false, error: 'That username is taken. Pick another.' })
  }

  // 3. Create the auth account.
  const email = `${username}@${STUDENT_DOMAIN}`
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { role: 'student', student_id: secret.student_id, username },
  })
  if (createErr || !created?.user) {
    const nameTaken = createErr?.message?.toLowerCase().includes('already')
    await log(false, nameTaken ? 'username_taken' : 'create_failed', secret.student_id as string)
    return json(req, {
      ok: false,
      error: nameTaken ? 'That username is taken. Pick another.' : 'Could not create your account.',
    })
  }
  const userId = created.user.id

  // 4. Link the account + mark the token claimed.
  const linkStudent = await admin
    .from('students')
    .update({ user_id: userId, ...(displayName ? { display_name: displayName } : {}) })
    .eq('id', secret.student_id)

  const linkSecret = await admin
    .from('student_secrets')
    .update({ username, claimed_at: new Date().toISOString() })
    .eq('student_id', secret.student_id)

  if (linkStudent.error || linkSecret.error) {
    // Roll back the orphaned auth user so the student can retry.
    await admin.auth.admin.deleteUser(userId)
    await log(false, 'link_failed', secret.student_id as string)
    return json(req, { ok: false, error: 'Could not finish setup. Please try again.' }, 500)
  }

  await log(true, 'ok', secret.student_id as string)
  return json(req, { ok: true, email, username })
})
