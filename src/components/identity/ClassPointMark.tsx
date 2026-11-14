import { Logo } from '@/components/ui/Logo'
import { CheckIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { openIdentity } from './identity-store'

/*
 * The official voice's face: the ClassPoint logo on a white tile (the logo is a raster with its
 * own white ground, so it reads as intentional on a tile instead of as a stray square in dark
 * mode). `official` adds the small check that marks it as the app speaking, not a person.
 */
export function ClassPointMark({
  className,
  round = false,
  official = false,
}: {
  /** Size classes; defaults to 28px. */
  className?: string
  round?: boolean
  official?: boolean
}) {
  return (
    <span className={cn('relative inline-flex h-7 w-7 shrink-0', className)}>
      <span
        className={cn(
          'flex h-full w-full items-center justify-center overflow-hidden bg-white ring-1 ring-black/10',
          round ? 'rounded-full' : 'rounded-lg',
        )}
      >
        <Logo className="h-full w-full object-contain p-[8%]" />
      </span>
      {official && (
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 flex h-[38%] w-[38%] min-h-3 min-w-3 items-center justify-center rounded-full bg-info-solid text-white ring-2 ring-canvas"
        >
          <CheckIcon className="h-[70%] w-[70%]" />
        </span>
      )}
    </span>
  )
}

/** The mark as a button that opens the "official account" card. */
export function ClassPointButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => openIdentity('classpoint')}
      aria-label="ClassPoint, official account"
      className="inline-flex rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <ClassPointMark official round className={className} />
    </button>
  )
}
