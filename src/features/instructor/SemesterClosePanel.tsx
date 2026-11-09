import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { CheckIcon } from '@/components/ui/icons'
import {
  archiveSemesterStudents,
  getSemesterClosePreview,
  listSemesters,
  setSemesterFarewell,
} from '@/lib/api'
import { errorText } from '@/lib/errors'
import { ArchivedFarewell } from '@/features/student/ArchivedFarewell'
import { ArchivedStudentsSheet } from './ArchivedStudentsSheet'
import type { Semester, SemesterCloseRow } from '@/lib/types'

/** Mirrors semesters_farewell_message_check. */
const MESSAGE_MAX = 400

/**
 * Closing a semester: the send-off, then the archive.
 *
 * ── WHY THIS IS NOT IN THE ROLLOVER WIZARD ──────────────────────────────────
 * Closing last semester and building the next are two jobs, and the wizard is
 * resumable precisely because it commits as you go — a destructive bulk archive
 * does not belong on that path. More practically: the wizard's step 3 archives
 * the UNTICKED students of the ONE section currently selected in its `From`
 * dropdown, so closing a semester through it meant repeating a confirm dialog
 * once per section and hoping you had not missed one.
 *
 * ── WHY IT HAS ITS OWN SEMESTER PICKER ──────────────────────────────────────
 * The obvious shape is "close the semester this screen is about", i.e. the
 * active one. But the instructor may well activate the new semester FIRST and
 * only then think to archive the old batch — and at that moment the semester
 * they want is no longer `useInstructor().semester`, so a panel scoped to the
 * active semester could not reach it at all. The picker costs one control and
 * works in either order.
 *
 * It defaults to the active semester, which is the common case.
 */
export function SemesterClosePanel() {
  const { toast } = useToast()

  const [semesters, setSemesters] = useState<Semester[]>([])
  const [pick, setPick] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const [draft, setDraft] = useState('')
  const [savingMessage, setSavingMessage] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const [rows, setRows] = useState<SemesterCloseRow[] | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [closing, setClosing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await listSemesters()
      setSemesters(list)
      setPick((current) => current || (list.find((s) => s.isActive)?.id ?? list[0]?.id ?? ''))
    } catch {
      // Soft: the rest of the Semesters screen still works without this panel.
      toast('Could not load semesters.', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const semester = useMemo(
    () => semesters.find((s) => s.id === pick) ?? null,
    [semesters, pick],
  )

  // Re-seed the editor whenever the chosen semester changes, and DISCARD the
  // close preview with it: a list of names that belongs to a different semester
  // is the one thing on this panel that could cause real harm.
  useEffect(() => {
    setDraft(semester?.farewellMessage ?? '')
    setRows(null)
  }, [semester])

  const stored = semester?.farewellMessage ?? ''
  const dirty = draft.trim() !== stored.trim()
  const over = draft.trim().length > MESSAGE_MAX

  async function saveMessage() {
    if (!semester || over) return
    setSavingMessage(true)
    try {
      await setSemesterFarewell(semester.id, draft)
      await load()
      toast('Message saved.', 'success')
    } catch (e) {
      toast(errorText(e, 'Could not save that message.'), 'error')
    } finally {
      setSavingMessage(false)
    }
  }

  async function runPreview() {
    if (!semester) return
    setPreviewing(true)
    try {
      setRows(await getSemesterClosePreview(semester.id))
    } catch (e) {
      toast(errorText(e, 'Could not check who would be archived.'), 'error')
    } finally {
      setPreviewing(false)
    }
  }

  async function close() {
    if (!semester) return
    setClosing(true)
    try {
      const n = await archiveSemesterStudents(semester.id)
      toast(
        n === 0
          ? 'Nobody left to archive in that semester.'
          : `Archived ${n} student${n === 1 ? '' : 's'}.`,
        n === 0 ? 'info' : 'success',
      )
      setConfirmOpen(false)
      setRows(null)
      await load()
    } catch (e) {
      toast(errorText(e, 'Could not close that semester.'), 'error')
    } finally {
      setClosing(false)
    }
  }

  const sectionCount = useMemo(
    () => new Set((rows ?? []).map((r) => r.sectionName)).size,
    [rows],
  )

  return (
    <Card className="p-4">
      <h2 className="font-display text-base font-bold">Close a semester</h2>
      <p className="mt-0.5 text-sm text-muted">
        Archive everyone who was in it, and leave them a message. Their record, points
        and badges are kept — nothing is deleted.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      ) : semesters.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No semesters yet.</p>
      ) : (
        <>
          <Select
            label="Which semester"
            className="mt-3"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isActive ? ' (active)' : ''}
              </option>
            ))}
          </Select>

          {/* ── The send-off ──────────────────────────────────────────────── */}
          <div className="mt-4 rounded-xl border border-line p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-sm font-bold">Farewell message</p>
                <p className="mt-0.5 text-xs text-muted">
                  Shown full-screen, on every sign-in, to anyone archived out of this
                  semester. Leave it blank for a plain send-off.
                </p>
              </div>
              <Chip tone={over ? 'danger' : 'neutral'} size="sm">
                {draft.trim().length}/{MESSAGE_MAX}
              </Chip>
            </div>

            <Textarea
              className="mt-3"
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Thanks for a good semester. Go and be excellent."
              error={over ? `Keep it under ${MESSAGE_MAX} characters.` : undefined}
            />

            <div className="mt-2 flex gap-2">
              {/* The real component, not a mock-up: there is exactly one
                  definition of what the student sees, so this cannot drift
                  from it. */}
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => setPreviewOpen(true)}
              >
                Preview
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={!dirty || over}
                loading={savingMessage}
                onClick={() => void saveMessage()}
              >
                <CheckIcon className="h-4 w-4" /> Save
              </Button>
            </div>
          </div>

          {/* ── The archive ───────────────────────────────────────────────── */}
          <div className="mt-4 rounded-xl border border-danger/40 bg-danger-solid/5 p-3">
            <p className="font-display text-sm font-bold text-danger">Archive everyone</p>
            <p className="mt-0.5 text-xs text-muted">
              Every active student whose section belongs to {semester?.name ?? 'this semester'}.
              They disappear from rosters and the leaderboard, and can be restored into a
              section later.
            </p>

            {rows === null ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                loading={previewing}
                onClick={() => void runPreview()}
              >
                Check who that is
              </Button>
            ) : rows.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Nobody to archive — every student in that semester is already archived, or
                it has no sections with students in them.
              </p>
            ) : (
              <>
                <p className="mt-3 text-sm">
                  <span className="font-display font-bold">{rows.length}</span> student
                  {rows.length === 1 ? '' : 's'} across{' '}
                  <span className="font-display font-bold">{sectionCount}</span> section
                  {sectionCount === 1 ? '' : 's'}.
                </p>
                {/* Behind a disclosure: 200 names is not a thing to scroll past
                    on the way to a button, but a count you cannot check is a
                    count you learn to tap through. */}
                <details className="mt-2">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-muted">
                    See the names
                  </summary>
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-muted">
                    {rows.map((r) => (
                      <li key={r.studentId} className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-ink">{r.fullName}</span>
                        <span className="shrink-0">{r.sectionName}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                <Button
                  size="sm"
                  variant="danger"
                  className="mt-3 w-full"
                  onClick={() => setConfirmOpen(true)}
                >
                  Close {semester?.name}
                </Button>
              </>
            )}
          </div>
        </>
      )}

      {/* The typed-name challenge, same as hard-delete and activation. */}
      <ConfirmDialog
        open={confirmOpen}
        title="Archive everyone in this semester?"
        message={
          <>
            {rows?.length ?? 0} student{(rows?.length ?? 0) === 1 ? '' : 's'} will be
            archived out of{' '}
            <span className="font-semibold text-ink">{semester?.name}</span>.
          </>
        }
        detail={
          <>
            They keep their points, badges, attendance and all-time total, and they can be
            restored into a section later. They disappear from every roster and from the
            leaderboard, and the next time they sign in they see your farewell message and
            their final standing instead of the app.
          </>
        }
        confirmLabel="Archive everyone"
        challengeText={semester?.name}
        busy={closing}
        onConfirm={() => void close()}
        onClose={() => setConfirmOpen(false)}
      />

      {/* ── The other half: students coming BACK ───────────────────────────
          Here rather than on the roster, because the roster's own archive
          drawer is scoped to ONE section and every semester-closed student is
          in a section that is no longer in this semester's list. Returning
          students are a rollover concern, so the control lives with the
          rollover. No sectionId = the whole archive. */}
      <button
        type="button"
        onClick={() => setArchiveOpen(true)}
        className="mt-4 w-full rounded-xl border border-line px-3 py-2.5 text-left text-sm transition-colors hover:bg-card-2"
      >
        <span className="font-semibold">Returning students</span>
        <span className="mt-0.5 block text-xs text-muted">
          Restore someone from any past semester into a section of this one.
        </span>
      </button>

      <ArchivedStudentsSheet
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onChanged={() => void load()}
      />

      {previewOpen && (
        <ArchivedFarewell
          semesterName={semester?.name ?? null}
          message={draft.trim() === '' ? null : draft}
          onDone={() => setPreviewOpen(false)}
        />
      )}
    </Card>
  )
}
