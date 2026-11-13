import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { AstronautArt } from './AstronautArt'

/** Fixed star positions (percent) — deterministic, so nothing reshuffles on render. */
const STARS: ReadonlyArray<[number, number, number, number]> = [
  [8, 30, 2, 0],
  [22, 70, 2, 1.2],
  [37, 22, 3, 2.4],
  [51, 62, 2, 0.7],
  [63, 28, 2, 1.9],
  [77, 70, 3, 2.8],
  [88, 26, 2, 1.4],
]

/**
 * A slim version of the Space home banner for inner Space screens: starfield,
 * violet wash and a small floating astronaut around whatever header sits inside.
 */
export function SpaceStrip({ children }: { children: ReactNode }) {
  return (
    <Card pad="none" className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/20 via-indigo-500/8 to-transparent"
      />
      <div aria-hidden="true" className="cp-grid pointer-events-none absolute inset-0 opacity-70" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {STARS.map(([l, t, size, d], i) => (
          <span
            key={i}
            className="cp-twinkle absolute rounded-full bg-white"
            style={{ left: `${l}%`, top: `${t}%`, width: size, height: size, animationDelay: `${d}s` }}
          />
        ))}
      </div>
      <div className="relative flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">{children}</div>
        <AstronautArt variant="space" size="md" className="cp-float hidden shrink-0 sm:block" />
      </div>
    </Card>
  )
}
