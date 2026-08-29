import { cn } from '@/lib/cn'

/** Maximum tags rendered; the rest are dropped rather than wrapped forever. */
const MAX_TAGS = 12

/**
 * Split a comma-separated interests string into trimmed, non-empty tags.
 *
 * This existed twice under two names — `interestTags` in Profile and
 * `splitInterests` in StudentProfilePreview — with byte-identical bodies. The
 * tag MARKUP was duplicated too, down to the same class string, which is the
 * part that would have drifted: the tags render in brand red, and a colour
 * sweep that caught one copy and missed the other is exactly what happened to
 * the points feed rows in Phase 6.
 */
export function parseInterests(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS)
}

/**
 * The interest pills. Renders nothing when there are none, so callers don't
 * need their own length check around a heading they'd then have to hide too.
 *
 * `accent`, not brand: an interest tag is identity, the same category as the
 * "(you)" marker on the leaderboard — never a warning.
 */
export function InterestTags({
  raw,
  className,
}: {
  raw: string | null | undefined
  className?: string
}) {
  const tags = parseInterests(raw)
  if (tags.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-accent-solid/10 px-3 py-1 text-xs font-medium text-accent"
        >
          {tag}
        </span>
      ))}
    </div>
  )
}
