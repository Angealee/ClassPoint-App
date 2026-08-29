import { IconButton } from '@/components/ui/IconButton'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { ArrowLeftIcon, CheckIcon, PlusIcon, TrashIcon } from '@/components/ui/icons'
import {
  createSemester,
  createSubject,
  deleteSubject,
  listSemesters,
  setSectionSubjects,
  updateSemesterTerm,
  updateSubject,
} from '@/lib/api'
import { termLabel, weekOf } from '@/lib/term'
import type { Semester, TermKey } from '@/lib/types'
import { useInstructor } from './InstructorLayout'
import { SemesterRollover } from './SemesterRollover'

const TERM_ORDER: TermKey[] = ['prelim', 'midterm', 'finals']

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

/**
 * Semester setup: term dates, subjects, and which sections take which subject.
 *
 * Term dates are STORED rather than computed — six-week arithmetic is only the
 * default we seed, and real calendars move for holidays and suspensions. Editing
 * a date here re-labels every week and term chip in the instructor area.
 */
export function ManageSemesters() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { semester, subjects, sections, sectionSubjects, refreshSemester } = useInstructor()

  const [termDraft, setTermDraft] = useState<Record<string, { startsOn: string; endsOn: string }>>(
    {},
  )
  const [busy, setBusy] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string>()
  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string }>()

  // Seed the date inputs from the semester whenever it (re)loads.
  useEffect(() => {
    if (!semester) return
    const draft: Record<string, { startsOn: string; endsOn: string }> = {}
    for (const t of semester.terms) draft[t.term] = { startsOn: t.startsOn, endsOn: t.endsOn }
    setTermDraft(draft)
  }, [semester])

  const currentWeek = useMemo(() => weekOf(new Date()), [semester])

  if (!semester) {
    return (
      <div className="space-y-4 pb-4">
        <BackLink onClick={() => navigate('/teach')} />
        <Card className="p-5 text-sm text-muted">
          No active semester yet. Run migration 0027 to set one up.
        </Card>
      </div>
    )
  }

  async function saveTerm(term: TermKey) {
    const draft = termDraft[term]
    if (!semester || !draft) return
    if (draft.endsOn < draft.startsOn) {
      toast('The end date can’t come before the start date.', 'error')
      return
    }
    setBusy(true)
    try {
      await updateSemesterTerm(semester.id, term, draft.startsOn, draft.endsOn)
      await refreshSemester()
      toast(`${termLabel(term)} dates saved.`, 'success')
    } catch {
      toast('Could not save those dates.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onAddSubject(e: FormEvent) {
    e.preventDefault()
    const code = newCode.trim()
    const name = newName.trim()
    if (!code || !name || !semester) return
    setBusy(true)
    try {
      await createSubject(semester.id, code, name)
      await refreshSemester()
      setNewCode('')
      setNewName('')
      toast(`${code} added.`, 'success')
    } catch {
      toast('Could not add — is that code already used this semester?', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onSaveSubject(id: string) {
    const code = editCode.trim()
    const name = editName.trim()
    if (!code || !name) return
    setBusy(true)
    try {
      await updateSubject(id, code, name)
      await refreshSemester()
      setEditingId(undefined)
    } catch {
      toast('Could not save — is that code already used?', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteSubject(id: string) {
    setBusy(true)
    try {
      await deleteSubject(id)
      await refreshSemester()
      toast('Subject removed.', 'success')
    } catch {
      toast('Could not remove that subject.', 'error')
    } finally {
      setBusy(false)
      setDeleteTarget(undefined)
    }
  }

  /** Tick/untick one subject for one section. */
  async function toggleAssignment(sectionId: string, subjectId: string) {
    const current = sectionSubjects[sectionId] ?? []
    const next = current.includes(subjectId)
      ? current.filter((id) => id !== subjectId)
      : [...current, subjectId]
    setBusy(true)
    try {
      await setSectionSubjects(sectionId, next)
      await refreshSemester()
    } catch {
      toast('Could not update that assignment.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5 pb-4">
      <BackLink onClick={() => navigate('/teach')} />

      <div>
        <h1 className="font-display text-xl font-bold">{semester.name}</h1>
        <p className="text-sm text-muted">
          Started {longDate(semester.startsOn)} · currently week {currentWeek}
        </p>
      </div>

      {/* ── Rollover (Phase I) ─────────────────────────────────────────── */}
      <RolloverPanel />

      {/* ── Term dates ─────────────────────────────────────────────────── */}
      <Card className="p-4">
        <h2 className="font-display text-base font-bold">Term dates</h2>
        <p className="mt-0.5 text-sm text-muted">
          Six weeks each by default. Move them when a holiday or suspension shifts the
          calendar — attendance re-tags itself.
        </p>
        <div className="mt-3 space-y-3">
          {TERM_ORDER.map((term) => {
            const draft = termDraft[term]
            const saved = semester.terms.find((t) => t.term === term)
            const dirty =
              !!draft && !!saved && (draft.startsOn !== saved.startsOn || draft.endsOn !== saved.endsOn)
            return (
              <div key={term} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold">{termLabel(term)}</span>
                  {dirty && (
                    <Button size="sm" disabled={busy} onClick={() => saveTerm(term)}>
                      <CheckIcon className="h-4 w-4" /> Save
                    </Button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input
                    label="Starts"
                    type="date"
                    value={draft?.startsOn ?? ''}
                    disabled={busy}
                    onChange={(e) =>
                      setTermDraft((d) => ({
                        ...d,
                        [term]: { startsOn: e.target.value, endsOn: d[term]?.endsOn ?? '' },
                      }))
                    }
                  />
                  <Input
                    label="Ends"
                    type="date"
                    value={draft?.endsOn ?? ''}
                    disabled={busy}
                    onChange={(e) =>
                      setTermDraft((d) => ({
                        ...d,
                        [term]: { startsOn: d[term]?.startsOn ?? '', endsOn: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Subjects ───────────────────────────────────────────────────── */}
      <Card className="p-4">
        <h2 className="font-display text-base font-bold">Subjects</h2>
        <p className="mt-0.5 text-sm text-muted">
          What you teach this semester. Attendance is tracked per subject; points stay one
          shared pool.
        </p>

        <ul className="mt-3 space-y-2">
          {subjects.map((subject) => (
            <li key={subject.id} className="rounded-xl border border-line p-3">
              {editingId === subject.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Code"
                      value={editCode}
                      disabled={busy}
                      onChange={(e) => setEditCode(e.target.value)}
                    />
                    <Input
                      label="Name"
                      value={editName}
                      disabled={busy}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => onSaveSubject(subject.id)}>
                      <CheckIcon className="h-4 w-4" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(undefined)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setEditingId(subject.id)
                      setEditCode(subject.code)
                      setEditName(subject.name)
                    }}
                  >
                    <span className="block font-display text-sm font-bold">{subject.code}</span>
                    <span className="block truncate text-xs text-muted">{subject.name}</span>
                  </button>
                                    <IconButton
                    label={`Remove ${subject.code}`}
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      setDeleteTarget({
                        id: subject.id,
                        label: `${subject.code} · ${subject.name}`,
                      })
                    }
                    icon={<TrashIcon className="h-4 w-4" />}
                  />
                </div>
              )}
            </li>
          ))}
          {subjects.length === 0 && (
            <li className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">
              No subjects yet — add one below.
            </li>
          )}
        </ul>

        <form onSubmit={onAddSubject} className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Code"
              value={newCode}
              disabled={busy}
              placeholder="e.g. IT 32"
              onChange={(e) => setNewCode(e.target.value)}
            />
            <Input
              label="Name"
              value={newName}
              disabled={busy}
              placeholder="e.g. Platform Technologies"
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" disabled={busy || !newCode.trim() || !newName.trim()}>
            <PlusIcon className="h-4 w-4" /> Add subject
          </Button>
        </form>
      </Card>

      {/* ── Section × subject assignments ──────────────────────────────── */}
      <Card className="p-4">
        <h2 className="font-display text-base font-bold">Who takes what</h2>
        <p className="mt-0.5 text-sm text-muted">
          Tick the subjects each section takes. Session pickers only offer what’s ticked here.
        </p>

        <div className="mt-3 space-y-3">
          {sections.map((section) => {
            const assigned = sectionSubjects[section.id] ?? []
            return (
              <div key={section.id} className="rounded-xl border border-line p-3">
                <span className="font-display text-sm font-bold">{section.name}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {subjects.map((subject) => {
                    const on = assigned.includes(subject.id)
                    return (
                      <button
                        key={subject.id}
                        type="button"
                        disabled={busy}
                        aria-pressed={on}
                        onClick={() => toggleAssignment(section.id, subject.id)}
                        className={
                          on
                            ? 'flex items-center gap-1.5 rounded-lg border border-brand-500 bg-brand-500/10 px-2.5 py-1.5 text-xs font-semibold text-brand-500'
                            : 'flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink'
                        }
                      >
                        {on && <CheckIcon className="h-3.5 w-3.5" />}
                        {subject.code}
                      </button>
                    )
                  })}
                  {subjects.length === 0 && (
                    <span className="text-xs text-muted">Add a subject first.</span>
                  )}
                </div>
              </div>
            )
          })}
          {sections.length === 0 && (
            <p className="text-sm text-muted">No sections in this semester yet.</p>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove this subject?"
        message={
          deleteTarget
            ? `${deleteTarget.label} will be removed from this semester. Past sessions keep their records but become untagged, and you can re-tag them from Class history.`
            : ''
        }
        confirmLabel="Remove"
        busy={busy}
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={() => deleteTarget && onDeleteSubject(deleteTarget.id)}
      />
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
    >
      <ArrowLeftIcon className="h-4 w-4" /> Students
    </button>
  )
}

/**
 * Rollover entry point (Phase I).
 *
 * Lists semesters that exist but aren't active. Creating one does NOT switch to
 * it — you build it out first and activate at the end of the wizard, which is
 * what makes the whole thing safe to do gradually in the weeks before a term
 * ends rather than in one nervous sitting.
 */
function RolloverPanel() {
  const { semester, refreshSemester } = useInstructor()
  const { toast } = useToast()
  const [others, setOthers] = useState<Semester[]>([])
  const [building, setBuilding] = useState<Semester | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const all = await listSemesters()
      setOthers(all.filter((s) => !s.isActive))
    } catch {
      /* non-fatal — the panel just stays empty */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !startsOn) return
    setBusy(true)
    try {
      const created = await createSemester(name.trim(), startsOn)
      toast(`${created.name} created. It isn't active yet.`, 'success')
      setName('')
      setStartsOn('')
      setCreating(false)
      await load()
      setBuilding(created)
    } catch {
      toast('Could not create that semester — is the name already used?', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (building) {
    return (
      <Card className="p-4">
        <button
          type="button"
          onClick={() => setBuilding(null)}
          className="mb-3 text-xs font-semibold text-muted hover:text-ink"
        >
          ‹ Back to semesters
        </button>
        <SemesterRollover
          semester={building}
          onDone={() => {
            setBuilding(null)
            void refreshSemester()
            void load()
          }}
        />
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <h2 className="font-display text-base font-bold">Next semester</h2>
      <p className="mt-0.5 text-sm text-muted">
        Build it ahead of time. Nothing changes for students until you activate it.
      </p>

      {others.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {others.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted">Starts {longDate(s.startsOn)} · not active</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setBuilding(s)}>
                Set up
              </Button>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <form onSubmit={create} className="mt-3 space-y-3">
          <Input
            label="Semester name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="2nd Sem AY 2026–2027"
            required
          />
          <Input
            label="First day"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            hint="A Monday — week 1 is anchored here. Terms are seeded six weeks apart and stay editable."
            required
          />
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={busy}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" className="mt-3 w-full" onClick={() => setCreating(true)}>
          <PlusIcon className="h-4 w-4" /> New semester
        </Button>
      )}

      {semester && (
        <p className="mt-3 text-xs text-muted">
          Currently active: <span className="font-semibold text-ink">{semester.name}</span>
        </p>
      )}
    </Card>
  )
}
