import { Rows } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import type { CSSProperties } from 'react'

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span style={style} className={cn('relative block overflow-hidden rounded-lg bg-card-2', className)}>
      <span className="cp-skel absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent dark:via-white/5" />
    </span>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Rows>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3.5">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </Rows>
  )
}
