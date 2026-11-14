
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
  // Written through the service role, so the students guard never sees it —
  // validate here with the same 2–40 rule the profile editor enforces.
  const rawName = payload.display_name
    ? String(payload.display_name).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    : ''
  const displayName = rawName || null

  if (!token) return json(req, { ok: false, error: 'Enter your token.' })
  if (!USERNAME_RE.test(username)) {
    return json(req, {
      ok: false,
      error:
        'Username must be 3–20 characters: lowercase letters, numbers, or underscores, starting with a letter.',
    })
  }
  if (pin.length < 6) return json(req, { ok: false, error: 'PIN must be at least 6 characters.' })
  if (pin.length > 72) return json(req, { ok: false, error: 'PIN must be at most 72 characters.' })
  if (displayName && (displayName.length < 2 || displayName.length > 40)) {
    return json(req, { ok: false, error: 'Display name must be 2–40 characters.' })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const ip = clientIp(req)
  const ua = userAgent(req)
  const log = (success: boolean, detail: string, studentId?: string | null) =>
    logAuthEvent(admin, { kind: 'claim', success, ip, userAgent: ua, studentId, detail })

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
      error: 'This account has been archived, talk to your instructor.',
    })
  }

  const { data: taken } = await admin
    .from('student_secrets')
    .select('student_id')
    .eq('username', username)
    .maybeSingle()
  if (taken) {
    await log(false, 'username_taken', secret.student_id as string)
    return json(req, { ok: false, error: 'That username is taken. Pick another.' })
  }

  // 2b. Reserve the token ATOMICALLY. Two concurrent claims of one token both
  // passed the claimed_at check above; without this conditional update both
  // would create an auth user and the second would silently overwrite the
  // first's link. Only the request whose update matched a still-unclaimed row
  // continues; the reservation is released on every failure path below.
  const { data: reserved, error: reserveErr } = await admin
    .from('student_secrets')
    .update({ claimed_at: new Date().toISOString() })
    .eq('student_id', secret.student_id)
    .is('claimed_at', null)
    .select('student_id')
  if (reserveErr) {
    await log(false, 'lookup_failed', secret.student_id as string)
    return json(req, { ok: false, error: 'Lookup failed. Please try again.' }, 500)
  }
  if (!reserved || reserved.length === 0) {
    await log(false, 'token_used', secret.student_id as string)
    return json(req, { ok: false, error: BAD_TOKEN })
  }
  const release = () =>
    admin.from('student_secrets').update({ claimed_at: null }).eq('student_id', secret.student_id)

  // 3. Create the auth account.
  const email = `${username}@${STUDENT_DOMAIN}`
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { role: 'student', student_id: secret.student_id, username },
  })
  if (createErr || !created?.user) {
    await release()
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
    .update({ username })
    .eq('student_id', secret.student_id)

  if (linkStudent.error || linkSecret.error) {
    // Roll back the orphaned auth user so the student can retry.
    await admin.auth.admin.deleteUser(userId)
    await admin.from('students').update({ user_id: null }).eq('id', secret.student_id).eq('user_id', userId)
    await release()
    await log(false, 'link_failed', secret.student_id as string)
    return json(req, { ok: false, error: 'Could not finish setup. Please try again.' }, 500)
  }

  await log(true, 'ok', secret.student_id as string)
  return json(req, { ok: true, email, username })
})
