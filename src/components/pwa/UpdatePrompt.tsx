import { Button } from '@/components/ui/Button'
import { AnimatePresence, motion } from 'framer-motion'
import { glide } from '@/lib/motion'
import { useRegisterSW } from 'virtual:pwa-register/react'

const UPDATE_CHECK_MS = 60 * 60 * 1000

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) void registration.update()
      }
      setInterval(check, UPDATE_CHECK_MS)
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
          transition={glide}
          className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-md px-4 md:bottom-6"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3 pl-4 shadow-xl">
            <p className="flex-1 text-sm font-medium">New version available</p>
            <Button size="sm" onClick={() => void updateServiceWorker(true)}>
              Reload
            </Button>
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
