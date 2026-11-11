import { cn } from '@/lib/cn'

const MAX_TAGS = 12

export function parseInterests(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS)
}

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
