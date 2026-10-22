import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Logo } from '@/components/ui/Logo'

/** The whole run, in ms. The user asked for ~2 seconds. */
const DURATION_MS = 2000

/**
 * The "fade & breathe" sign-in overlay.
 *
 * Opacity + scale only, so it runs on the compositor. The parent owns the
 * screen's own fade (in, hold, out); the logo breathes once; the wordmark rises
 * under it. `<MotionConfig reducedMotion="user">` neutralises the transforms,
 * leaving the straight fade the user asked for — the timeout fires regardless.
 */
function AuthTransitionOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, DURATION_MS)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <motion.div
      aria-hidden
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-canvas"
      initial={{ opacity: 0 }}
      // fade in (0–0.15), hold (0.15–0.82), fade out into the app (0.82–1).
      animate={{ opacity: [0, 1, 1, 1, 0] }}
      transition={{ duration: DURATION_MS / 1000, times: [0, 0.15, 0.5, 0.82, 1], ease: 'easeInOut' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: [0.8, 1, 1.05, 1] }}
        transition={{ duration: 1.4, times: [0, 0.4, 0.75, 1], ease: 'easeOut' }}
      >
        <Logo className="h-20 w-20" />
      </motion.div>

      <motion.p
        className="font-display text-lg font-bold tracking-tight text-ink"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5, ease: 'easeOut' }}
      >
        ClassPoint
      </motion.p>
    </motion.div>
  )
}

interface AuthTransitionCtx {
  /** Begin the transition. Call it on a successful student sign-in. */
  start: () => void
  active: boolean
}

const AuthTransitionContext = createContext<AuthTransitionCtx>({ start: () => {}, active: false })

/**
 * Hosts the transition at the APP ROOT, above the router.
 *
 * ── WHY IT CANNOT LIVE INSIDE THE AUTH SCREEN ───────────────────────────────
 * The first version rendered the overlay inside SignIn and never showed. The
 * `RedirectIfAuthed` guard around /signin redirects to /app the INSTANT auth
 * resolves — so SignIn, and anything it rendered, unmounts a tick after the
 * server says yes, long before a 2s timer could run. The guard won that race
 * every time.
 *
 * So the overlay lives here, outside the router. A screen calls `start()`; the
 * guard redirects to /app UNDERNEATH; this `fixed inset-0 z-[100]` layer stays
 * mounted across that redirect and covers it for the full 2s, then unmounts
 * after its own fade-out has already gone transparent — so /app, mounted behind
 * it the whole time, is simply revealed. No navigate lives in the overlay any
 * more: the guard is the one thing that moves the route.
 */
export function AuthTransitionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const start = useCallback(() => setActive(true), [])
  const onDone = useCallback(() => setActive(false), [])

  return (
    <AuthTransitionContext.Provider value={{ start, active }}>
      {children}
      {active && <AuthTransitionOverlay onDone={onDone} />}
    </AuthTransitionContext.Provider>
  )
}

export function useAuthTransition() {
  return useContext(AuthTransitionContext)
}
