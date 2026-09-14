import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { applyPeerGroupPlan } from '@/lib/api'
import {
  SHUFFLE_MAX_SIZE,
  SHUFFLE_MIN_SIZE,
  buildGroupPlan,
  describeSizes,
  type PlannedGroup,
} from '@/lib/peer-shuffle'
import { errorText } from '@/lib/errors'
import { PEER_MIN_RATERS_FOR_COMMENTS, type PeerGroup, type RosterPerson } from '@/lib/types'

const DEFAULT_SIZE = 4

/**
 * Shuffle a section into random groups (0054).
 *
 * ── PREVIEW, THEN SAVE EXACTLY THAT ────────────────────────────────────────
 * The groups are drawn here, on screen, and can be redrawn as often as the
 * instructor likes. Save sends that exact plan to `apply_peer_group_plan`,
 * which writes it in one transaction — a server-side draw would save a
 * different random result from the one previewed.
 *
 * ── UNASSIGNED ONLY BY DEFAULT (the instructor's call) ─────────────────────
 * With the switch off, only students on no team are shuffled and every existing
 * group is untouched, so saving needs no confirmation. Turning it on reshuffles
 * the whole section, archives the current groups, and goes through a
 * ConfirmDialog, because that is the destructive version.
 *
 * ── GROUPS BELOW FOUR LOSE THEIR COMMENTS ─────────────────────────────────
 * In a group of N each student is rated by N − 1 classmates, and comments are
 * withheld below three raters. So a group of 3 is already under the line, not
 * only a pair. The preview says so whenever any planned group is that small,
 * rather than letting the instructor find out at release.
 */
export function PeerShuffleSheet({
  open,
  sectionId,
  sectionName,
  roster,
  groups,
  unassigned,
  onClose,
  onSaved,
}: {
  open: boolean
  sectionId: string
  sectionName: string
  roster: RosterPerson[]
  groups: PeerGroup[]
  unassigned: RosterPerson[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [size, setSize] = useState(DEFAULT_SIZE)
  const [replace, setReplace] = useState(false)
  const [plan, setPlan] = useState<PlannedGroup[]>([])
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const byId = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster])
  // Replace mode archives every live group first, so none of their names are
  // taken any more and numbering can start again at Group 1.
  const pool = replace ? roster : unassigned
  const existingNames = useMemo(() => (replace ? [] : groups.map((g) => g.name)), [replace, groups])

  function redraw() {
    setPlan(buildGroupPlan(pool.map((p) => p.id), size, existingNames))
  }

  // A fresh open starts from the defaults; a changed size or mode redraws.
  useEffect(() => {
    if (!open) return
    setSize(DEFAULT_SIZE)
    setReplace(false)
    setConfirm(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    setPlan(buildGroupPlan(pool.map((p) => p.id), size, existingNames))
    // `pool` is derived from roster/unassigned/replace, all listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, size, replace, roster, unassigned, existingNames])

  const sizes = plan.map((g) => g.studentIds.length)
  // A group of N gives each member N − 1 raters.
  const withheld = sizes.some((n) => n - 1 < PEER_MIN_RATERS_FOR_COMMENTS)

  async function save() {
    setBusy(true)
    try {
      const made = await applyPeerGroupPlan(sectionId, replace, plan)
      toast(`Created ${made} group${made === 1 ? '' : 's'}.`, 'success')
      setConfirm(false)
      onSaved()
    } catch (e) {
      // Every refusal from the RPC says "Nothing was changed", and it is true:
      // the function rolls back as a whole.
      toast(errorText(e, "Couldn't save those groups."), 'error')
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Shuffle into groups" variant="screen">
        <div className="mx-auto w-full max-w-2xl space-y-4 pt-4">
          <div>
            <h1 className="font-display text-xl font-bold">Shuffle into groups</h1>
            <p className="mt-1 text-sm text-muted">{sectionName}</p>
          </div>

          <Card className="space-y-4">
            <Select
              label="Students per group"
              value={String(size)}
              onChange={(e) => setSize(Number(e.target.value))}
            >
              {Array.from(
                { length: SHUFFLE_MAX_SIZE - SHUFFLE_MIN_SIZE + 1 },
                (_, i) => i + SHUFFLE_MIN_SIZE,
              ).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>

            {groups.length > 0 && (
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                  className="mt-0.5 h-4.5 w-4.5 shrink-0 rounded accent-[var(--color-accent-solid)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Reshuffle everyone</span>
                  <span className="block text-xs text-muted">
                    {replace
                      ? `All ${roster.length} students are regrouped and the ${groups.length} current group${groups.length === 1 ? ' is' : 's are'} archived.`
                      : `Off: only the ${unassigned.length} student${unassigned.length === 1 ? '' : 's'} on no team are shuffled. Existing groups stay as they are.`}
                  </span>
                </span>
              </label>
            )}
          </Card>

          {plan.length === 0 ? (
            <Card pad="tight">
              <p className="text-sm text-muted">
                {pool.length < 2
                  ? replace || groups.length === 0
                    ? 'This section needs at least two students to make a group.'
                    : pool.length === 1
                      ? 'Only one student is on no team. Add them to a group by hand, or reshuffle everyone.'
                      : 'Everyone is already on a team. Turn on Reshuffle everyone to start over.'
                  : 'Those groups can’t be named. Rename some existing groups and try again.'}
              </p>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 px-1">
                <p className="min-w-0 text-sm font-semibold">{describeSizes(sizes)}</p>
                <Button size="sm" variant="outline" onClick={redraw}>
                  Shuffle again
                </Button>
              </div>

              {withheld && (
                <Card pad="tight" className="border-warn/30 bg-warn-solid/8">
                  <p className="text-sm font-semibold text-warn">Some groups are too small for comments</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Comments are withheld when fewer than {PEER_MIN_RATERS_FOR_COMMENTS} classmates
                    rate someone, so members of groups under {PEER_MIN_RATERS_FOR_COMMENTS + 1} will
                    only get scores back.
                  </p>
                </Card>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {plan.map((g) => (
                  <Card key={g.name} pad="tight">
                    <p className="text-sm font-semibold">
                      {g.name}
                      <span className="ml-1.5 text-xs font-normal text-muted">
                        {g.studentIds.length}
                      </span>
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {g.studentIds.map((id) => (
                        <li key={id} className="truncate text-sm text-muted">
                          {byId.get(id)?.fullName ?? 'Unknown student'}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>

              <div className="sticky bottom-0 border-t border-line bg-canvas/95 py-3 backdrop-blur-md">
                <Button
                  className="w-full"
                  variant={replace ? 'danger' : 'primary'}
                  loading={busy && !replace}
                  onClick={() => (replace ? setConfirm(true) : void save())}
                >
                  {replace ? 'Replace all groups' : `Save ${plan.length} group${plan.length === 1 ? '' : 's'}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirm}
        title={`Replace every group in ${sectionName}?`}
        message={`The ${groups.length} current group${groups.length === 1 ? ' is' : 's are'} archived and all ${roster.length} students are placed into ${plan.length} new groups.`}
        detail="Past evaluations keep the teams they used. The archived groups and their members are recorded in the audit log."
        variant="danger"
        confirmLabel="Replace groups"
        busy={busy}
        onConfirm={() => void save()}
        onClose={() => setConfirm(false)}
      />
    </>
  )
}
