import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Logo } from '@/components/ui/Logo'
import { usePwaInstall } from '@/lib/pwa'

const DISMISS_KEY = 'cp_install_dismissed'

/**
 * Custom "Install ClassPoint" banner. Reads the shared install state (captured
 * once in PwaInstallProvider); on iOS it shows Add-to-Home-Screen steps. The
 * explicit Install button in the instructor UI uses the same source of truth.
 */
export function InstallPrompt() {
  const { state, promptInstall } = usePwaInstall()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')
  const [iosReady, setIosReady] = useState(false)

  // iOS never fires beforeinstallprompt — wait a beat before nudging.
  useEffect(() => {
    if (state !== 'ios') return
    const t = window.setTimeout(() => setIosReady(true), 2500)
    return () => clearTimeout(t)
  }, [state])

  function dismiss() {
    setDismissed(true)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  const iosHint = state === 'ios' && iosReady
  const show = !dismissed && (state === 'installable' || iosHint)

  async function install() {
    await promptInstall()
    dismiss()
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-md px-4 md:bottom-6"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3 shadow-xl">
            <Logo className="h-9 w-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Install ClassPoint</p>
              <p className="text-xs text-muted">
                {iosHint ? 'Tap Share → Add to Home Screen' : 'Add it to your home screen'}
              </p>
            </div>
            {!iosHint && (
              <button
                type="button"
                onClick={() => void install()}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Install
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
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
