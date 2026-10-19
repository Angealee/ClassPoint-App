import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The scroll container every wide table needs.
 *
 * ⚠ THIS EXISTS BECAUSE A TABLE SHIPPED WITHOUT ONE. The grade print sheet was
 * written as a plain `<table>`, which on a phone cannot scroll — so it squeezed
 * instead: measured at 375px, a six-column sheet overflowed the page by 9px and
 * every row stood **103px tall**, because a 45-character name crushed into a
 * 78px column wraps to six lines and drags the whole row with it. The Overall
 * tab, holding the same data behind a scroller, renders 36px rows and overflows
 * by nothing.
 *
 * So the rule is: a table wider than a phone goes in one of these. Four places
 * were hand-rolling the same container and the one that forgot is the one that
 * broke.
 *
 * ── STICKY ONLY WORKS INSIDE ITS OWN SCROLLER ───────────────────────────────
 * A `sticky` cell sticks to the nearest scroll container, not the viewport, so
 * a frozen header or name column is only possible INSIDE this element. That is
 * also why `fill` matters: with an unbounded height the page scrolls instead,
 * and a sticky header slides away (measured once at `top: -503`).
 */
export function TableScroller({
  children,
  className,
  fill = false,
  print = 'scroll',
}: {
  children: ReactNode
  className?: string
  /**
   * Take the height left in a bounded column (`width="full"` routes) rather
   * than capping at a fraction of the viewport.
   *
   * `min-h-64` is a floor, not decoration: if the flex chain above is ever
   * broken, this can only end up short — never zero-height, which reads as a
   * failed render rather than a layout bug.
   */
  fill?: boolean
  /**
   * `release` drops the scroller and every height cap inside `@media print`.
   *
   * A printed page has no viewport and cannot scroll, so a scroller there
   * would clip the table at whatever the screen happened to be — printing one
   * screenful and silently discarding the rest.
   */
  print?: 'scroll' | 'release'
}) {
  return (
    <div
      className={cn(
        // `-mx-1 px-1` so a focus ring on an edge cell is not clipped by the
        // scroller it sits in.
        '-mx-1 overflow-auto overscroll-contain px-1',
        fill ? 'min-h-64 max-h-[75dvh] md:max-h-none md:min-h-0 md:flex-1' : 'max-h-[75dvh]',
        print === 'release' && 'print:max-h-none print:overflow-visible',
        className,
      )}
    >
      {children}
    </div>
  )
}
