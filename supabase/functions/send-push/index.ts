
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface NotificationRow {
  id: string
  student_id: string
  type: string
  title: string
  body: string
  url: string
  read_at: string | null
  attempts: number
}

interface SubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
  student_id: string
  fail_count: number
}

const TAG_BY_TYPE: Record<string, string> = {
  point: 'cp-points',
  deduct: 'cp-points',
  level: 'cp-level',
  rank: 'cp-rank',
  achievement: 'cp-achievement',
  redemption: 'cp-redemption',
  attendance_penalty: 'cp-penalty',
  test: 'cp-test',
}

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@classpoint.app'

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function bearerRole(bearer: string): string | null {
  try {
    const segment = bearer.split('.')[1]
    if (!segment) return null
    const b64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const claims = JSON.parse(atob(padded)) as { role?: unknown }
    return typeof claims.role === 'string' ? claims.role : null
  } catch {
    return null
  }
}

function isServiceCaller(req: Request): boolean {
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!bearer) return false
  if (SERVICE_KEY && bearer === SERVICE_KEY) return true
  return bearerRole(bearer) === 'service_role'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405)
  if (!isServiceCaller(req)) {
    console.error('[send-push] rejected a caller without the service role.')
    return json({ ok: false, error: 'Forbidden.' }, 403)
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.error(
      '[send-push] VAPID keys not configured — set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY secrets.',
    )
    return json({ ok: false, error: 'VAPID keys not configured.' }, 500)
  }

  let ids: string[]
  try {
    const body = (await req.json()) as { notification_ids?: unknown }
    ids = Array.isArray(body.notification_ids)
      ? body.notification_ids.filter((v): v is string => typeof v === 'string')
      : []
  } catch {
    return json({ ok: false, error: 'Invalid JSON.' }, 400)
  }
  if (ids.length === 0) return json({ ok: false, error: 'No notification_ids.' }, 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: rows, error: rowsError } = await admin
    .from('notifications')
    .select('id, student_id, type, title, body, url, read_at, attempts')
    .in('id', ids)
  if (rowsError) {
    console.error('[send-push] outbox lookup failed:', rowsError.message)
    return json({ ok: false, error: 'Lookup failed.' }, 500)
  }
  const notifications = (rows ?? []) as NotificationRow[]
  if (notifications.length === 0) return json({ ok: true, sent: 0 })

  const studentIds = [...new Set(notifications.map((n) => n.student_id))]
  const { data: subRows, error: subsError } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, student_id, fail_count')
    .in('student_id', studentIds)
  if (subsError) {
    console.error('[send-push] subscription lookup failed:', subsError.message)
    return json({ ok: false, error: 'Lookup failed.' }, 500)
  }
  const subsByStudent = new Map<string, SubscriptionRow[]>()
  for (const sub of (subRows ?? []) as SubscriptionRow[]) {
    const list = subsByStudent.get(sub.student_id) ?? []
    list.push(sub)
    subsByStudent.set(sub.student_id, list)
  }

  const now = new Date().toISOString()
  let sent = 0
  let failed = 0
  let skipped = 0
  const endpointOutcome = new Map<string, 'ok' | 'fail' | 'prune'>()

  for (const note of notifications) {
    // Seen in-app already — don't buzz the lock screen late.
    if (note.read_at) {
      skipped++
      await admin
        .from('notifications')
        .update({ push_status: 'skipped', last_attempt_at: now })
        .eq('id', note.id)
      continue
    }

    const subs = subsByStudent.get(note.student_id) ?? []
    if (subs.length === 0) {
      skipped++
      await admin
        .from('notifications')
        .update({ push_status: 'skipped', last_attempt_at: now })
        .eq('id', note.id)
      continue
    }

    const payload = JSON.stringify({
      title: note.title,
      body: note.body,
      tag: TAG_BY_TYPE[note.type] ?? 'classpoint',
      url: note.url || '/app',
    })

    let delivered = 0
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86400, urgency: 'high' },
        )
        delivered++
        endpointOutcome.set(sub.endpoint, 'ok')
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // The browser dropped this subscription — prune it.
          endpointOutcome.set(sub.endpoint, 'prune')
        } else {
          console.error(
            `[send-push] delivery failed (status ${status ?? '?'}):`,
            (err as Error).message,
          )
          if (endpointOutcome.get(sub.endpoint) !== 'ok') {
            endpointOutcome.set(sub.endpoint, 'fail')
          }
        }
      }
    }

    if (delivered > 0) sent++
    else failed++
    await admin
      .from('notifications')
      .update({
        push_status: delivered > 0 ? 'sent' : 'failed',
        attempts: note.attempts + 1,
        last_attempt_at: now,
      })
      .eq('id', note.id)
  }

  // Subscription health bookkeeping.
  const toPrune: string[] = []
  for (const [endpoint, outcome] of endpointOutcome) {
    if (outcome === 'prune') {
      toPrune.push(endpoint)
    } else if (outcome === 'ok') {
      await admin
        .from('push_subscriptions')
        .update({ last_seen_at: now, fail_count: 0 })
        .eq('endpoint', endpoint)
    } else {
      const current = (subRows ?? []).find((s) => s.endpoint === endpoint)
      const nextFails = ((current as SubscriptionRow | undefined)?.fail_count ?? 0) + 1
      if (nextFails >= 10) {
        toPrune.push(endpoint)
      } else {
        await admin
          .from('push_subscriptions')
          .update({ fail_count: nextFails })
          .eq('endpoint', endpoint)
      }
    }
  }
  if (toPrune.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', toPrune)
  }

  console.log(
    `[send-push] rows ${notifications.length}: sent ${sent}, failed ${failed}, skipped ${skipped}, pruned ${toPrune.length}`,
  )
  return json({ ok: true, sent, failed, skipped, pruned: toPrune.length })
})
