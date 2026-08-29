import { IconButton } from '@/components/ui/IconButton'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { PlusIcon, TrashIcon } from '@/components/ui/icons'
import {
  createCatalogItem,
  listCatalogItems,
  setCatalogItemArchived,
  updateCatalogItem,
} from '@/lib/api'
import { errorText } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { MAX_REDEEM_POINTS, type RedemptionKind, type RewardCatalogItem } from '@/lib/types'

const KINDS: Array<{ value: RedemptionKind; label: string }> = [
  { value: 'quiz', label: 'Quiz' },
  { value: 'activity', label: 'Activity' },
  { value: 'exam', label: 'Exam' },
  { value: 'other', label: 'Other' },
]

/**
 * The price list (0032).
 *
 * Students used to invent their own ask with no idea what points were worth,
 * which made every request a negotiation. Setting prices here turns spending
 * into a shop — and a catalog tap still creates an ordinary redemption request,
 * so approving one works exactly as it always has.
 */
export function RewardsCatalog() {
  const { toast } = useToast()
  const [items, setItems] = useState<RewardCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [label, setLabel] = useState('')
  const [points, setPoints] = useState(10)
  const [kind, setKind] = useState<RedemptionKind>('quiz')

  const [editingId, setEditingId] = useState<string>()
  const [editLabel, setEditLabel] = useState('')
  const [editPoints, setEditPoints] = useState(10)
  const [retireTarget, setRetireTarget] = useState<RewardCatalogItem>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Archived included: retiring is reversible, so they stay visible here.
      setItems(await listCatalogItems(true))
    } catch (e) {
      toast(errorText(e, 'Could not load the rewards.'), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const pointsValid = Number.isInteger(points) && points >= 1 && points <= MAX_REDEEM_POINTS

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    if (!label.trim() || !pointsValid) return
    setBusy(true)
    try {
      await createCatalogItem({ label, points, kind })
      setLabel('')
      setPoints(10)
      await load()
      toast('Reward added.', 'success')
    } catch (e) {
      toast(errorText(e, 'Could not add that reward.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onSaveEdit(id: string) {
    if (!editLabel.trim()) return
    setBusy(true)
    try {
      await updateCatalogItem(id, { label: editLabel, points: editPoints })
      setEditingId(undefined)
      await load()
    } catch (e) {
      toast(errorText(e, 'Could not save that change.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onToggleArchived(item: RewardCatalogItem) {
    setBusy(true)
    try {
      await setCatalogItemArchived(item.id, !item.archivedAt)
      setRetireTarget(undefined)
      await load()
      toast(item.archivedAt ? 'Reward is back on the menu.' : 'Reward retired.', 'success')
    } catch (e) {
      toast(errorText(e, 'Could not update that reward.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const live = items.filter((i) => !i.archivedAt)
  const retired = items.filter((i) => i.archivedAt)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        What students can put their points toward. Prices are yours — students see this as a
        menu instead of guessing what to ask for.
      </p>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : (
        <>
          {live.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted">
              No rewards yet. Add one below and it appears on every student’s Use points screen.
            </Card>
          ) : (
            <Card pad="none" className="divide-y divide-line">
              {live.map((item) => (
                <div key={item.id} className="p-3.5">
                  {editingId === item.id ? (
                    <div className="space-y-2">
                      <Input
                        label="Reward"
                        value={editLabel}
                        disabled={busy}
                        onChange={(e) => setEditLabel(e.target.value)}
                      />
                      <Input
                        label="Points"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_REDEEM_POINTS}
                        value={editPoints}
                        disabled={busy}
                        onChange={(e) => setEditPoints(parseInt(e.target.value, 10) || 0)}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={busy} onClick={() => onSaveEdit(item.id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(undefined)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          setEditingId(item.id)
                          setEditLabel(item.label)
                          setEditPoints(item.points)
                        }}
                      >
                        <span className="block truncate text-sm font-semibold">{item.label}</span>
                        <span className="text-xs text-muted">
                          {KINDS.find((k) => k.value === item.kind)?.label}
                        </span>
                      </button>
                      <span className="shrink-0 font-display text-base font-bold text-reward">
                        {item.points}
                        <span className="ml-0.5 text-xs font-medium text-muted">pts</span>
                      </span>
                                            <IconButton
                        label={`Retire ${item.label}`}
                        variant="danger"
                        onClick={() => setRetireTarget(item)}
                        title="Retire (reversible)"
                        icon={<TrashIcon className="h-4.5 w-4.5" />}
                      />
                    </div>
                  )}
                </div>
              ))}
            </Card>
          )}

          {retired.length > 0 && (
            <div>
              <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Retired
              </h3>
              <Card pad="none" className="divide-y divide-line">
                {retired.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 opacity-70">
                    <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                    <span className="shrink-0 text-xs text-muted">{item.points} pts</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onToggleArchived(item)}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-brand-500 hover:bg-brand-500/10"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </>
      )}

      {/* Add */}
      <Card className="space-y-3 p-4">
        <p className="font-display text-sm font-bold">Add a reward</p>
        <form onSubmit={onAdd} className="space-y-3">
          <Input
            label="Reward"
            value={label}
            disabled={busy}
            placeholder="e.g. +2 on a quiz"
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Points"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_REDEEM_POINTS}
              value={points}
              disabled={busy}
              onChange={(e) => setPoints(parseInt(e.target.value, 10) || 0)}
              error={
                points !== 0 && !pointsValid ? `Between 1 and ${MAX_REDEEM_POINTS}.` : undefined
              }
            />
            <div>
              <span className="mb-1.5 block text-sm font-medium">Category</span>
              <div className="flex flex-wrap gap-1.5">
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    aria-pressed={kind === k.value}
                    onClick={() => setKind(k.value)}
                    className={cn(
                      'rounded-lg border px-2 py-1 text-xs font-semibold transition-colors',
                      kind === k.value
                        ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                        : 'border-line text-muted hover:text-ink',
                    )}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Button type="submit" size="sm" disabled={busy || !label.trim() || !pointsValid}>
            <PlusIcon className="h-4 w-4" /> Add reward
          </Button>
        </form>
      </Card>

      <ConfirmDialog
        open={!!retireTarget}
        title="Retire this reward?"
        message={
          retireTarget ? (
            <>
              <span className="font-semibold text-ink">{retireTarget.label}</span> stops appearing
              on students’ screens.
            </>
          ) : (
            ''
          )
        }
        detail="Nothing is deleted — requests students already made keep their meaning, and you can restore it any time."
        confirmLabel="Retire"
        busy={busy}
        onClose={() => setRetireTarget(undefined)}
        onConfirm={() => retireTarget && onToggleArchived(retireTarget)}
      />
    </div>
  )
}
