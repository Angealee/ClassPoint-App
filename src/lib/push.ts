/**
 * ClassPoint · Web Push (mobile/background notifications).
 *
 * This is the *delivered-while-the-app-is-closed* path. The in-app toast+sound
 * (see lib/sound.ts + StudentData.tsx) handles the foreground; Web Push handles
 * the lock screen.
 *
 * Flow:
 *  1. The PWA service worker (vite-plugin-pwa) handles `push` events via the
 *     imported `public/push-sw.js`.
 *  2. The browser subscribes with our VAPID *public* key.
 *  3. We persist the subscription in Supabase (`push_subscriptions`).
 *  4. A Supabase Edge Function (`send-push`) signs + delivers pushes with the
 *     matching VAPID *private* key when a point event / level-up / rank change
 *     happens.
 *
 * Platform notes:
 *  - iOS/iPadOS only deliver Web Push to PWAs **installed to the Home Screen**
 *    (iOS 16.4+). It never works in a regular Safari tab.
 *  - Everything degrades gracefully: if push isn't supported/permitted, the
 *    in-app notifications still work.
 */

import { supabase } from '@/lib/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushState =
  | 'unsupported' // browser/device can't do Web Push
  | 'unconfigured' // app has no VAPID key set
  | 'default' // supported, not yet asked
  | 'denied' // user blocked notifications
  | 'subscribed' // active push subscription on this device

/** Is the Push API usable on this device/browser at all? */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function pushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY)
}

/** VAPID keys are base64url; the browser wants an ArrayBuffer-backed view. */
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const buf = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  // vite-plugin-pwa registers the SW; ready resolves once it's controlling.
  return navigator.serviceWorker.ready
}

/** Current push state for this device (used to render the toggle). */
export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (!pushConfigured()) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await getRegistration()
  const existing = await reg?.pushManager.getSubscription()
  if (existing) return 'subscribed'
  return 'default'
}

/**
 * Ask permission (if needed), subscribe, and persist the subscription against
 * the given student. Returns the resulting state or throws with a message.
 */
export async function enablePush(studentId: string): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'unconfigured'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default'

  const reg = await getRegistration()
  if (!reg) return 'unsupported'

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  await saveSubscription(studentId, sub)
  return 'subscribed'
}

/** Remove the subscription from the browser and from Supabase. */
export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  const reg = await getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    const endpoint = sub.endpoint
    await sub.unsubscribe().catch(() => {})
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  }
  return pushConfigured() ? 'default' : 'unconfigured'
}

/**
 * If this browser already has a push subscription, make sure Supabase has the
 * current keys (heals rotated subscriptions or a missing DB row after a
 * reinstall). Safe no-op when push isn't supported/configured/permitted.
 *
 * Call this on app start so a returning student stays reachable without having
 * to toggle push off and on again.
 */
export async function syncPushSubscription(studentId: string): Promise<void> {
  try {
    if (!pushSupported() || !pushConfigured()) return
    if (Notification.permission !== 'granted') return
    const reg = await getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await saveSubscription(studentId, sub)
  } catch {
    /* best-effort — the toggle in Profile can always re-subscribe */
  }
}

export interface LocalNotice {
  title: string
  body?: string
  /** Collapses with same-tag notifications (incl. the server push). */
  tag?: string
  url?: string
}

/**
 * Show a *system* notification from the page itself. Used when the app is open
 * but backgrounded/unfocused (document hidden) so the student still sees a
 * pop-up. No-ops unless notifications are permitted and a service worker is
 * controlling the page. Uses the same tags as the server push (see
 * supabase/functions/send-push) so the two never stack into duplicates.
 *
 * NOTE: this only fires while the page's JS is still alive. Once the OS fully
 * suspends/kills the app, only real Web Push (the edge function) can reach the
 * device — that's the "app completely closed" path.
 */
export async function showLocalNotification(n: LocalNotice): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  if (!('serviceWorker' in navigator)) return false
  try {
    // Don't hang forever if the SW isn't ready yet.
    const reg = await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
    ])
    if (!reg) return false
    await reg.showNotification(n.title, {
      body: n.body ?? '',
      tag: n.tag ?? 'classpoint',
      // renotify needs a tag; surfaces a repeat even when one is already shown.
      renotify: true,
      icon: '/app-logo.svg',
      badge: '/icon.svg',
      data: { url: n.url ?? '/app' },
    } as NotificationOptions)
    return true
  } catch {
    return false
  }
}

/** Upsert the browser subscription into Supabase (keyed by endpoint). */
async function saveSubscription(studentId: string, sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  const keys = json.keys ?? {}
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      student_id: studentId,
      endpoint: sub.endpoint,
      p256dh: keys.p256dh ?? '',
      auth: keys.auth ?? '',
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}
