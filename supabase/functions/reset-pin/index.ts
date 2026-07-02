// ClassPoint · Edge Function · reset-pin
// Verifies a one-time PIN reset code (issued by the instructor via
// reset_student_pin) and sets the student's new PIN, i.e. their auth password.
//
// Runs with the service role (auto-provided as SUPABASE_SERVICE_ROLE_KEY) so it
// can update the auth user across RLS. Never expose the service key to the client.
//
// ⚠ Like claim-token, this function must have JWT verification turned OFF in the
// Supabase dashboard — a student resetting a forgotten PIN is not logged in.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  const pin = String(payload.pin ?? '')

  if (!token) return json({ ok: false, error: 'Enter your reset code.' })
  if (pin.length < 6) return json({ ok: false, error: 'PIN must be at least 6 characters.' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 1. Find the outstanding reset code.
  const { data: secret, error: secretErr } = await admin
    .from('student_secrets')
    .select('student_id, username, reset_expires_at')
    .eq('reset_token', token)
    .maybeSingle()
  if (secretErr) return json({ ok: false, error: 'Lookup failed. Please try again.' }, 500)
  if (!secret) return json({ ok: false, error: 'That reset code is not valid.' })
  if (!secret.reset_expires_at || new Date(secret.reset_expires_at as string) < new Date()) {
    return json({ ok: false, error: 'That reset code has expired. Ask your instructor for a new one.' })
  }

  // 2. Locate the linked auth account.
  const { data: student, error: studentErr } = await admin
    .from('students')
    .select('user_id')
    .eq('id', secret.student_id)
    .maybeSingle()
  if (studentErr) return json({ ok: false, error: 'Lookup failed. Please try again.' }, 500)
  const userId = student?.user_id as string | null | undefined
  if (!userId) {
    return json({ ok: false, error: 'This account is not set up yet. Ask your instructor.' })
  }

  // 3. Set the new PIN.
  const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password: pin })
  if (updErr) return json({ ok: false, error: 'Could not update your PIN. Please try again.' }, 500)

  // 4. Burn the code so it can't be reused.
  await admin
    .from('student_secrets')
    .update({ reset_token: null, reset_expires_at: null })
    .eq('student_id', secret.student_id)

  return json({ ok: true, username: secret.username })
})
