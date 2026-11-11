import { Link } from 'react-router-dom'
import { ChevronDownIcon, TicketIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'

export function ClaimDoor({ className }: { className?: string }) {
  return (
    <Link
      to="/claim"
      className={cn(
        'group flex items-stretch overflow-hidden rounded-xl border border-reward-solid/35',
        'bg-gradient-to-r from-reward-solid/15 to-reward-solid/5',
        'transition-colors hover:from-reward-solid/25 hover:to-reward-solid/10',
        className,
      )}
    >
      <span className="flex w-14 shrink-0 items-center justify-center bg-reward-solid/10 text-reward">
        <TicketIcon className="h-6 w-6" />
      </span>

      <span aria-hidden className="w-0 shrink-0 border-l border-dashed border-reward-solid/40" />

      <span className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5">
        <span className="min-w-0">
          <span className="block text-sm text-muted">First time here?</span>
          <span className="block font-display text-sm font-bold text-reward">
            Claim your account
          </span>
        </span>
        <ChevronDownIcon
          aria-hidden
          className="ml-auto h-4 w-4 shrink-0 -rotate-90 text-reward transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  )
}
