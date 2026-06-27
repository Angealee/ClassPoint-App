import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

const THRESHOLD = 70 // px pulled before a refresh fires
const MAX = 120 // px the indicator can travel
const RESIST = 0.5 // drag resistance (half-speed)

/**
 * Mobile pull-to-refresh. Wraps page content; when the user drags down while
 * already scrolled to the very top, it reveals a spinner and calls `onRefresh`.
 *
 * Deliberately conservative: it only ever engages at scrollY ≤ 0 and only calls
 * preventDefault while actively pulling down from the top, so normal scrolling
 * is never affected. No-op without touch.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown> | void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)
  const busyRef = useRef(false)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  function setPullBoth(v: number) {
    pullRef.current = v
    setPull(v)
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onStart = (e: TouchEvent) => {
      if (busyRef.current || window.scrollY > 0) {
        startY.current = null
        return
      }
      startY.current = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || busyRef.current) return
      if (window.scrollY > 0) {
        startY.current = null
        if (pullRef.current) setPullBoth(0)
        return
      }
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) {
        if (pullRef.current) setPullBoth(0)
        return
      }
      setPullBoth(Math.min(MAX, dy * RESIST))
      if (pullRef.current > 4 && e.cancelable) e.preventDefault()
    }
    const onEnd = () => {
      if (startY.current == null) return
      startY.current = null
      if (pullRef.current >= THRESHOLD && !busyRef.current) {
        busyRef.current = true
        setRefreshing(true)
        setPullBoth(56)
        Promise.resolve(onRefresh()).finally(() => {
          busyRef.current = false
          setRefreshing(false)
          setPullBoth(0)
        })
      } else {
        setPullBoth(0)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [onRefresh])

  const dragging = startY.current != null
  const progress = Math.min(1, pull / THRESHOLD)

  return (
    <div ref={ref}>
      <div
        className="relative flex items-end justify-center overflow-hidden"
        style={{
          height: refreshing ? 56 : pull,
          transition: dragging ? undefined : 'height 0.25s ease',
        }}
      >
        <span
          className={cn(
            'mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-card shadow-sm',
            refreshing && 'animate-spin',
          )}
          style={{
            opacity: pull > 6 || refreshing ? 1 : 0,
            transform: refreshing ? undefined : `rotate(${progress * 280}deg)`,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 text-brand-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M21 12a9 9 0 1 1-3-6.7" opacity={refreshing ? 1 : Math.max(0.25, progress)} />
          </svg>
        </span>
      </div>
      {children}
    </div>
  )
}
