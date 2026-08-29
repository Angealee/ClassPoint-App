import { useState } from 'react'
import { cn } from '@/lib/cn'

/** Two-letter initials from a roster ("Dela Cruz, Juan A.") or display name. */
export function initials(name: string): string {
  const byComma = name.split(',').map((p) => p.trim()).filter(Boolean)
  if (byComma.length >= 2) return (byComma[1][0] + byComma[0][0]).toUpperCase()
  return name.split(/\s+/).filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

interface AvatarProps {
  name: string
  url?: string | null
  /** Tailwind size + radius classes for the wrapper (default h-10 w-10 rounded-full). */
  className?: string
  /** Font-size class for the initials fallback. */
  textClassName?: string
}

/**
 * Profile picture with a graceful initials fallback. Renders the image when a
 * URL is present (and loads successfully); otherwise a branded initials chip.
 */
export function Avatar({ name, url, className, textClassName = 'text-sm' }: AvatarProps) {
  const [broken, setBroken] = useState(false)
  const showImg = url && !broken

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        // Gold, not brand red. This fallback renders on EVERY roster row,
        // leaderboard row and comment pill, so with 208 students — most without
        // a photo — the old brand gradient turned the leaderboard into a column
        // of forty identical red circles. That was the single largest
        // concentration of brand red in the app, and it was decoration.
        'bg-gradient-to-br from-gold-300 to-gold-500 font-display font-bold text-brand-950',
        'h-10 w-10',
        className,
      )}
    >
      {showImg ? (
        <img
          src={url}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className={textClassName}>{initials(name)}</span>
      )}
    </span>
  )
}
