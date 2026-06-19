// ClassPoint · Edge Function · claim-token
// Verifies a one-time claim token, creates the student's auth account
// (synthetic email + PIN), and links it to their roster row.
//
// Runs with the service role (auto-provided as SUPABASE_SERVICE_ROLE_KEY),
// so it can write across RLS. Never expose the service key to the client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STUDENT_DOMAIN = 'students.classpoint.app'
const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid request.' }, 400)
  }

  const token = String(payload.token ?? '').trim().toUpperCase()
  const username = String(payload.username ?? '').trim().toLowerCase()
  const pin = String(payload.pin ?? '')
  const displayName = payload.display_name ? String(payload.display_name).trim() : null

  if (!token) return json({ ok: false, error: 'Enter your token.' })
  if (!USERNAME_RE.test(username)) {
    return json({
      ok: false,
      error:
        'Username must be 3–20 characters: lowercase letters, numbers, or underscores, starting with a letter.',
    })
  }
  if (pin.length < 6) return json({ ok: false, error: 'PIN must be at least 6 characters.' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1. Find an unclaimed token.
  const { data: secret, error: secretErr } = await admin
    .from('student_secrets')
    .select('student_id, claimed_at')
    .eq('claim_token', token)
    .maybeSingle()
  if (secretErr) return json({ ok: false, error: 'Lookup failed. Please try again.' }, 500)
  if (!secret) return json({ ok: false, error: 'That token is not valid.' })
  if (secret.claimed_at) return json({ ok: false, error: 'This token has already been used.' })

  // 2. Check username availability (the unique index is the real guard).
  const { data: taken } = await admin
    .from('student_secrets')
    .select('student_id')
    .eq('username', username)
    .maybeSingle()
  if (taken) return json({ ok: false, error: 'That username is taken. Pick another.' })

  // 3. Create the auth account.
  const email = `${username}@${STUDENT_DOMAIN}`
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { role: 'student', student_id: secret.student_id, username },
  })
  if (createErr || !created?.user) {
    const taken = createErr?.message?.toLowerCase().includes('already')
    return json({
      ok: false,
      error: taken ? 'That username is taken. Pick another.' : 'Could not create your account.',
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
    return json({ ok: false, error: 'Could not finish setup. Please try again.' }, 500)
  }

  return json({ ok: true, email, username })
})
