import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Sheet } from '@/components/ui/Sheet'
import { DownloadIcon, MoreIcon, UploadIcon } from '@/components/ui/icons'
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

type SheetTab = TermKey | 'overall'
const TABS: SheetTab[] = [...TERMS, 'overall']
const TAB_LABEL: Record<SheetTab, string> = { ...TERM_LABEL, overall: 'Overall' }

function isTab(value: string | undefined): value is SheetTab {
  return (
    value === 'prelim' || value === 'midterm' || value === 'finals' || value === 'overall'
  )
}

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
  const [toolsOpen, setToolsOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [allSums, setAllSums] = useState<GradeSumsRow[]>([])

  const [boosts, setBoosts] = useState<Map<string, GradeBoost>>(() => new Map())

  const [view, setView] = useState<GradeView>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'official' ? 'official' : 'soFar'
    } catch {
      return 'soFar'
    }
  })

  const scoresRef = useRef(new Map<string, number>())
  const absencesRef = useRef(new Map<string, AbsentSource>())
  const [attendance, setAttendance] = useState<Map<string, GradeAttendance>>(() => new Map())

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
      setLoadError(errorText(e, 'Could not load this grade sheet.'))
    } finally {
      setLoading(false)
    }
  }, [sectionId, subjectId, term, isOverall, rebuild])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!sectionId || !subjectId) return
    let cancelled = false
    getSectionGradeSums(sectionId, subjectId)
      .then((rows) => !cancelled && setAllSums(rows))
      .catch(() => !cancelled && setAllSums([]))
    return () => {
      cancelled = true
    }
  }, [sectionId, subjectId])

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

  const flush = useCallback(async () => {
    if (pendingRef.current.size === 0) return
    const batch = [...pendingRef.current.values()]
    pendingRef.current.clear()
    setDirty(0)
    setSaving(true)

    const absents = batch.filter((c) => c.absent)
    const writes = batch.filter((c) => !c.absent && c.value !== null)
    const clears = batch.filter((c) => !c.absent && c.value === null)

    try {
      if (writes.length > 0) {
        await saveGradeScores(
          writes.map((c) => ({ itemId: c.itemId, studentId: c.studentId, score: c.value as number })),
        )
      }
      if (absents.length > 0) await saveGradeAbsences(absents)
      if (clears.length > 0) {
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
  }, [grid.scores])

  const policyProblem = policy === null ? null : policyError(policy)

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
              <Button size="sm" variant="outline" onClick={() => setItemsOpen(true)}>
                Set up
              </Button>
            )}
            {/* Import / Export are occasional jobs: one ⋯ button on a phone, inline from sm up. */}
            <div className="hidden items-center gap-2 sm:flex">
              {!isOverall && (
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                  Import
                </Button>
              )}
              <Button size="sm" variant="outline" loading={exporting} onClick={() => void onExport()}>
                Export
              </Button>
            </div>
            <IconButton
              className="sm:hidden"
              label="More grade tools"
              variant="outline"
              onClick={() => setToolsOpen(true)}
              icon={<MoreIcon className="h-5 w-5" />}
            />
          </div>
        }
      />

      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)] gap-2 sm:flex sm:w-auto sm:items-center sm:gap-3">
        <Select
          aria-label="Section"
          value={sectionId}
          onChange={(e) => goTo(e.target.value, subjectId, tab)}
          wrapperClassName="min-w-0 sm:w-auto sm:min-w-40 sm:max-w-72"
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
          wrapperClassName="min-w-0 sm:w-auto sm:min-w-48 sm:max-w-80"
          className="md:h-9 md:text-sm"
        >
          {subjectChoices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name}
            </option>
          ))}
        </Select>
        </div>

        <SegmentedControl
          label="Term"
          value={tab}
          onChange={(next) => goTo(sectionId, subjectId, next)}
          options={TABS.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
          className="w-full sm:w-80"
        />
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
            className="w-44 shrink-0"
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

      {subjectProblem && (
        <p className="mb-2 flex items-start gap-1.5 text-xs text-warn">
          <Chip tone="warn" size="sm">
            Check weights
          </Chip>
          <span className="min-w-0">{subjectProblem}</span>
        </p>
      )}

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
                    {pct === null ? '-' : pct + '%'}
                  </span>
                </span>
              )
            })}
          </span>
        </div>
      )}

      {noteOpen && (
        <p className="mb-4 text-xs text-muted">
          {isOverall ? (
            <>
              The <b className="text-ink">final computed grade</b> weighs the three terms
              against each other. A term with no marks is never treated as a zero, the grade
              is withheld and the missing term is named instead.
            </>
          ) : view === 'soFar' ? (
            <>
              <b className="text-ink">So far</b> counts only what you have marked, so two
              students&rsquo; figures are not comparable with each other. A dash means nothing
              is marked in that component yet; an empty cell means &ldquo;not marked
              yet&rdquo;, type <b className="text-ink">0</b> for a student who scored nothing.
            </>
          ) : (
            <>
              <b className="text-ink">Official</b> counts every column, so anything unmarked
              scores zero, this is the figure that matches your spreadsheet, and it only means
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

      <Sheet open={toolsOpen} onClose={() => setToolsOpen(false)} title="Grade tools">
        <div className="-mx-1 divide-y divide-line">
          {(
            [
              ...(isOverall
                ? []
                : [
                    {
                      label: 'Import marks',
                      hint: 'Bring in a term from your spreadsheet',
                      Icon: UploadIcon,
                      run: () => setImportOpen(true),
                    },
                  ]),
              {
                label: 'Export',
                hint: isOverall ? 'Download the whole subject as a workbook' : 'Download this term as a workbook',
                Icon: DownloadIcon,
                run: () => void onExport(),
              },
            ] as Array<{ label: string; hint: string; Icon: typeof UploadIcon; run: () => void }>
          ).map(({ label, hint, Icon, run }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setToolsOpen(false)
                run()
              }}
              className="flex w-full items-center gap-3 px-1 py-3 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card-2 text-muted">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>

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

      {subject && (
        <GradeSetupSheet
          open={itemsOpen}
          onClose={() => setItemsOpen(false)}
          subject={subject}
          policies={policies}
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
