import { cn } from '@/lib/cn'

/**
 * The instructor's pixel-art astronauts, rendered as ART rather than as icons.
 *
 * These are the 32x32 .ico files in public/. They are deliberately NOT used in
 * the nav — see the note on SaturnIcon — but at an exact 2x or 3x multiple with
 * `image-rendering: pixelated` the pixel grid lands on whole device pixels and
 * the art stays crisp instead of turning to mush. The sizes below are therefore
 * multiples of 32, not arbitrary Tailwind steps.
 *
 * `space` is the plain spaceman (Student Space); `lounge` is the one holding a
 * heart (the Lounge).
 */
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
