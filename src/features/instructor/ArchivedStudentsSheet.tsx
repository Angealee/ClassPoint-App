import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { Select } from '@/components/ui/Select'
import {
  hardDeleteStudent,
  listArchivedStudents,
  restoreStudent,
  restoreStudentInto,
} from '@/lib/api'
import { errorText } from '@/lib/errors'
import { useInstructor } from './InstructorLayout'
import { timeAgo } from '@/lib/time'
import type { ArchivedStudent } from '@/lib/types'

/**
 * The archive drawer: restore students, or — behind a two-step confirmation
 * ending in a typed-name challenge — delete them forever. This is the only
 * place permanent deletion exists in the whole app.
 *
 * ── TWO MOUNTS, ONE COMPONENT (0060) ───────────────────────────────────────
 * With `sectionId` it is the per-section drawer off the roster, as before.
 * WITHOUT it, it is the whole archive across every semester — which is the
 * only way to reach a student archived by closing a semester, because their
 * section belongs to a semester that is no longer in the instructor's list.
 *
 * ── RESTORING NEEDS A DESTINATION, AND THAT IS NOT COSMETIC ─────────────────
 * `restoreStudent` (0023) only clears `archived_at`, leaving the student in the
 * section they had when they left. After a rollover that is a FINISHED
 * semester's section, and `scan_attendance`'s active-semester guard then
 * refuses them — so they looked restored and could not attend a class, with
 * nothing failing at restore time. In the cross-semester view, restore
 * therefore asks which section they are rejoining and calls
 * `restoreStudentInto`. The per-section drawer keeps the one-tap restore: there
 * the destination is not in question, it is the section you are looking at.
 */
export function ArchivedStudentsSheet({
  sectionId,
  open,
  onClose,
  onChanged,
}: {
  /** Omit for the whole archive, across every semester. */
  sectionId?: string
  open: boolean
  onClose: () => void
  /** Fired after a restore or hard delete so the roster can refresh. */
  onChanged: () => void
}) {
  const { toast } = useToast()
  const { sections } = useInstructor()
  const [rows, setRows] = useState<ArchivedStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Who we are placing, and where. Null = nobody is being placed.
  const [placing, setPlacing] = useState<ArchivedStudent | null>(null)
  const [target, setTarget] = useState('')
  // Two-step deletion: step 1 explains the damage, step 2 demands the name.
  const [deleteTarget, setDeleteTarget] = useState<ArchivedStudent | null>(null)
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    listArchivedStudents(sectionId)
      .then((list) => !cancelled && setRows(list))
      .catch(() => !cancelled && toast('Could not load archived students.', 'error'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, sectionId, toast])

  /** The per-section drawer: the destination is the section you are in. */
  async function onRestore(s: ArchivedStudent) {
    setBusyId(s.id)
    try {
      await restoreStudent(s.id)
      setRows((r) => r.filter((x) => x.id !== s.id))
      toast(`${s.fullName} restored — back everywhere.`, 'success')
      onChanged()
    } catch {
      toast('Could not restore. Try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  /** The cross-semester view: un-archive AND place, in one transaction. */
  async function onRestoreInto() {
    if (!placing || !target) return
    setBusyId(placing.id)
    try {
      await restoreStudentInto(placing.id, target)
      setRows((r) => r.filter((x) => x.id !== placing.id))
      const where = sections.find((x) => x.id === target)?.name ?? 'their new section'
      toast(`${placing.fullName} is back in ${where}.`, 'success')
      setPlacing(null)
      onChanged()
    } catch (e) {
      toast(errorText(e, 'Could not restore. Try again.'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function onHardDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await hardDeleteStudent(deleteTarget.id)
      setRows((r) => r.filter((x) => x.id !== deleteTarget.id))
      toast('Deleted forever. A full copy was kept in the audit log.', 'info')
      setDeleteTarget(null)
      setDeleteStep(1)
      onChanged()
    } catch {
      toast('Could not delete. Try again.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Archived students">
        <p className="mb-3 text-sm text-muted">
          {sectionId
            ? 'Hidden from rosters, the leaderboard and attendance — but nothing is lost. Restore brings everything back instantly.'
            : 'Everyone archived, across every semester. Restoring asks which section they are rejoining — a student put back into a finished semester cannot attend a class.'}
        </p>

        {/* ⚠ The placement form replaces the list IN PLACE rather than opening
            a second overlay. Sheet is portalled and focus-trapped, so a Sheet
            inside a Sheet stacks two competing traps — which is exactly why
            AppLayout closes the mobile menu before opening the sign-out
            dialog. One surface, two states. */}
        {placing ? (
          <div>
            <p className="text-sm">
              Put <span className="font-semibold">{placing.fullName}</span> back into:
            </p>
            {placing.sectionName && (
              <p className="mt-1 text-xs text-muted">
                They were in {placing.sectionName}
                {placing.semesterName ? ` · ${placing.semesterName}` : ''}.
              </p>
            )}

            {sections.length === 0 ? (
              <p className="mt-3 text-sm text-warn">
                This semester has no sections yet. Create one in Semesters first — there is
                nowhere to put them.
              </p>
            ) : (
              <Select
                label="Section"
                className="mt-3"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}

            <p className="mt-3 text-xs text-muted">
              They come back with their badges and all-time points. Their spendable points
              are whatever the active semester&rsquo;s ledger says, which for a returning
              student is zero until you award something.
            </p>

            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPlacing(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!target || sections.length === 0}
                loading={busyId === placing.id}
                onClick={() => void onRestoreInto()}
              >
                Restore
              </Button>
            </div>
          </div>
        ) : loading ? (
          <ListSkeleton rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState compact>No archived students.</EmptyState>
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {rows.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3">
                <Avatar name={s.fullName} url={s.avatarUrl} className="h-9 w-9 opacity-70" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.fullName}</p>
                  <p className="truncate text-xs text-muted">
                    {/* Built from parts and joined once: concatenating " · "
                        fragments leaves a doubled separator whenever a middle
                        piece is absent, and both names are nullable here. */}
                    {[
                      `${s.lifetimePoints} pts`,
                      // Only in the cross-semester view — in the per-section
                      // drawer the section is the screen you are on.
                      sectionId ? null : s.sectionName,
                      sectionId ? null : s.semesterName,
                      `archived ${timeAgo(s.archivedAt)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === s.id}
                  onClick={() => {
                    if (sectionId) {
                      void onRestore(s)
                      return
                    }
                    setPlacing(s)
                    setTarget(sections[0]?.id ?? '')
                  }}
                >
                  {busyId === s.id ? '…' : sectionId ? 'Restore' : 'Restore into…'}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(s)
                    setDeleteStep(1)
                  }}
                  className="shrink-0 text-xs font-semibold text-muted transition-colors hover:text-accent"
                >
                  Delete forever
                </button>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      {/* Step 1 — spell out exactly what dies with the record. */}
      <ConfirmDialog
        open={!!deleteTarget && deleteStep === 1}
        title="Delete forever?"
        message={
          <>
            <span className="font-semibold text-ink">{deleteTarget?.fullName}</span> and their
            ENTIRE history — every point, every attendance record, every achievement — will be
            permanently erased.
          </>
        }
        detail="Restore is free and loses nothing. Deletion cannot be undone from the app (a JSON copy lands in the audit log, recoverable only by hand in SQL)."
        confirmLabel="Continue"
        onConfirm={() => setDeleteStep(2)}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Step 2 — the typed-name point of no return. */}
      <ConfirmDialog
        open={!!deleteTarget && deleteStep === 2}
        title="Point of no return"
        message={
          <>
            This permanently erases{' '}
            <span className="font-semibold text-ink">{deleteTarget?.fullName}</span>.
          </>
        }
        challengeText={deleteTarget?.fullName ?? ''}
        confirmLabel="Delete forever"
        busy={deleting}
        onConfirm={onHardDelete}
        onClose={() => {
          setDeleteTarget(null)
          setDeleteStep(1)
        }}
      />
    </>
  )
}
