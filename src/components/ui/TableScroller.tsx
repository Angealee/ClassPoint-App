import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function TableScroller({
  children,
  className,
  fill = false,
  print = 'scroll',
}: {
  children: ReactNode
  className?: string
  fill?: boolean
  print?: 'scroll' | 'release'
}) {
  return (
    <div
      className={cn(
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
