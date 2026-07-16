/* ClassPoint · service-worker push handlers. (v2 — outbox + self-healing)
 *
 * vite-plugin-pwa generates the main service worker (Workbox) and imports this
 * file via `workbox.importScripts` (see vite.config.ts). Keep it dependency-free
 * and plain JS — it runs in the SW global scope, not the app bundle.
 *
 * The Edge Function `send-push` delivers a JSON payload shaped like:
 *   { title, body, tag, url, icon }
 *
 * `pushsubscriptionchange` self-healing: the page posts the Supabase config to
 * this worker (see lib/push.ts), stored in IndexedDB because this event fires
 * with no page and no Supabase session. When the browser rotates the push
 * subscription we re-subscribe and swap the endpoint server-side via the
 * `replace_push_subscription` RPC — the old (unguessable) endpoint URL is the
 * credential.
 */

// Distinct buzz per event type, mirroring the in-app haptics (lib/haptics.ts).
const VIBRATION_BY_TAG = {
  'cp-points': [60],
  'cp-level': [50, 40, 90],
  'cp-rank': [30, 30, 30],
  'cp-achievement': [50, 40, 90],
  'cp-redemption': [60, 40, 60],
  'cp-penalty': [80, 40, 80],
  'cp-test': [40],
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (_e) {
    data = { title: 'ClassPoint', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'ClassPoint'
  const tag = data.tag || 'classpoint'
  const options = {
    body: data.body || '',
    icon: data.icon || '/app-logo.svg',
    badge: '/icon.svg',
    tag,
    renotify: true,
    data: { url: data.url || '/app' },
    vibrate: VIBRATION_BY_TAG[tag] || [80, 40, 80],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/app'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab if one is open, otherwise open a new one.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target).catch(() => {})
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
      return undefined
    }),
  )
})

/* ── Self-healing subscription plumbing ──────────────────────────────────── */

const CONFIG_DB = 'cp-push-config'
const CONFIG_STORE = 'kv'

function openConfigDb() {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(CONFIG_DB, 1)
      open.onupgradeneeded = () => open.result.createObjectStore(CONFIG_STORE)
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => resolve(null)
    } catch (_e) {
      resolve(null)
    }
  })
}

function readConfig() {
  return openConfigDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(null)
        try {
          const get = db.transaction(CONFIG_STORE, 'readonly').objectStore(CONFIG_STORE).get('config')
          get.onsuccess = () => resolve(get.result || null)
          get.onerror = () => resolve(null)
        } catch (_e) {
          resolve(null)
        }
      }),
  )
}

function writeConfig(config) {
  return openConfigDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(false)
        try {
          const tx = db.transaction(CONFIG_STORE, 'readwrite')
          tx.objectStore(CONFIG_STORE).put(config, 'config')
          tx.oncomplete = () => resolve(true)
          tx.onerror = () => resolve(false)
        } catch (_e) {
          resolve(false)
        }
      }),
  )
}

// VAPID keys are base64url; the browser wants an ArrayBuffer-backed view.
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// The page keeps this worker supplied with the config it needs offline.
self.addEventListener('message', (event) => {
  const msg = event.data
  if (msg && msg.type === 'cp-push-config' && msg.config) {
    event.waitUntil ? event.waitUntil(writeConfig(msg.config)) : writeConfig(msg.config)
  }
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const cfg = await readConfig()
      if (!cfg || !cfg.supabaseUrl || !cfg.anonKey || !cfg.vapidKey) return
      const oldEndpoint =
        (event.oldSubscription && event.oldSubscription.endpoint) || null
      if (!oldEndpoint) return // nothing to swap against; the page re-syncs on next open

      const sub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.vapidKey),
      })
      const json = sub.toJSON()
      await fetch(cfg.supabaseUrl + '/rest/v1/rpc/replace_push_subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + cfg.anonKey,
        },
        body: JSON.stringify({
          p_old_endpoint: oldEndpoint,
          p_endpoint: sub.endpoint,
          p_p256dh: (json.keys && json.keys.p256dh) || '',
          p_auth: (json.keys && json.keys.auth) || '',
        }),
      })
    })().catch(() => {
      /* best-effort — the page-side sync heals on next app open */
    }),
  )
})
