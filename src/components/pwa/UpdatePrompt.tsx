import { AnimatePresence, motion } from 'framer-motion'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** How often an open app asks the server whether a new build exists. */
const UPDATE_CHECK_MS = 60 * 60 * 1000

/**
 * Shows a "new version available" banner when the service worker updates.
 *
 * The periodic check is load-bearing, not a nicety. A browser only looks for a
 * new service worker on navigation — and in an installed PWA that a student
 * leaves open for days, navigation basically never happens. Without this, they
 * can sit on a stale build indefinitely, which is exactly how you get 404s on
 * new lazy chunks and 400s from a client older than the database.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        // Pointless while offline, and it would just log a failed fetch.
        if (navigator.onLine) void registration.update()
      }
      setInterval(check, UPDATE_CHECK_MS)
      // Also check when the app comes back to the foreground — that's the
      // moment a student is most likely to be about to use it.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
    onRegisterError(error) {
      console.error('[pwa] service worker registration failed:', error)
    },
  })

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-md px-4 md:bottom-6"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3 pl-4 shadow-xl">
            <p className="flex-1 text-sm font-medium">New version available</p>
            <button
              type="button"
              onClick={() => void updateServiceWorker(true)}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              aria-label="Dismiss"
              className="px-1.5 text-lg leading-none text-muted hover:text-ink"
            >
              ×
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
