import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { hardDeleteStudent, listArchivedStudents, restoreStudent } from '@/lib/api'
import { timeAgo } from '@/lib/time'
import type { ArchivedStudent } from '@/lib/types'

/**
 * The archive drawer: restore students in one tap, or — behind a two-step
 * confirmation ending in a typed-name challenge — delete them forever. This is
 * the only place permanent deletion exists in the whole app.
 */
export function ArchivedStudentsSheet({
  sectionId,
  open,
  onClose,
  onChanged,
}: {
  sectionId: string
  open: boolean
  onClose: () => void
  /** Fired after a restore or hard delete so the roster can refresh. */
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [rows, setRows] = useState<ArchivedStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
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
          Hidden from rosters, the leaderboard and attendance — but nothing is lost. Restore
          brings everything back instantly.
        </p>

        {loading ? (
          <ListSkeleton rows={3} />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No archived students.</p>
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {rows.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3">
                <Avatar name={s.fullName} url={s.avatarUrl} className="h-9 w-9 opacity-70" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.fullName}</p>
                  <p className="text-xs text-muted">
                    {s.lifetimePoints} pts · archived {timeAgo(s.archivedAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === s.id}
                  onClick={() => void onRestore(s)}
                >
                  {busyId === s.id ? '…' : 'Restore'}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(s)
                    setDeleteStep(1)
                  }}
                  className="shrink-0 text-xs font-semibold text-muted transition-colors hover:text-brand-500"
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
