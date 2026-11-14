import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Select";
import {
  hardDeleteStudent,
  listArchivedStudents,
  restoreStudent,
  restoreStudentInto,
} from "@/lib/api";
import { errorText } from "@/lib/errors";
import { useInstructor } from "./InstructorLayout";
import { timeAgo } from "@/lib/time";
import type { ArchivedStudent } from "@/lib/types";

export function ArchivedStudentsSheet({
  sectionId,
  open,
  onClose,
  onChanged,
}: {
  /** Omit for the whole archive, across every semester. */
  sectionId?: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const { sections } = useInstructor();
  const [rows, setRows] = useState<ArchivedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<ArchivedStudent | null>(null);
  const [target, setTarget] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ArchivedStudent | null>(
    null,
  );
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleting, setDeleting] = useState(false);
  const [deleteAllStep, setDeleteAllStep] = useState<0 | 1 | 2>(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listArchivedStudents(sectionId)
      .then((list) => !cancelled && setRows(list))
      .catch(
        () => !cancelled && toast("Could not load archived students.", "error"),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, sectionId, toast]);

  async function onRestore(s: ArchivedStudent) {
    setBusyId(s.id);
    try {
      await restoreStudent(s.id);
      setRows((r) => r.filter((x) => x.id !== s.id));
      toast(`${s.fullName} restored, back everywhere.`, "success");
      onChanged();
    } catch {
      toast("Could not restore. Try again.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function onRestoreInto() {
    if (!placing || !target) return;
    setBusyId(placing.id);
    try {
      await restoreStudentInto(placing.id, target);
      setRows((r) => r.filter((x) => x.id !== placing.id));
      const where =
        sections.find((x) => x.id === target)?.name ?? "their new section";
      toast(`${placing.fullName} is back in ${where}.`, "success");
      setPlacing(null);
      onChanged();
    } catch (e) {
      toast(errorText(e, "Could not restore. Try again."), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function onHardDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await hardDeleteStudent(deleteTarget.id);
      setRows((r) => r.filter((x) => x.id !== deleteTarget.id));
      toast("Deleted forever. A full copy was kept in the audit log.", "info");
      setDeleteTarget(null);
      setDeleteStep(1);
      onChanged();
    } catch {
      toast("Could not delete. Try again.", "error");
    } finally {
      setDeleting(false);
    }
  }

  async function onDeleteAll() {
    const batch = rows;
    setDeleting(true);
    setProgress(0);
    let failed = 0;
    for (const s of batch) {
      try {
        await hardDeleteStudent(s.id);
        setRows((r) => r.filter((x) => x.id !== s.id));
      } catch {
        failed++;
      }
      setProgress((p) => p + 1);
    }
    setDeleting(false);
    setDeleteAllStep(0);
    onChanged();
    if (failed) toast(`${failed} could not be deleted. Try again.`, "error");
    else
      toast(
        `${batch.length} deleted forever. Copies were kept in the audit log.`,
        "info",
      );
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Archived students">
        <p className="mb-3 text-sm text-muted">
          {sectionId
            ? "Hidden from rosters, the leaderboard and attendance, but nothing is lost. Restore brings everything back instantly."
            : "Everyone archived, across every semester. Restoring asks which section they are rejoining, a student put back into a finished semester cannot attend a class."}
        </p>

        {placing ? (
          <div>
            <p className="text-sm">
              Put <span className="font-semibold">{placing.fullName}</span> back
              into:
            </p>
            {placing.sectionName && (
              <p className="mt-1 text-xs text-muted">
                They were in {placing.sectionName}
                {placing.semesterName ? ` · ${placing.semesterName}` : ""}.
              </p>
            )}

            {sections.length === 0 ? (
              <p className="mt-3 text-sm text-warn">
                This semester has no sections yet. Create one in Semesters first
               , there is nowhere to put them.
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
              They come back with their badges and all-time points. Their
              spendable points are whatever the active semester&rsquo;s ledger
              says, which for a returning student is zero until you award
              something.
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
          <>
            {rows.length > 1 && (
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteAllStep(1)}
                  className="cp-tap-y text-xs font-semibold text-danger"
                >
                  Delete all ({rows.length})
                </button>
              </div>
            )}
            <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {rows.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3">
                  <Avatar
                    name={s.fullName}
                    url={s.avatarUrl}
                    className="h-9 w-9 opacity-70"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {s.fullName}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {[
                        `${s.lifetimePoints} pts`,
                        sectionId ? null : s.sectionName,
                        sectionId ? null : s.semesterName,
                        `archived ${timeAgo(s.archivedAt)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === s.id}
                    onClick={() => {
                      if (sectionId) {
                        void onRestore(s);
                        return;
                      }
                      setPlacing(s);
                      setTarget(sections[0]?.id ?? "");
                    }}
                  >
                    {busyId === s.id
                      ? "…"
                      : sectionId
                        ? "Restore"
                        : "Restore into…"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteTarget(s);
                      setDeleteStep(1);
                    }}
                    className="shrink-0 text-xs font-semibold text-muted transition-colors hover:text-accent"
                  >
                    Delete forever
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </Sheet>

      <ConfirmDialog
        open={deleteAllStep === 1}
        title={`Delete all ${rows.length}?`}
        message="Every archived student shown here and their entire history will be permanently erased."
        detail="Restore is free. Deletion can't be undone from the app; a copy of each lands in the audit log."
        confirmLabel="Continue"
        onConfirm={() => setDeleteAllStep(2)}
        onClose={() => setDeleteAllStep(0)}
      />

      <ConfirmDialog
        open={deleteAllStep === 2}
        title="Point of no return"
        message={
          deleting
            ? `Deleting… ${progress} of ${rows.length + progress}`
            : `This permanently erases ${rows.length} students.`
        }
        challengeText="delete all"
        confirmLabel="Delete all forever"
        busy={deleting}
        onConfirm={onDeleteAll}
        onClose={() => setDeleteAllStep(0)}
      />

      <ConfirmDialog
        open={!!deleteTarget && deleteStep === 1}
        title="Delete forever?"
        message={
          <>
            <span className="font-semibold text-ink">
              {deleteTarget?.fullName}
            </span>{" "}
            and their ENTIRE history, every point, every attendance record,
            every achievement, will be permanently erased.
          </>
        }
        detail="Restore is free and loses nothing. Deletion cannot be undone from the app (a JSON copy lands in the audit log, recoverable only by hand in SQL)."
        confirmLabel="Continue"
        onConfirm={() => setDeleteStep(2)}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget && deleteStep === 2}
        title="Point of no return"
        message={
          <>
            This permanently erases{" "}
            <span className="font-semibold text-ink">
              {deleteTarget?.fullName}
            </span>
            .
          </>
        }
        challengeText={deleteTarget?.fullName ?? ""}
        confirmLabel="Delete forever"
        busy={deleting}
        onConfirm={onHardDelete}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteStep(1);
        }}
      />
    </>
  );
}
