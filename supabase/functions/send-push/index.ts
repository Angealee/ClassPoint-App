// ClassPoint · Edge Function · send-push
// Delivers Web Push notifications to a student's registered devices.
//
// Invoked by Postgres (pg_net) from the triggers in migration 0008 with a JSON
// body describing the event. Looks up the student's push_subscriptions with the
// service role and signs each push with the project's VAPID keys.
//
// ── One-time setup ──────────────────────────────────────────────────────────
//  1. Generate a VAPID key pair (run anywhere with Node):
//       npx web-push generate-vapid-keys
//     Put the PUBLIC key in the web app's .env as VITE_VAPID_PUBLIC_KEY.
//  2. Set this function's secrets (Dashboard → Edge Functions → Secrets, or CLI):
//       supabase secrets set VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=...  \
//                            VAPID_SUBJECT=mailto:you@school.edu
//  3. Deploy:
//       supabase functions deploy send-push
//     It's called server-to-server with the service-role JWT, so leave JWT
//     verification ON (the default).
//  4. Configure the DB settings from migration 0008 (edge_url + service_key).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

type EventBody =
  | { type: 'point' | 'deduct'; student_id: string; points: number; note?: string | null; level?: number | null }
  | { type: 'rank'; student_id: string; rank: number; prev_rank?: number | null }

interface Notification {
  title: string
  body: string
  tag: string
  url: string
  icon?: string
}

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@classpoint.app'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Turn a DB event into one or more notifications to fan out. */
function buildNotifications(ev: EventBody): Notification[] {
  const url = '/app'
  if (ev.type === 'rank') {
    const improved = ev.prev_rank != null && ev.rank < ev.prev_rank
    return [
      {
        title: improved ? `You climbed to #${ev.rank}! 📈` : `Leaderboard update`,
        body: improved ? 'Nice — you moved up the ranks.' : `Your rank is now #${ev.rank}.`,
        tag: 'cp-rank',
        url,
      },
    ]
  }

  const notes: Notification[] = []
  if (ev.type === 'point') {
    notes.push({
      title: `+${ev.points} points 🎉`,
      body: ev.note?.trim() || 'Nice work — keep it up!',
      tag: 'cp-points',
      url,
    })
  } else {
    notes.push({
      title: `${ev.points} points`,
      body: ev.note?.trim() || 'Some points were deducted.',
      tag: 'cp-points',
      url,
    })
  }
  if (ev.level != null) {
    notes.push({
      title: `Level ${ev.level}! ⭐`,
      body: 'You leveled up — well done!',
      tag: 'cp-level',
      url,
    })
  }
  return notes
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405)
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return json({ ok: false, error: 'VAPID keys not configured.' }, 500)
  }

  let ev: EventBody
  try {
    ev = (await req.json()) as EventBody
  } catch {
    return json({ ok: false, error: 'Invalid JSON.' }, 400)
  }
  if (!ev?.student_id || !ev?.type) return json({ ok: false, error: 'Missing fields.' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('student_id', ev.student_id)
  if (error) return json({ ok: false, error: 'Lookup failed.' }, 500)
  if (!subs?.length) return json({ ok: true, sent: 0 })

  const notifications = buildNotifications(ev)
  let sent = 0
  const stale: string[] = []

  for (const sub of subs) {
    const subscription = {
      endpoint: sub.endpoint as string,
      keys: { p256dh: sub.p256dh as string, auth: sub.auth as string },
    }
    for (const note of notifications) {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(note))
        sent++
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        // 404/410 mean the browser dropped the subscription — prune it.
        if (status === 404 || status === 410) stale.push(sub.endpoint as string)
      }
    }
  }

  if (stale.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', stale)
  }

  return json({ ok: true, sent, pruned: stale.length })
})
