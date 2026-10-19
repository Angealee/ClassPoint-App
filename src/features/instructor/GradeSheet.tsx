import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { StickyBar } from '@/components/ui/StickyBar'
import { useToast } from '@/components/ui/Toast'
import {
  clearGradeScores,
  listGradeItems,
  listGradePolicies,
  listGradeScores,
  listRosterBasics,
  getSectionGradeSums,
  saveGradeScores,
} from '@/lib/api'
import { cellKey, defaultPolicy, orderedItems, policyError } from '@/lib/grading'
import { errorText } from '@/lib/errors'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { GradeGrid, type CellEdit } from './GradeGrid'
import { OverallTable } from './OverallTable'
import { GradeItemEntry } from './GradeItemEntry'
import { GradeItemsSheet } from './GradeItemsSheet'
import { GradeImportSheet } from './GradeImportSheet'
import { useInstructor } from './InstructorLayout'
import type {
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
 * which keeps every one of them a real deep link, and keeps `isWideRoute` able
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
  const { sections, subjects } = useInstructor()
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

  // What the editor was last built from. A SNAPSHOT in state rather than the
  // ref itself, so nothing reads a ref during render: the editor is seeded from
  // `scores` and remounted by `key`, and both move together. Anything that
  // changes values from outside the editor — a reload, undo, a pasted column —
  // writes the ref and then calls `rebuild`.
  const [grid, setGrid] = useState<{ key: number; scores: Map<string, number> }>({
    key: 0,
    scores: new Map(),
  })
  const rebuild = useCallback(() => {
    setGrid((g) => ({ key: g.key + 1, scores: new Map(scoresRef.current) }))
  }, [])

  // ── The save queue ────────────────────────────────────────────────────────
  const pendingRef = useRef(new Map<string, CellEdit>())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dirty, setDirty] = useState(0)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [undoable, setUndoable] = useState<{ edit: CellEdit; previous: number | null } | null>(null)

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

  // ── Flushing ──────────────────────────────────────────────────────────────
  const flush = useCallback(async () => {
    if (pendingRef.current.size === 0) return
    const batch = [...pendingRef.current.values()]
    pendingRef.current.clear()
    setDirty(0)
    setSaving(true)

    const writes = batch.filter((c) => c.value !== null)
    const clears = batch.filter((c) => c.value === null)

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
      if (clears.length > 0) await clearGradeScores(clears)
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
      pendingRef.current.set(key, edit)
      setDirty(pendingRef.current.size)
      schedule()
    },
    [schedule],
  )

  const onCommit = useCallback(
    (edit: CellEdit, previous: number | null) => {
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
        const raw = values[i].trim()
        // Reuse the cell's own rule rather than a second parser — a pasted
        // value and a typed one must mean the same thing.
        const n = raw === '' ? null : Number(raw)
        if (raw !== '' && (!Number.isFinite(n) || (n as number) < 0)) {
          rejected += 1
          continue
        }
        queue({ itemId, studentId: student.id, value: n })
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
    queue({ ...undoable.edit, value: undoable.previous })
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
          return {
            term: t,
            items: itemRows,
            scores: map,
            policy: policies.find((p) => p.term === t) ?? defaultPolicy(subjectId, t),
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

  const title = section && subject ? `${subject.code} · ${section.name}` : 'Grades'

  if (!sectionId || !subjectId) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <PageHeader title="Grades" fallback="/teach/grades" />
        <EmptyState>That grade sheet does not exist.</EmptyState>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
      <PageHeader
        title={title}
        subtitle={section && subject ? subject.name : undefined}
        fallback="/teach/grades"
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
                  Columns
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Term"
          value={tab}
          onChange={(next) => navigate(`/teach/grades/${sectionId}/${subjectId}/${next}`)}
          options={TABS.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
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
          />
        )}
        <button
          type="button"
          onClick={() => setNoteOpen((o) => !o)}
          aria-expanded={noteOpen}
          className="ml-auto text-xs text-muted underline-offset-2 hover:underline"
        >
          {noteOpen ? 'Hide' : 'What do these mean?'}
        </button>
      </div>

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
          onCommit={onCommit}
          onPasteColumn={onPasteColumn}
        />
      ) : (
        <GradeItemEntry
          key={grid.key}
          students={students}
          items={liveItems}
          scores={grid.scores}
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

      <GradeItemsSheet
        open={itemsOpen}
        onClose={() => setItemsOpen(false)}
        sectionId={sectionId}
        subjectId={subjectId}
        term={term}
        items={items}
        markedCounts={markedCounts}
        onChanged={() => void load()}
      />
    </div>
  )
}
