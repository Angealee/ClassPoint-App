import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function StickyBar({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('sticky bottom-19 z-10 md:bottom-4', className)}>{children}</div>
}
