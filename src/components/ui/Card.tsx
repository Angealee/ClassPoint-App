import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** Surface card used across the app. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'theme-transition rounded-2xl border border-line bg-card shadow-sm',
        'shadow-black/5 dark:shadow-black/30',
        className,
      )}
      {...props}
    />
  )
}
