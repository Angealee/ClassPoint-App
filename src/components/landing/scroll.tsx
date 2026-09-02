import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'
import { useMotionValueEvent, useScroll, type MotionValue } from 'framer-motion'


interface LandingScroll {
  /** Current scroll direction. Read at animation time, never rendered. */
  direction: { current: 'up' | 'down' }
  /** Absolute scroll offset in px. */
  scrollY: MotionValue<number>
  /** 0–1 through the document, for the progress rail. */
  progress: MotionValue<number>
}

const LandingScrollContext = createContext<LandingScroll | null>(null)

const DIRECTION_THRESHOLD_PX = 2

export function LandingScrollProvider({ children }: { children: ReactNode }) {
  const { scrollY, scrollYProgress } = useScroll()
  const direction = useRef<'up' | 'down'>('down')
  const lastY = useRef(0)

  useMotionValueEvent(scrollY, 'change', (y) => {
    if (Math.abs(y - lastY.current) < DIRECTION_THRESHOLD_PX) return
    direction.current = y > lastY.current ? 'down' : 'up'
    lastY.current = y
  })

  const value = useMemo(
    () => ({ direction, scrollY, progress: scrollYProgress }),
    [scrollY, scrollYProgress],
  )

  return <LandingScrollContext.Provider value={value}>{children}</LandingScrollContext.Provider>
}

export function useLandingScroll(): LandingScroll {
  const ctx = useContext(LandingScrollContext)
  if (!ctx) throw new Error('useLandingScroll must be used inside <LandingScrollProvider>')
  return ctx
}
