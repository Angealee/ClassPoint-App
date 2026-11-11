import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { Meter } from '@/components/ui/Meter'
import { StickyBar } from '@/components/ui/StickyBar'
import { useToast } from '@/components/ui/Toast'
import {
  clearGradeAbsences,
  clearGradeScores,
  getGradeAbsences,
  getGradeAttendance,
  listGradeBoosts,
  listGradeItems,
  listGradePolicies,
  listGradeScores,
  listRosterBasics,
  getSectionGradeSums,
  saveGradeAbsences,
  saveGradeScores,
} from '@/lib/api'
import {
  cellKey,
  completionByTerm,
  defaultPolicy,
  orderedItems,
  policyError,
  subjectPolicyError,
} from '@/lib/grading'
import { cn } from '@/lib/cn'
import { errorText } from '@/lib/errors'
import { writeGradeScope } from '@/lib/grade-scope'
import { parseScoreInput } from '@/lib/grade-entry'
import { writeFor, type AbsentSource, type CellState } from '@/lib/grade-cell'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { GradeGrid, type CellEdit } from './GradeGrid'
import { OverallTable } from './OverallTable'
import { GradeItemEntry } from './GradeItemEntry'
import { GradeSetupSheet } from './GradeSetupSheet'
import { GradeImportSheet } from './GradeImportSheet'
import { useInstructor } from './InstructorLayout'
import type {
  GradeAttendance,
  GradeBoost,
  GradeItem,
  GradePolicy,
  GradeSumsRow,
  GradeView,
  RosterPerson,
  TermKey,
} from '@/lib/types'

const TERMS: TermKey[] = ['prelim', 'midterm', 'finals']
const TERM_LABEL: Record<TermKey, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

/** How long typing settles before a batch goes out. */
const FLUSH_MS = 600

const VIEW_KEY = 'cp_grade_view_v1'

/**
 * The fourth tab is not a term.
 *
 * `overall` rides the same `:term` segment so one route serves all four views —
 * which keeps every one of them a real deep link, and keeps `routeWidth` able
 * to decide the width from `pathname` alone.
 */
type SheetTab = TermKey | 'overall'
const TABS: SheetTab[] = [...TERMS, 'overall']
const TAB_LABEL: Record<SheetTab, string> = { ...TERM_LABEL, overall: 'Overall' }

function isTab(value: string | undefined): value is SheetTab {
  return (
    value === 'prelim' || value === 'midterm' || value === 'finals' || value === 'overall'
  )
}

/**
 * One section's grade sheet for one subject and one term.
 *
 * The scope is in the path rather than in state, so a sheet is a real deep link
 * and `Shell` can see from `pathname` alone that this route wants the full
 * width (see lib/routes-shape.ts).
 */
export function GradeSheet() {
  const { sectionId = '', subjectId = '', term: termParam } = useParams()
  const navigate = useNavigate()
  const { sections, subjects, subjectsForSection, semester } = useInstructor()
  const { toast } = useToast()
  const isDesktop = useIsDesktop()

  const tab: SheetTab = isTab(termParam) ? termParam : 'prelim'
  const isOverall = tab === 'overall'
  const term: TermKey = isOverall ? 'prelim' : tab
  const section = sections.find((s) => s.id === sectionId)
  const subject = subjects.find((s) => s.id === subjectId)

  const [students, setStudents] = useState<RosterPerson[]>([])
  const [items, setItems] = useState<GradeItem[]>([])
  const [policy, setPolicy] = useState<GradePolicy | null>(null)
  const [policies, setPolicies] = useState<GradePolicy[]>([])
  const [overallRows, setOverallRows] = useState<GradeSumsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [itemsOpen, setItemsOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  /**
   * The aggregate for ALL THREE terms, for the "how much is entered" read.
   *
   * Its own state and its own fetch, in its own try/catch — the 0034
   * SectionGrid precedent. Before 0057 is applied the call throws, and the
   * progress line simply does not render rather than taking the sheet with it.
   * It is also deliberately NOT `overallRows`: that one is term-filtered to
   * nothing only on the Overall tab, while this is needed on every tab.
   */
  const [allSums, setAllSums] = useState<GradeSumsRow[]>([])

  /**
   * Receipts for boosted marks (0062), keyed like the scores.
   *
   * Its own state and its own fetch, in its own try/catch — the same precedent
   * as `allSums`. Before 0062 the table does not exist, and that must cost the
   * corner dots and nothing else.
   *
   * Deliberately NOT part of `load`: they decorate cells and change when a
   * request is approved or reversed, not when a mark is typed, so reloading the
   * grid (and remounting every uncontrolled input) for them would be the wrong
   * trade.
   */
  const [boosts, setBoosts] = useState<Map<string, GradeBoost>>(() => new Map())

  const [view, setView] = useState<GradeView>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'official' ? 'official' : 'soFar'
    } catch {
      return 'soFar'
    }
  })

  // ── The authoritative score map ───────────────────────────────────────────
  // A ref, not state: the grid's rows own their own values while you type, and
  // re-rendering this screen on every keystroke is exactly what the row-local
  // state exists to avoid.
  const scoresRef = useRef(new Map<string, number>())
  // The same for Absent marks (0063): cellKey → why the cell reads A.
  const absencesRef = useRef(new Map<string, AbsentSource>())
  /**
   * Each student's attendance counts for the term on screen — RECITATION IS THIS
   * (0063). Loaded with the sheet, in its own catch: before 0063 the RPC does not
   * exist and that must cost the Recitation figure, never the grid.
   */
  const [attendance, setAttendance] = useState<Map<string, GradeAttendance>>(() => new Map())

  // What the editor was last built from. A SNAPSHOT in state rather than the
  // ref itself, so nothing reads a ref during render: the editor is seeded from
  // `scores` and remounted by `key`, and both move together. Anything that
  // changes values from outside the editor — a reload, undo, a pasted column —
  // writes the ref and then calls `rebuild`.
  const [grid, setGrid] = useState<{
    key: number
    scores: Map<string, number>
    absences: Map<string, AbsentSource>
  }>({
    key: 0,
    scores: new Map(),
    absences: new Map(),
  })
  const rebuild = useCallback(() => {
    setGrid((g) => ({
      key: g.key + 1,
      scores: new Map(scoresRef.current),
      absences: new Map(absencesRef.current),
    }))
  }, [])

  // ── The save queue ────────────────────────────────────────────────────────
  const pendingRef = useRef(new Map<string, CellEdit>())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dirty, setDirty] = useState(0)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [undoable, setUndoable] = useState<{ edit: CellEdit; previous: CellState } | null>(null)

  const load = useCallback(async () => {
    if (!sectionId || !subjectId) return
    setLoading(true)
    setLoadError(null)
    try {
      const policyRows = await listGradePolicies(subjectId)
      setPolicies(policyRows)
      setPolicy(policyRows.find((p) => p.term === term) ?? null)

      if (isOverall) {
        // The aggregate, never the raw cells: three terms of a section is
        // ~2,400 score rows, past PostgREST's silent 1000-row cap.
        setOverallRows(await getSectionGradeSums(sectionId, subjectId))
        return
      }

      const [roster, itemRows] = await Promise.all([
        listRosterBasics(sectionId),
        listGradeItems(sectionId, subjectId, term),
      ])
      const live = itemRows.filter((i) => i.archivedAt === null)
      const scoreRows = await listGradeScores(live.map((i) => i.id))

      const map = new Map<string, number>()
      for (const s of scoreRows) map.set(cellKey(s.itemId, s.studentId), s.score)
      scoresRef.current = map

      // Absent marks and attendance, each in its OWN catch (the 0034 SectionGrid
      // precedent): a database without 0063 costs the A marks and the Recitation
      // figure, never the grid.
      const [absenceRows, attendanceMap] = await Promise.all([
        getGradeAbsences(sectionId, subjectId, term).catch(() => []),
        getGradeAttendance(sectionId, subjectId, term).catch(
          () => new Map<string, GradeAttendance>(),
        ),
      ])
      const liveIds = new Set(live.map((i) => i.id))
      const absentMap = new Map<string, AbsentSource>()
      for (const a of absenceRows) {
        if (liveIds.has(a.itemId)) absentMap.set(cellKey(a.itemId, a.studentId), a.source)
      }
      absencesRef.current = absentMap
      setAttendance(attendanceMap)

      setStudents(roster)
      setItems(itemRows)
      rebuild()
      pendingRef.current.clear()
      setDirty(0)
      setFailed(new Set())
      setUndoable(null)
    } catch (e) {
      // Its own try/catch, by the 0034 SectionGrid precedent: migration 0057
      // may not be applied yet, and a missing table must cost this screen and
      // nothing else in the instructor area.
      setLoadError(errorText(e, 'Could not load this grade sheet.'))
    } finally {
      setLoading(false)
    }
  }, [sectionId, subjectId, term, isOverall, rebuild])

  useEffect(() => {
    void load()
  }, [load])

  // Progress across all three terms. Separate from `load` on purpose: it is
  // scope-wide rather than term-wide, so it does not need re-fetching when you
  // switch tabs, and its failure must cost one line rather than the screen.
  useEffect(() => {
    if (!sectionId || !subjectId) return
    let cancelled = false
    getSectionGradeSums(sectionId, subjectId)
      .then((rows) => !cancelled && setAllSums(rows))
      .catch(() => !cancelled && setAllSums([]))
    return () => {
      cancelled = true
    }
    // `dirty` is deliberately absent: re-fetching on every keystroke would be
    // a query per typed mark. The figure refreshes when the scope changes or
    // the screen reloads, and the status bar already says what is unsaved.
  }, [sectionId, subjectId])

  // Receipts for the live columns on screen. Re-read whenever the column list
  // is (a scope change, a reload after Set up) — never on a keystroke.
  useEffect(() => {
    const ids = items.filter((i) => i.archivedAt === null).map((i) => i.id)
    let cancelled = false
    listGradeBoosts(ids)
      .then((rows) => {
        if (cancelled) return
        setBoosts(new Map(rows.map((b) => [cellKey(b.itemId, b.studentId), b])))
      })
      .catch(() => {
        if (!cancelled) setBoosts(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [items])

  // ── Flushing ──────────────────────────────────────────────────────────────
  const flush = useCallback(async () => {
    if (pendingRef.current.size === 0) return
    const batch = [...pendingRef.current.values()]
    pendingRef.current.clear()
    setDirty(0)
    setSaving(true)

    // Three kinds of cell (0063): a mark, an A, and a clear. The server drops the
    // other half of a cell by trigger, so each kind is one write.
    const absents = batch.filter((c) => c.absent)
    const writes = batch.filter((c) => !c.absent && c.value !== null)
    const clears = batch.filter((c) => !c.absent && c.value === null)

    try {
      // ONE upsert for every dirty cell, so a fast run down a column is a
      // single round trip rather than forty. Clearing is a DELETE, which is a
      // different operation: it takes the item out of that student's
      // in-progress denominator, where a 0 would count against them.
      if (writes.length > 0) {
        await saveGradeScores(
          writes.map((c) => ({ itemId: c.itemId, studentId: c.studentId, score: c.value as number })),
        )
      }
      if (absents.length > 0) await saveGradeAbsences(absents)
      if (clears.length > 0) {
        // A clear removes the mark AND a typed A. A derived A has no row to remove.
        await clearGradeScores(clears)
        await clearGradeAbsences(clears)
      }
      setFailed((prev) => {
        if (prev.size === 0) return prev
        const next = new Set(prev)
        for (const c of batch) next.delete(cellKey(c.itemId, c.studentId))
        return next
      })
    } catch (e) {
      // The typed value STAYS on screen and is flagged instead of being thrown
      // away — losing someone's work to a dropped connection is worse than
      // showing it as unsaved, and the banner says plainly that it is unsaved.
      setFailed((prev) => {
        const next = new Set(prev)
        for (const c of batch) next.add(cellKey(c.itemId, c.studentId))
        return next
      })
      toast(errorText(e, 'Some marks did not save.'), 'error')
    } finally {
      setSaving(false)
    }
  }, [toast])

  // Latest-ref, written in an effect rather than during render: the unmount
  // flush below must see the CURRENT flush, and a render-phase ref write is
  // the kind of thing that works until a future concurrent render retries.
  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flushRef.current(), FLUSH_MS)
  }, [])

  const queue = useCallback(
    (edit: CellEdit) => {
      const key = cellKey(edit.itemId, edit.studentId)
      if (edit.value === null) scoresRef.current.delete(key)
      else scoresRef.current.set(key, edit.value)
      // A typed A is recorded; anything else removes a typed A (a derived one is
      // about the class and stays).
      if (edit.absent) absencesRef.current.set(key, 'manual')
      else if (absencesRef.current.get(key) === 'manual') absencesRef.current.delete(key)
      pendingRef.current.set(key, edit)
      setDirty(pendingRef.current.size)
      schedule()
    },
    [schedule],
  )

  const onCommit = useCallback(
    (edit: CellEdit, previous: CellState) => {
      queue(edit)
      setUndoable({ edit, previous })
    },
    [queue],
  )

  const onPasteColumn = useCallback(
    (itemId: string, startIndex: number, values: string[]) => {
      const item = items.find((i) => i.id === itemId)
      if (!item) return
      let applied = 0
      let rejected = 0
      for (let i = 0; i < values.length; i += 1) {
        const student = students[startIndex + i]
        if (!student) break
        // The cell's own parser, so a pasted value and a typed one mean the same
        // thing — including A for absent, and including what it REFUSES ('1e3').
        const parsed = parseScoreInput(values[i])
        if (!parsed.ok) {
          rejected += 1
          continue
        }
        queue({ itemId, studentId: student.id, value: parsed.value, absent: parsed.absent === true })
        applied += 1
      }
      setUndoable(null) // a paste is not one step to undo
      rebuild()
      toast(
        rejected > 0
          ? `Pasted ${applied} marks, skipped ${rejected} that were not numbers.`
          : `Pasted ${applied} marks into ${item.name}.`,
        rejected > 0 ? 'info' : 'success',
      )
    },
    [items, students, queue, toast, rebuild],
  )

  const onUndo = useCallback(() => {
    if (!undoable) return
    queue({ itemId: undoable.edit.itemId, studentId: undoable.edit.studentId, ...writeFor(undoable.previous) })
    setUndoable(null)
    rebuild()
  }, [undoable, queue, rebuild])

  // Leaving with work in flight. No precedent for this in the codebase, so it
  // only exists because it was named: a debounce window plus a round trip is a
  // real gap, and closing the tab inside it loses marks silently.
  useEffect(() => {
    if (dirty === 0 && !saving) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, saving])

  // Navigating away inside the debounce window must still write.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      void flushRef.current()
    },
    [],
  )

  const liveItems = useMemo(
    () => orderedItems(items.filter((i) => i.archivedAt === null)),
    [items],
  )

  const effectivePolicy = policy ?? defaultPolicy(subjectId, term)

  /**
   * Download this term, or the whole subject from the Overall tab.
   *
   * The whole-subject path re-fetches the other two terms rather than holding
   * all three in memory: the screen only ever shows one, and three terms of
   * cells is ~2,400 rows that would otherwise be loaded to sit unused.
   */
  const onExport = useCallback(async () => {
    if (!section || !subject) return
    setExporting(true)
    try {
      const { exportSubjectGrades, exportTermGrades } = await import('@/lib/export-grades')

      if (!isOverall) {
        await exportTermGrades(
          section.name,
          subject.code,
          term,
          students,
          liveItems,
          grid.scores,
          effectivePolicy,
          attendance,
          grid.absences,
        )
        return
      }

      const roster = students.length > 0 ? students : await listRosterBasics(sectionId)
      const perTerm = await Promise.all(
        TERMS.map(async (t) => {
          const itemRows = (await listGradeItems(sectionId, subjectId, t)).filter(
            (i) => i.archivedAt === null,
          )
          const scoreRows = await listGradeScores(itemRows.map((i) => i.id))
          const map = new Map<string, number>()
          for (const s of scoreRows) map.set(cellKey(s.itemId, s.studentId), s.score)
          // Attendance and Absent marks for this term, each failing soft (0063).
          const [att, abs] = await Promise.all([
            getGradeAttendance(sectionId, subjectId, t).catch(
              () => new Map<string, GradeAttendance>(),
            ),
            getGradeAbsences(sectionId, subjectId, t).catch(() => []),
          ])
          return {
            term: t,
            items: itemRows,
            scores: map,
            policy: policies.find((p) => p.term === t) ?? defaultPolicy(subjectId, t),
            attendance: att,
            absences: new Map(abs.map((a) => [cellKey(a.itemId, a.studentId), a.source])),
          }
        }),
      )
      await exportSubjectGrades(section.name, subject.code, roster, perTerm, overallRows, policies)
    } catch (e) {
      toast(errorText(e, 'Could not build that workbook.'), 'error')
    } finally {
      setExporting(false)
    }
  }, [
    section,
    subject,
    isOverall,
    term,
    students,
    liveItems,
    grid.scores,
    grid.absences,
    attendance,
    effectivePolicy,
    sectionId,
    subjectId,
    policies,
    overallRows,
    toast,
  ])

  const markedCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const key of grid.scores.keys()) {
      const itemId = key.slice(0, key.indexOf(':'))
      m.set(itemId, (m.get(itemId) ?? 0) + 1)
    }
    return m
    // From the same snapshot the editor was built from, so the counts shown in
    // the Columns sheet always match what is on screen.
  }, [grid.scores])

  const policyProblem = policy === null ? null : policyError(policy)

  /**
   * Whether this SUBJECT can produce a grade at all — all three policy rows
   * present and each adding up. Distinct from `policyProblem`, which is about
   * the one term on screen: a missing Finals row withholds every final grade
   * while the Prelim sheet in front of you looks perfectly fine.
   */
  const subjectProblem = useMemo(
    () => (policies.length > 0 ? subjectPolicyError(policies) : null),
    [policies],
  )

  /** The subjects actually assigned to the section on screen. */
  const subjectChoices = useMemo(
    () => subjectsForSection(sectionId),
    [subjectsForSection, sectionId],
  )

  const completion = useMemo(() => completionByTerm(allSums), [allSums])

  /**
   * Move the scope. One function, because every control that changes scope has
   * to do the same two things — navigate, and remember — and a second copy is
   * how one of them starts forgetting.
   *
   * ⚠ Changing SECTION can orphan the subject: sections do not all take the
   *   same subjects. If the current subject is not assigned to the new section
   *   we fall to that section's first, rather than navigating to a pairing
   *   whose sheet can only render its error state.
   */
  const goTo = useCallback(
    (nextSection: string, nextSubject: string, nextTab: SheetTab) => {
      const allowed = subjectsForSection(nextSection)
      const subjectOk = allowed.some((s) => s.id === nextSubject)
      const resolvedSubject = subjectOk ? nextSubject : (allowed[0]?.id ?? nextSubject)
      writeGradeScope({ sectionId: nextSection, subjectId: resolvedSubject, term: nextTab })
      navigate(`/teach/grades/${nextSection}/${resolvedSubject}/${nextTab}`)
    },
    [subjectsForSection, navigate],
  )

  /**
   * Remember the scope you ARRIVED at too, not only the ones you pick.
   *
   * Without this, a deep link followed by a tab-bar visit to Grades would send
   * you back to whatever you last chose by hand rather than what you were just
   * looking at.
   */
  useEffect(() => {
    if (!sectionId || !subjectId) return
    writeGradeScope({ sectionId, subjectId, term: tab })
  }, [sectionId, subjectId, tab])

  if (!sectionId || !subjectId) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <ScreenTitle title="Grades" />
        <EmptyState>That grade sheet does not exist.</EmptyState>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
      {/* ⚠ `ScreenTitle`, NOT `PageHeader` — this is a nav DESTINATION now.
          `/teach/grades` resolves straight here (GradesEntry), so there is no
          landing to go back TO, and `PageHeader` always renders a back button.
          Shipping one here would send the instructor to a redirect that bounces
          them back to the screen they just left. */}
      <ScreenTitle
        title="Grades"
        subtitle={semester ? semester.name : undefined}
        actions={
          <div className="flex items-center gap-2">
            {isOverall ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/teach/grades/${sectionId}/${subjectId}/print`)}
              >
                Print
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setItemsOpen(true)}>
                  Set up
                </Button>
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                  Import
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" loading={exporting} onClick={() => void onExport()}>
              Export
            </Button>
          </div>
        }
      />

      {/* ── ONE COMPACT BAR ───────────────────────────────────────────────────
          Scope (section, subject), which term, which figure and the help link,
          all on one row. The scope used to be two pickers each HALF the window
          wide, with the term tabs, the figure toggle and the progress line on
          three more rows beneath — about 150px of the screen spent before the
          first student, and two controls that dominate the page being the two
          you touch least.

          The pickers are now the width of what they hold. They still NAVIGATE
          rather than set state: the scope has to stay in the path, because
          `Shell` reads `pathname` to decide this route gets the full window.

          On a phone every control is full width and stacked — a section name is
          the longest string on the screen and the job of the control is to name
          it. `text-base` below `md` is the iOS zoom rule; the compact `h-9
          text-sm` is desktop only. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Select
          aria-label="Section"
          value={sectionId}
          onChange={(e) => goTo(e.target.value, subjectId, tab)}
          wrapperClassName="w-full sm:w-auto sm:min-w-40 sm:max-w-72"
          className="md:h-9 md:text-sm"
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Subject"
          value={subjectId}
          onChange={(e) => goTo(sectionId, e.target.value, tab)}
          wrapperClassName="w-full sm:w-auto sm:min-w-48 sm:max-w-80"
          className="md:h-9 md:text-sm"
        >
          {subjectChoices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name}
            </option>
          ))}
        </Select>

        <SegmentedControl
          label="Term"
          value={tab}
          onChange={(next) => goTo(sectionId, subjectId, next)}
          options={TABS.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
          className="w-full sm:w-80"
        />
        {/* QUIET, not accent. Two filled strips side by side read as one
            control with two active items — the term tabs own the red, because
            they are the thing that changes what you are looking at. */}
        {!isOverall && (
          <SegmentedControl
            label="Which figure"
            tone="quiet"
            size="sm"
            value={view}
            onChange={(next) => {
              setView(next)
              try {
                localStorage.setItem(VIEW_KEY, next)
              } catch {
                // A blocked store costs the preference, never the screen.
              }
            }}
            options={[
              { value: 'soFar', label: 'So far' },
              { value: 'official', label: 'Official' },
            ]}
            className="w-full sm:w-44"
          />
        )}
        <button
          type="button"
          onClick={() => setNoteOpen((o) => !o)}
          aria-expanded={noteOpen}
          className="cp-tap-y ml-auto text-xs text-muted underline-offset-2 hover:underline"
        >
          {noteOpen ? 'Hide' : 'What do these mean?'}
        </button>
      </div>

      {/* GradesConsole's one genuinely useful signal, kept where the subject
          actually is. A subject needs all three policy rows and each has to add
          up; when it does not, EVERY figure on EVERY sheet for that subject is
          withheld, and finding that out three taps in is what made the old
          landing feel necessary. Its own line, not squeezed into the bar. */}
      {subjectProblem && (
        <p className="mb-2 flex items-start gap-1.5 text-xs text-warn">
          <Chip tone="warn" size="sm">
            Check weights
          </Chip>
          <span className="min-w-0">{subjectProblem}</span>
        </p>
      )}

      {/* ── HOW MUCH IS ENTERED ───────────────────────────────────────────────
          "What is left to do" is the question the old landing never answered.
          A hairline meter for the term on screen, then all three on one line:
          a percentage inside each tab does not fit a four-tab strip at phone
          width. A term with no columns reads "—", never 0% — the instructor has
          not fallen behind on a term they have not set up yet. */}
      {allSums.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          {!isOverall && completion[term] !== null && (
            <Meter
              value={completion[term] ?? 0}
              max={100}
              size="sm"
              tone={completion[term] === 100 ? 'success' : 'accent'}
              label={TERM_LABEL[term] + ' entered'}
              className="w-40"
            />
          )}
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold">Entered</span>
            {TERMS.map((t) => {
              const pct = completion[t]
              return (
                <span key={t} className={cn(t === term && !isOverall && 'text-ink')}>
                  {TERM_LABEL[t]}{' '}
                  <span className="font-semibold tabular-nums">
                    {pct === null ? '—' : pct + '%'}
                  </span>
                </span>
              )
            })}
          </span>
        </div>
      )}

      {/* Collapsed by default: it is a two-line explanation you need once, on a
          screen that wants every row it can get. */}
      {noteOpen && (
        <p className="mb-4 text-xs text-muted">
          {isOverall ? (
            <>
              The <b className="text-ink">final computed grade</b> weighs the three terms
              against each other. A term with no marks is never treated as a zero — the grade
              is withheld and the missing term is named instead.
            </>
          ) : view === 'soFar' ? (
            <>
              <b className="text-ink">So far</b> counts only what you have marked, so two
              students&rsquo; figures are not comparable with each other. A dash means nothing
              is marked in that component yet; an empty cell means &ldquo;not marked
              yet&rdquo; — type <b className="text-ink">0</b> for a student who scored nothing.
            </>
          ) : (
            <>
              <b className="text-ink">Official</b> counts every column, so anything unmarked
              scores zero — this is the figure that matches your spreadsheet, and it only means
              what it says once the term is fully entered.
            </>
          )}
        </p>
      )}

      {policyProblem && (
        <Card pad="tight" className="mb-4 border-warn bg-warn-solid/10 text-sm text-warn">
          {policyProblem}
        </Card>
      )}

      {loading ? (
        <ListSkeleton rows={6} />
      ) : loadError ? (
        <ErrorState onRetry={() => void load()} detail="Grades need migration 0057 applied.">
          {loadError}
        </ErrorState>
      ) : isOverall ? (
        <OverallTable rows={overallRows} policies={policies} />
      ) : students.length === 0 ? (
        <EmptyState>This section has no active students.</EmptyState>
      ) : isDesktop ? (
        // One editor at a time, never both: two would mean two inputs per cell,
        // and the keyboard walk and the failed-cell flags assume exactly one.
        <GradeGrid
          key={grid.key}
          students={students}
          items={liveItems}
          scores={grid.scores}
          policy={effectivePolicy}
          view={view}
          failed={failed}
          boosts={boosts}
          absences={grid.absences}
          attendance={attendance}
          onCommit={onCommit}
          onPasteColumn={onPasteColumn}
          // ⚠ This prop existed and was never passed, so the desktop empty
          //   state's "Add a column" button could not render — the only way to
          //   create the first column was a header button named "Columns",
          //   which is not where someone looking at an empty grid looks. It
          //   has somewhere to go now.
          onAddColumn={() => setItemsOpen(true)}
        />
      ) : (
        <GradeItemEntry
          key={grid.key}
          students={students}
          items={liveItems}
          scores={grid.scores}
          absences={grid.absences}
          attendance={attendance}
          policy={effectivePolicy}
          view={view}
          failed={failed}
          onCommit={onCommit}
        />
      )}

      {(dirty > 0 || saving || failed.size > 0 || undoable) && (
        <StickyBar>
          <Card pad="tight" className="flex items-center gap-3 shadow-lg">
            <span className="min-w-0 flex-1 truncate text-xs">
              {failed.size > 0 ? (
                <span className="text-danger">
                  {failed.size} mark{failed.size === 1 ? '' : 's'} not saved
                </span>
              ) : saving ? (
                <span className="text-muted">Saving…</span>
              ) : dirty > 0 ? (
                <span className="text-muted">
                  {dirty} unsaved change{dirty === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="text-success">Saved</span>
              )}
            </span>
            {failed.size > 0 && (
              <Button size="sm" variant="outline" onClick={() => void load()}>
                Reload
              </Button>
            )}
            {undoable && failed.size === 0 && (
              <Button size="sm" variant="ghost" onClick={onUndo}>
                Undo
              </Button>
            )}
          </Card>
        </StickyBar>
      )}

      {section && subject && (
        <GradeImportSheet
          open={importOpen}
          onClose={() => setImportOpen(false)}
          sectionId={sectionId}
          subjectId={subjectId}
          sectionName={section.name}
          subjectCode={subject.code}
          term={term}
          students={students}
          onImported={() => void load()}
        />
      )}

      {/* Columns AND weights, behind one button. `subject` is required for the
          weights half (it names the scope and the confirm counts its
          sections), so the sheet only mounts once the subject has resolved. */}
      {subject && (
        <GradeSetupSheet
          open={itemsOpen}
          onClose={() => setItemsOpen(false)}
          subject={subject}
          policies={policies}
          // Every section taking this subject — the real reach of a weight
          // change, and what the confirm counts.
          sectionIds={sections
            .filter((s) => subjectsForSection(s.id).some((x) => x.id === subject.id))
            .map((s) => s.id)}
          onPoliciesSaved={() => void load()}
          sectionId={sectionId}
          term={term}
          items={items}
          markedCounts={markedCounts}
          onItemsChanged={() => void load()}
        />
      )}
    </div>
  )
}
