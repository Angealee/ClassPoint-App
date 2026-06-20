import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Logo } from '@/components/ui/Logo'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'cp_install_dismissed'

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Custom "Install ClassPoint" banner. Uses the native beforeinstallprompt where
 * available; on iOS (which has no such event) it shows Add-to-Home-Screen steps.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === '1') return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    const onInstalled = () => {
      setShow(false)
      setDeferred(null)
    }
    window.addEventListener('appinstalled', onInstalled)

    // iOS never fires beforeinstallprompt — offer manual instructions instead.
    const iosTimer = isIos()
      ? window.setTimeout(() => {
          setIosHint(true)
          setShow(true)
        }, 2500)
      : undefined

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      if (iosTimer) clearTimeout(iosTimer)
    }
  }, [])

  function dismiss() {
    setShow(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
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
