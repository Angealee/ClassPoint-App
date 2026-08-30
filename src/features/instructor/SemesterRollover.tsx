import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { ListSkeleton } from '@/components/ui/Skeleton'
import {
  archiveStudents,
  createSection,
  createSubject,
  getRolloverPreflight,
  listSections,
  listStudents,
  listSubjects,
  promoteStudents,
  setActiveSemester,
  setSectionSubjects,
} from '@/lib/api'
import { errorText } from '@/lib/errors'
import { cn } from '@/lib/cn'
import type { RolloverCheck, Section, SectionStudent, Semester, Subject } from '@/lib/types'
import { useInstructor } from './InstructorLayout'

type Step = 'sections' | 'subjects' | 'promote' | 'activate'

const STEPS: { key: Step; label: string }[] = [
  { key: 'sections', label: 'Sections' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'promote', label: 'Students' },
  { key: 'activate', label: 'Activate' },
]

/**
 * The rollover wizard (Phase I).
 *
 * Resumable by construction: every step COMMITS as you go — sections and
 * subjects are real rows the moment you add them, promotions move students
 * immediately. Nothing is staged in memory waiting for a final Save, so closing
 * the tab halfway loses nothing and reopening picks up where you were.
 *
 * The last step is the only irreversible one, and it's the only one behind a
 * typed-name challenge.
 *
 * @param semester The NEW semester being built (already created, not yet active).
 */
export function SemesterRollover({
  semester,
  onDone,
}: {
  semester: Semester
  onDone: () => void
}) {
  const { toast } = useToast()
  const [step, setStep] = useState<Step>('sections')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold">Set up {semester.name}</h2>
        <p className="text-sm text-muted">
          Each step saves as you go — you can leave and come back.
        </p>
      </div>

      {/* Step rail. Steps are freely navigable: this is a checklist, not a
          funnel, and an instructor mid-rollover often needs to go back. */}
      <div className="flex gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(s.key)}
            className={cn(
              'flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors',
              step === s.key ? 'bg-accent-solid text-white' : 'bg-card-2 text-muted hover:text-ink',
            )}
          >
            {i + 1}. {s.label}
          </button>
        ))}
      </div>

      {step === 'sections' && <SectionsStep semester={semester} onNext={() => setStep('subjects')} />}
      {step === 'subjects' && <SubjectsStep semester={semester} onNext={() => setStep('promote')} />}
      {step === 'promote' && <PromoteStep semester={semester} onNext={() => setStep('activate')} />}
      {step === 'activate' && (
        <ActivateStep
          semester={semester}
          onDone={() => {
            toast(`${semester.name} is now active.`, 'success')
            onDone()
          }}
        />
      )}
    </div>
  )
}

/* ── Step 1: sections ────────────────────────────────────────────────────── */

function SectionsStep({ semester, onNext }: { semester: Semester; onNext: () => void }) {
  const { toast } = useToast()
  const [sections, setSections] = useState<Section[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setSections(await listSections(semester.id))
    } catch (e) {
      toast(errorText(e, "Couldn't load sections."), 'error')
    } finally {
      setLoading(false)
    }
  }, [semester.id, toast])

  useEffect(() => {
    void load()
  }, [load])

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await createSection(name.trim(), semester.id)
      setName('')
      await load()
    } catch (e) {
      toast(errorText(e, "Couldn't create that section."), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">Sections for {semester.name}</h3>
      {/* Names start BLANK by the instructor's choice — no carried-forward or
          year-bumped suggestion. A wrong suggestion here creates a real section
          rather than failing, and mid-year vs. new-year want opposite defaults. */}
      <p className="mb-3 mt-0.5 text-xs text-muted">
        Name them yourself. A section name only has to be unique within this
        semester, so reusing last semester's names is fine.
      </p>

      <div className="mb-3 flex gap-2">
        <Input
          label=""
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. BSIT 2A"
          className="flex-1"
        />
        <Button className="shrink-0 self-end" disabled={busy || !name.trim()} onClick={() => void add()}>
          Add
        </Button>
      </div>

      {loading ? (
        <ListSkeleton rows={2} />
      ) : sections.length === 0 ? (
        <p className="text-sm text-muted">No sections yet. Add at least one to continue.</p>
      ) : (
        <ul className="divide-y divide-line">
          {sections.map((s) => (
            <li key={s.id} className="py-2 text-sm">
              {s.name}
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" className="mt-4 w-full" disabled={sections.length === 0} onClick={onNext}>
        Next — subjects
      </Button>
    </Card>
  )
}

/* ── Step 2: subjects ────────────────────────────────────────────────────── */

function SubjectsStep({ semester, onNext }: { semester: Semester; onNext: () => void }) {
  const { subjects: currentSubjects } = useInstructor()
  const { toast } = useToast()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [subs, secs] = await Promise.all([listSubjects(semester.id), listSections(semester.id)])
      setSubjects(subs)
      setSections(secs)
    } catch (e) {
      toast(errorText(e, "Couldn't load subjects."), 'error')
    } finally {
      setLoading(false)
    }
  }, [semester.id, toast])

  useEffect(() => {
    void load()
  }, [load])

  async function add(subCode: string, subName: string) {
    if (!subCode.trim() || !subName.trim()) return
    setBusy(true)
    try {
      await createSubject(semester.id, subCode.trim(), subName.trim())
      setCode('')
      setName('')
      await load()
    } catch (e) {
      toast(errorText(e, "Couldn't create that subject."), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(sectionId: string, subjectId: string) {
    const cur = assignments[sectionId] ?? []
    const next = cur.includes(subjectId)
      ? cur.filter((x) => x !== subjectId)
      : [...cur, subjectId]
    setAssignments((a) => ({ ...a, [sectionId]: next }))
    try {
      await setSectionSubjects(sectionId, next)
    } catch (e) {
      toast(errorText(e, "Couldn't save that assignment."), 'error')
      setAssignments((a) => ({ ...a, [sectionId]: cur }))
    }
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">Subjects</h3>
      <p className="mb-3 mt-0.5 text-xs text-muted">
        Subjects belong to a semester, so these are new rows even if the codes
        repeat. Copy last semester's or write new ones.
      </p>

      {/* One-tap copy from the semester that's ending — the common case. */}
      {currentSubjects.length > 0 && subjects.length === 0 && (
        <div className="mb-3 rounded-xl bg-card-2 p-3">
          <p className="mb-2 text-xs text-muted">Carry over from the current semester:</p>
          <div className="flex flex-wrap gap-1.5">
            {currentSubjects.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => void add(s.code, s.name)}
                className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium hover:bg-card"
              >
                + {s.code}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3 flex gap-2">
        <Input
          label=""
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="IT 32"
          className="w-28 shrink-0"
        />
        <Input
          label=""
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Platform Technologies"
          className="flex-1"
        />
        <Button
          className="shrink-0 self-end"
          disabled={busy || !code.trim() || !name.trim()}
          onClick={() => void add(code, name)}
        >
          Add
        </Button>
      </div>

      {loading ? (
        <ListSkeleton rows={2} />
      ) : subjects.length === 0 ? (
        <p className="text-sm text-muted">No subjects yet.</p>
      ) : (
        <div className="space-y-3">
          {sections.map((sec) => (
            <div key={sec.id}>
              <p className="mb-1 text-xs font-semibold">{sec.name} takes:</p>
              <div className="flex flex-wrap gap-1.5">
                {subjects.map((sub) => {
                  const on = (assignments[sec.id] ?? []).includes(sub.id)
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => void toggle(sec.id, sub.id)}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                        on ? 'bg-accent-solid text-white' : 'bg-card-2 text-muted hover:text-ink',
                      )}
                    >
                      {sub.code}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" className="mt-4 w-full" onClick={onNext}>
        Next — students
      </Button>
    </Card>
  )
}

/* ── Step 3: promote ─────────────────────────────────────────────────────── */

function PromoteStep({ semester, onNext }: { semester: Semester; onNext: () => void }) {
  const { sections: oldSections } = useInstructor()
  const { toast } = useToast()
  const [newSections, setNewSections] = useState<Section[]>([])
  const [sourceId, setSourceId] = useState('')
  const [roster, setRoster] = useState<SectionStudent[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [targetId, setTargetId] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    listSections(semester.id)
      .then((s) => {
        setNewSections(s)
        setTargetId((cur) => cur || (s[0]?.id ?? ''))
      })
      .catch(() => {})
  }, [semester.id])

  useEffect(() => {
    if (!oldSections.length) return
    setSourceId((cur) => cur || oldSections[0].id)
  }, [oldSections])

  const loadRoster = useCallback(async () => {
    if (!sourceId) return
    setLoading(true)
    try {
      const list = await listStudents(sourceId)
      setRoster(list)
      // Default: everyone moves. The plan's "default all" — the common case is
      // a whole cohort continuing, and unticking a few is less work than
      // ticking thirty.
      setPicked(new Set(list.map((s) => s.id)))
    } catch (e) {
      toast(errorText(e, "Couldn't load that roster."), 'error')
    } finally {
      setLoading(false)
    }
  }, [sourceId, toast])

  useEffect(() => {
    void loadRoster()
  }, [loadRoster])

  async function promote() {
    if (!targetId || picked.size === 0) return
    setBusy(true)
    try {
      const n = await promoteStudents([...picked], targetId)
      toast(`Moved ${n} student${n === 1 ? '' : 's'}.`, 'success')
      await loadRoster()
    } catch (e) {
      toast(errorText(e, "Couldn't promote those students."), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function archiveUnpicked() {
    const leftover = roster.filter((s) => !picked.has(s.id)).map((s) => s.id)
    if (leftover.length === 0) return
    setBusy(true)
    try {
      const n = await archiveStudents(leftover)
      toast(`Archived ${n} student${n === 1 ? '' : 's'}.`, 'success')
      await loadRoster()
    } catch (e) {
      toast(errorText(e, "Couldn't archive those students."), 'error')
    } finally {
      setBusy(false)
      setConfirmArchive(false)
    }
  }

  const unpickedCount = roster.length - picked.size

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">Move students in</h3>
      <p className="mb-3 mt-0.5 text-xs text-muted">
        Everyone keeps their account, username, PIN and achievements. Only their
        section changes.
      </p>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium" htmlFor="ro-from">
            From
          </label>
          <select
            id="ro-from"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="w-full rounded-xl border border-line bg-card px-3 py-2 text-base"
          >
            {oldSections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" htmlFor="ro-to">
            To
          </label>
          <select
            id="ro-to"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-xl border border-line bg-card px-3 py-2 text-base"
          >
            {newSections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : roster.length === 0 ? (
        <p className="text-sm text-muted">
          Nobody left in this section — they've all been moved or archived.
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted">
              {picked.size} of {roster.length} selected
            </span>
            <button
              type="button"
              className="font-semibold text-accent"
              onClick={() =>
                setPicked((p) =>
                  p.size === roster.length ? new Set() : new Set(roster.map((s) => s.id)),
                )
              }
            >
              {picked.size === roster.length ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <ul className="max-h-64 divide-y divide-line overflow-y-auto">
            {roster.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() =>
                    setPicked((p) => {
                      const next = new Set(p)
                      if (next.has(s.id)) next.delete(s.id)
                      else next.add(s.id)
                      return next
                    })
                  }
                  className="flex w-full items-center gap-2.5 py-2 text-left"
                >
                  <span
                    className={cn(
                      'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border text-2xs',
                      picked.has(s.id)
                        ? 'border-accent-solid bg-accent-solid text-white'
                        : 'border-line',
                    )}
                  >
                    {picked.has(s.id) ? '✓' : ''}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{s.full_name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {s.lifetime_points} all-time
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <Button
            className="mt-3 w-full"
            disabled={busy || picked.size === 0 || !targetId}
            onClick={() => void promote()}
          >
            {busy ? 'Moving…' : `Move ${picked.size} to ${newSections.find((s) => s.id === targetId)?.name ?? '—'}`}
          </Button>

          {unpickedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full text-muted"
              disabled={busy}
              onClick={() => setConfirmArchive(true)}
            >
              Archive the {unpickedCount} not selected
            </Button>
          )}
        </>
      )}

      <Button variant="outline" className="mt-4 w-full" onClick={onNext}>
        Next — activate
      </Button>

      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        onConfirm={() => void archiveUnpicked()}
        busy={busy}
        title={`Archive ${unpickedCount} student${unpickedCount === 1 ? '' : 's'}?`}
        message="They keep their record and can be restored later, but they disappear from rosters and the leaderboard."
        detail="Use this for students who dropped, transferred or graduated."
        confirmLabel="Archive them"
      />
    </Card>
  )
}

/* ── Step 4: activate ────────────────────────────────────────────────────── */

function ActivateStep({ semester, onDone }: { semester: Semester; onDone: () => void }) {
  const { toast } = useToast()
  const [checks, setChecks] = useState<RolloverCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setChecks(await getRolloverPreflight(semester.id))
    } catch (e) {
      toast(errorText(e, "Couldn't run the pre-flight."), 'error')
    } finally {
      setLoading(false)
    }
  }, [semester.id, toast])

  useEffect(() => {
    void load()
  }, [load])

  const blockers = useMemo(() => checks.filter((c) => c.severity === 'block'), [checks])
  const warnings = useMemo(() => checks.filter((c) => c.severity === 'warn'), [checks])

  async function activate() {
    setBusy(true)
    try {
      const n = await setActiveSemester(semester.id)
      toast(`${semester.name} activated · ${n} students carried over.`, 'success')
      onDone()
    } catch (e) {
      // The server re-runs the blocking checks, so this is where a stale UI
      // gets corrected — surface the reason verbatim and re-read the list.
      toast(errorText(e, "Couldn't activate that semester."), 'error')
      void load()
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold">Activate {semester.name}</h3>
      <p className="mb-3 mt-0.5 text-xs text-muted">
        This resets everyone's points, level and rank for the new semester.
        All-time totals and achievements are untouched.
      </p>

      {loading ? (
        <ListSkeleton rows={3} />
      ) : (
        <>
          {blockers.map((c) => (
            <div key={c.code} className="mb-2 rounded-xl bg-accent-solid/10 px-3 py-2">
              <p className="text-xs font-semibold text-accent">
                {c.count > 0 ? `${c.count} · ` : ''}
                {c.detail}
              </p>
            </div>
          ))}
          {warnings.map((c) => (
            <div key={c.code} className="mb-2 rounded-xl bg-gold-400/15 px-3 py-2">
              <p className="text-xs text-reward">
                {c.count > 0 ? `${c.count} · ` : ''}
                {c.detail}
              </p>
            </div>
          ))}
          {checks.length === 0 && (
            <p className="mb-2 rounded-xl bg-success-solid/10 px-3 py-2 text-xs text-success">
              Everything checks out.
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => void load()}>
              Re-check
            </Button>
            <Button
              className="flex-1"
              disabled={busy || blockers.length > 0}
              onClick={() => setConfirm(true)}
            >
              Activate
            </Button>
          </div>
          {blockers.length > 0 && (
            <p className="mt-2 text-center text-xs text-muted">
              Clear the red items first.
            </p>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void activate()}
        busy={busy}
        title={`Activate ${semester.name}?`}
        message="Every student's points, level and rank reset to zero for the new semester. Their all-time totals, achievements, usernames and PINs are untouched."
        detail={
          warnings.find((w) => w.code === 'unplaced')
            ? `${warnings.find((w) => w.code === 'unplaced')?.count} student(s) are not in this semester — they become read-only. This cannot be undone from the app.`
            : 'This cannot be undone from the app.'
        }
        // The same typed-name challenge that gates hard-deleting a student.
        // This is a bigger action than that one.
        challengeText={semester.name}
        confirmLabel="Activate semester"
      />
    </Card>
  )
}
