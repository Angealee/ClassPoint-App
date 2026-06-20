import { cn } from '@/lib/cn'

export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/app-logo.svg"
      alt="ClassPoint"
      className={cn('h-8 w-8', className)}
    />
  )
}
