import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Stash written by the early-capture script in index.html (see there). It grabs
 * `beforeinstallprompt` before React mounts, so a fast fire is never missed. */
interface InstallStash {
  event: BeforeInstallPromptEvent | null
  installed: boolean
}
function getStash(): InstallStash | undefined {
  return (window as unknown as { __cpInstall?: InstallStash }).__cpInstall
}

export type InstallState = 'installable' | 'installed' | 'ios' | 'inapp' | 'unavailable'

interface PwaInstallValue {
  /** Coarse state for rendering an install affordance. */
  state: InstallState
  isIos: boolean
  /** True inside a webview that can't install (Messenger, Facebook, IG, …). */
  isInApp: boolean
  /** Fire the native prompt (only meaningful when state === 'installable'). */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
}

const PwaInstallContext = createContext<PwaInstallValue | undefined>(undefined)

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIosDevice(): boolean {
  const ua = navigator.userAgent
  if (/iphone|ipad|ipod/i.test(ua)) return true
  // iPadOS 13+ reports a desktop-Mac UA; sniff it out via touch support so iPads
  // still get the Add-to-Home-Screen path instead of falling through to nothing.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
}

/** Common in-app browsers where PWA install is impossible (students often open
 * links inside these). */
function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || ''
  return /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|MicroMessenger|Twitter|TikTok|Snapchat|Pinterest|LinkedInApp|GSA\//i.test(
    ua,
  )
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    () => getStash()?.event ?? null,
  )
  const [installed, setInstalled] = useState(() => isStandalone() || !!getStash()?.installed)
  const isIos = useMemo(() => isIosDevice(), [])
  const isInApp = useMemo(() => isInAppBrowser(), [])

  useEffect(() => {
    // Pick up an event the early-capture script grabbed before we mounted.
    const stash = getStash()
    if (stash?.event) setDeferred(stash.event)
    if (stash?.installed) setInstalled(true)

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    // Dispatched by the early-capture script when a later event arrives.
    const onInstallable = () => {
      const ev = getStash()?.event
      if (ev) setDeferred(ev)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
      const s = getStash()
      if (s) s.event = null
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('cp:installable', onInstallable)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('cp:installable', onInstallable)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferred) return 'unavailable' as const
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    const s = getStash()
    if (s) s.event = null
    return outcome
  }, [deferred])

  const state: InstallState = installed
    ? 'installed'
    : deferred
      ? 'installable'
      : isInApp
        ? 'inapp'
        : isIos
          ? 'ios'
          : 'unavailable'

  const value = useMemo<PwaInstallValue>(
    () => ({ state, isIos, isInApp, promptInstall }),
    [state, isIos, isInApp, promptInstall],
  )

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>
}

export function usePwaInstall(): PwaInstallValue {
  const ctx = useContext(PwaInstallContext)
  if (!ctx) throw new Error('usePwaInstall must be used within a PwaInstallProvider')
  return ctx
}