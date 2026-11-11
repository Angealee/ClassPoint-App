import { cn } from '@/lib/cn'

const SRC = {
  space: '/studentSpace.ico',
  lounge: '/studentLounge.ico',
} as const

const SIZES = {
  sm: 'h-8 w-8', // 32 — 1x
  md: 'h-16 w-16', // 64 — 2x
  lg: 'h-24 w-24', // 96 — 3x
} as const

export function AstronautArt({
  variant = 'space',
  size = 'md',
  className,
  alt = '',
}: {
  variant?: keyof typeof SRC
  size?: keyof typeof SIZES
  className?: string
  /** Empty by default: this is decoration beside a real heading. */
  alt?: string
}) {
  return (
    <img
      src={SRC[variant]}
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      className={cn(SIZES[size], 'shrink-0 [image-rendering:pixelated]', className)}
    />
  )
}
