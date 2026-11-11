
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
  return navigator.serviceWorker.ready
}

async function pushConfigToSw(): Promise<void> {
  try {
    const reg = await getRegistration()
    reg?.active?.postMessage({
      type: 'cp-push-config',
      config: {
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
        anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        vapidKey: VAPID_PUBLIC_KEY,
      },
    })
  } catch {
    /* best-effort */
  }
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (!pushConfigured()) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await getRegistration()
  const existing = await reg?.pushManager.getSubscription()
  if (existing) return 'subscribed'
  return 'default'
}

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
  void pushConfigToSw()
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

export async function syncPushSubscription(studentId: string): Promise<void> {
  try {
    if (!pushSupported() || !pushConfigured()) return
    if (Notification.permission !== 'granted') return
    const reg = await getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await saveSubscription(studentId, sub)
      void pushConfigToSw()
    }
  } catch {
    /* best-effort — the toggle in Profile can always re-subscribe */
  }
}

export interface LocalNotice {
  title: string
  body?: string
  tag?: string
  url?: string
}

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
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}
