import { useRef, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { CoverPhoto } from '@/components/profile/CoverPhoto'
import { PencilIcon, XIcon } from '@/components/ui/icons'
import { getLevelProgress } from '@/lib/leveling'
import { cn } from '@/lib/cn'

/*
 * The profile's collectible card: the same fixed dark plate as Home, Grades, Attendance and
 * the podium cards, so a student's own page and the one classmates see read as one family. The
 * cover is the top band, the face sits in a level ring (the ring is the XP progress, the
 * "orbit"), and a faint sheen follows a finger or the pointer. Every value is a literal: the
 * plate does not follow the theme.
 *
 * The avatar is ABSOLUTELY positioned and the text is indented past it. A flex row lifted over
 * a cover paints UNDER it (positioned elements paint above static ones), which already cost the
 * profile its name once; this shape cannot collide at any name length.
 */
export interface PlayerCardProps {
  name: string
  title?: string | null
  /** "BSIT 2A" or empty; the level is appended here. */
  sectionLabel: string
  avatarUrl: string | null
  coverUrl: string | null
  coverPos: number
  /** This semester's points: the level and the ring both come from it. */
  points: number
  rank: number | null
  /** The third tile: all-time points on your own card, level on someone else's. */
  third: { label: string; value: string }
  isMe?: boolean
  /** Editing affordances (your own profile only). */
  editable?: boolean
  coverBusy?: boolean
  avatarBusy?: boolean
  onPickCover?: () => void
  onRepositionCover?: (pos: number) => void
  onRemoveCover?: () => void
  onPickAvatar?: () => void
  onRemoveAvatar?: () => void
  /** The action row under the stats (Edit / Preview). */
  children?: ReactNode
  reduced?: boolean
}

export function PlayerCard({
  name,
  title,
  sectionLabel,
  avatarUrl,
  coverUrl,
  coverPos,
  points,
  rank,
  third,
  isMe,
  editable = false,
  coverBusy,
  avatarBusy,
  onPickCover,
  onRepositionCover,
  onRemoveCover,
  onPickAvatar,
  onRemoveAvatar,
  children,
  reduced = false,
}: PlayerCardProps) {
  const progress = getLevelProgress(points)
  const cardRef = useRef<HTMLDivElement>(null)

  function follow(e: RPointerEvent<HTMLDivElement>) {
    if (reduced) return
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--fx', `${Math.round(((e.clientX - r.left) / r.width) * 100)}%`)
    el.style.setProperty('--fy', `${Math.round(((e.clientY - r.top) / r.height) * 100)}%`)
    el.style.setProperty('--foil', '1')
  }
  function rest() {
    cardRef.current?.style.setProperty('--foil', '0')
  }

  return (
    <div
      ref={cardRef}
      onPointerMove={follow}
      onPointerLeave={rest}
      onPointerCancel={rest}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-plate-2 to-plate text-white shadow-lg shadow-black/25 ring-1 ring-white/10"
      style={{ ['--foil' as string]: 0 } as CSSProperties}
    >
      <CoverPhoto
        url={coverUrl}
        pos={coverPos}
        tone="plate"
        className="h-32"
        editable={editable}
        busy={coverBusy}
        onPick={onPickCover}
        onReposition={onRepositionCover}
        action={
          editable && coverUrl && onRemoveCover ? (
            <button
              type="button"
              onClick={onRemoveCover}
              disabled={coverBusy}
              aria-label="Remove cover photo"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
            >
              <XIcon className="h-4 w-4" />
            </button>
          ) : undefined
        }
      />

      {/* A sheen over the whole card, brighter where the finger or pointer is. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-200"
        style={{
          opacity: 'calc(0.35 + var(--foil, 0) * 0.65)',
          background:
            'radial-gradient(circle at var(--fx, 25%) var(--fy, 12%), rgba(255,255,255,0.16), transparent 42%), linear-gradient(115deg, transparent 22%, rgba(255,255,255,0.07) 44%, rgba(150,200,255,0.08) 56%, transparent 78%)',
        }}
      />

      <div className="relative z-[1] px-5 pb-5 pt-3">
        <div className="absolute -top-11 left-5 z-[1]">
          <div
            className="rounded-full p-[3px]"
            style={{
              background: `conic-gradient(#fde08a ${progress.progressPct}%, rgba(255,255,255,0.16) ${progress.progressPct}%)`,
            }}
          >
            <div className="rounded-full bg-plate p-[3px]">
              {editable && onPickAvatar ? (
                <button
                  type="button"
                  onClick={onPickAvatar}
                  disabled={avatarBusy}
                  aria-label={avatarUrl ? 'Change profile picture' : 'Add a profile picture'}
                  className="block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60"
                >
                  <Avatar
                    name={name}
                    url={avatarUrl}
                    className="h-20! w-20!"
                    textClassName="text-3xl"
                  />
                </button>
              ) : (
                <Avatar name={name} url={avatarUrl} className="h-20! w-20!" textClassName="text-3xl" />
              )}
            </div>
          </div>
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-gold-300 px-2 py-0.5 text-2xs font-bold tabular-nums text-brand-950 ring-2 ring-plate">
            Lv {progress.level}
          </span>
          {editable && onPickAvatar && (
            <span
              aria-hidden
              className="pointer-events-none absolute -right-1 bottom-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent-solid text-white ring-2 ring-plate"
            >
              {avatarBusy ? <span className="text-2xs">…</span> : <PencilIcon className="h-3.5 w-3.5" />}
            </span>
          )}
          {editable && avatarUrl && onRemoveAvatar && (
            <button
              type="button"
              onClick={onRemoveAvatar}
              disabled={avatarBusy}
              aria-label="Remove profile picture"
              className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-danger-solid"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="min-h-14 min-w-0 pl-28">
          <p className="line-clamp-2 break-words font-display text-2xl font-bold leading-tight" title={name}>
            {name}
            {isMe && !editable && <span className="ml-1.5 text-sm font-semibold text-gold-300">you</span>}
          </p>
          {title && <p className="truncate text-xs font-semibold text-gold-300">{title}</p>}
          <p className="truncate text-sm text-white/65">
            {[sectionLabel, `Level ${progress.level}`].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <Tile label="Rank" value={rank != null ? `#${rank}` : '-'} />
          <Tile label="This semester" value={String(points)} gold />
          <Tile label={third.label} value={third.value} />
        </div>
        <p className="mt-2 text-center text-2xs tabular-nums text-white/60">
          {progress.expIntoLevel} / {progress.expForLevel} XP · {progress.expToNext} to level{' '}
          {progress.level + 1}
        </p>

        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  )
}

function Tile({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.07] px-2 py-2.5 text-center">
      <p
        className={cn(
          'truncate font-display text-xl font-bold leading-none tabular-nums',
          gold ? 'text-gold-300' : 'text-white',
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 truncate text-2xs text-white/60">{label}</p>
    </div>
  )
}
