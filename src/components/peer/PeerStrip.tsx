import { useEffect, useRef } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { CheckIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import type { PeerPerson } from '@/lib/types'

/**
 * Everyone in the group, in one scrolling row: who is done, who you are on, and a tap to jump.
 * It scrolls itself so the active classmate stays centred, which matters once a group is bigger
 * than the row is wide.
 */
export function PeerStrip({
  peers,
  activeId,
  isDone,
  onPick,
}: {
  peers: PeerPerson[]
  activeId: string | null
  isDone: (peerId: string) => boolean
  onPick: (peerId: string) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = boxRef.current
    const el = box?.querySelector<HTMLElement>('[data-active="true"]')
    if (!box || !el) return
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.clientWidth) / 2, behavior: 'smooth' })
  }, [activeId])

  return (
    <div
      ref={boxRef}
      role="group"
      aria-label="Jump to a classmate"
      className="relative -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {peers.map((p) => {
        const done = isDone(p.id)
        const active = activeId === p.id
        return (
          <button
            key={p.id}
            type="button"
            data-active={active}
            onClick={() => onPick(p.id)}
            aria-label={`${p.displayName}${done ? ', done' : ''}`}
            aria-current={active ? 'true' : undefined}
            className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span className="relative">
              <Avatar
                name={p.displayName}
                url={p.avatarUrl}
                className={cn(
                  'h-11 w-11 ring-2 ring-offset-2 ring-offset-canvas transition-shadow',
                  active ? 'ring-accent-solid' : done ? 'ring-success-solid' : 'ring-transparent',
                )}
              />
              {done && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-success-solid text-white ring-2 ring-canvas">
                  <CheckIcon className="h-3 w-3" />
                </span>
              )}
            </span>
            <span
              className={cn(
                'w-full truncate text-center text-2xs',
                active ? 'font-semibold text-ink' : done ? 'text-ink' : 'text-muted',
              )}
            >
              {p.displayName}
            </span>
          </button>
        )
      })}
    </div>
  )
}
