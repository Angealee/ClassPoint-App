import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/** A small pill at the top of the screen while the device is offline. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 mx-auto flex w-fit items-center gap-2 rounded-full border border-line bg-card px-4 py-1.5 shadow-lg"
          role="status"
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-xs font-medium">You're offline — showing saved data</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
