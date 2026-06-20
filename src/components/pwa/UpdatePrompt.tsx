import { AnimatePresence, motion } from 'framer-motion'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** Shows a "new version available" banner when the service worker updates. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

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
