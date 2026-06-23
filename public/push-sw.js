/* ClassPoint · service-worker push handlers.
 *
 * vite-plugin-pwa generates the main service worker (Workbox) and imports this
 * file via `workbox.importScripts` (see vite.config.ts). Keep it dependency-free
 * and plain JS — it runs in the SW global scope, not the app bundle.
 *
 * The Edge Function `send-push` delivers a JSON payload shaped like:
 *   { title, body, tag, url, icon }
 */

// Distinct buzz per event type, mirroring the in-app haptics (lib/haptics.ts).
const VIBRATION_BY_TAG = {
  'cp-points': [60],
  'cp-level': [50, 40, 90],
  'cp-rank': [30, 30, 30],
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
