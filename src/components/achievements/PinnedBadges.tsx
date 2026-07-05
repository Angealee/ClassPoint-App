import { useState } from 'react'
import { BadgeArt } from './BadgeArt'
import { Sheet } from '@/components/ui/Sheet'
import { PlusIcon, XIcon } from '@/components/ui/icons'
import type { AchievementState } from '@/lib/types'

interface Props {
  /** Full catalog merged with unlock state — used to render/pick pinned codes. */
  achievements: AchievementState[]
  pinnedCodes: string[]
  /** Shows add/remove controls + the picker sheet. */
  editable?: boolean
  onChange?: (codes: string[]) => void
  busy?: boolean
}

/** Up to 3 favorite unlocked badges, featured first — mirrors ProfileBanner's
 * add/remove pattern, but picks from already-unlocked achievements. */
export function PinnedBadges({ achievements, pinnedCodes, editable, onChange, busy }: Props) {
  const [picking, setPicking] = useState(false)
  const byCode = new Map(achievements.map((a) => [a.code, a]))
  const pinned = pinnedCodes.map((c) => byCode.get(c)).filter((a): a is AchievementState => !!a)
  const unlockedUnpinned = achievements.filter((a) => a.unlockedAt && !pinnedCodes.includes(a.code))

  if (!editable && pinned.length === 0) return null

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {pinned.map((a) => (
          <div key={a.code} className="relative flex flex-col items-center gap-1 rounded-xl bg-card-2 p-2">
            <BadgeArt code={a.code} category={a.category} state="unlocked" isTitleGrantor={!!a.titleText} size="sm" />
            <p className="w-full truncate text-center text-[0.65rem] font-medium text-muted">{a.name}</p>
            {editable && onChange && (
              <button
                type="button"
                onClick={() => onChange(pinnedCodes.filter((c) => c !== a.code))}
                disabled={busy}
                aria-label="Unpin"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/65"
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {editable && pinned.length < 3 && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            disabled={busy || unlockedUnpinned.length === 0}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line p-2 text-muted transition-colors hover:border-brand-500/50 hover:text-brand-500 disabled:opacity-50"
          >
            <PlusIcon className="h-5 w-5" />
            <span className="text-[0.65rem]">Pin a badge</span>
          </button>
        )}
      </div>

      {editable && (
        <Sheet open={picking} onClose={() => setPicking(false)} title="Pin a badge">
          <div className="space-y-2">
            {unlockedUnpinned.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted">
                Unlock more achievements to feature them here.
              </p>
            ) : (
              unlockedUnpinned.map((a) => (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => {
                    onChange?.([...pinnedCodes, a.code])
                    setPicking(false)
                  }}
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-card-2"
                >
                  <BadgeArt code={a.code} category={a.category} state="unlocked" isTitleGrantor={!!a.titleText} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.name}</p>
                    <p className="truncate text-xs text-muted">{a.description}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </Sheet>
      )}
    </>
  )
}
