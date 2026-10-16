import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, Rows } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Input } from '@/components/ui/Input'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { importGradeTerm, listGradeItems, listGradeScores } from '@/lib/api'
import { cellKey, COMPONENT_LABEL, GRADE_COMPONENTS } from '@/lib/grading'
import {
  collectRows,
  columnLabel,
  detectStructure,
  parseGradeWorkbook,
  type ImportRow,
  type ParsedSheet,
  type SheetStructure,
} from '@/lib/grades-io'
import { matchRows, type MatchReport, type MatchResult } from '@/lib/grade-match'
import { errorText } from '@/lib/errors'
import { cn } from '@/lib/cn'
import type { GradeComponent, GradeItem, RosterPerson, TermKey } from '@/lib/types'

/**
 * Importing one term from the instructor's spreadsheet.
 *
 * ⚠ THE RISKIEST SCREEN IN THE FEATURE. Three stages, and the middle one
 * cannot be skipped:
 *
 *   1. CONFIRM THE STRUCTURE. Detection reads the merged group headers and the
 *      totals row, which works on the file this was built against — and one
 *      inserted column shifts all of it. Every range and every total is shown
 *      beside the real header text and stays editable. A wrong total rescales
 *      the whole class, which is the failure this feature exists to remove.
 *
 *   2. REVIEW THE NAMES. Exact matches are pre-ticked; nothing else is.
 *      Ambiguous rows are never resolved automatically, fuzzy ones are never
 *      ticked for you, a name with no student NEVER creates one, and students
 *      the sheet does not mention are listed in their own right — that last
 *      bucket is the strongest signal the wrong file was loaded.
 *
 *   3. CONFIRM THE COUNTS, then one transactional write.
 */

/** One column per component — the source sheet has no per-item maximum. */
const IMPORT_SUFFIX = ' (imported)'
const importedName = (c: GradeComponent) => `${COMPONENT_LABEL[c]}${IMPORT_SUFFIX}`

type Stage = 'file' | 'structure' | 'match'

interface Props {
  open: boolean
  onClose: () => void
  sectionId: string
  subjectId: string
  sectionName: string
  subjectCode: string
  term: TermKey
  students: RosterPerson[]
  onImported: () => void
}

export function GradeImportSheet({
  open,
  onClose,
  sectionId,
  subjectId,
  sectionName,
  subjectCode,
  term,
  students,
  onImported,
}: Props) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('file')
  const [sheets, setSheets] = useState<ParsedSheet[]>([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [structure, setStructure] = useState<SheetStructure | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [report, setReport] = useState<MatchReport | null>(null)
  /** sheet row index → the student it writes to, or null for "skip". */
  const [picks, setPicks] = useState<Map<number, string | null>>(new Map())
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Preflight | null>(null)

  function reset() {
    setStage('file')
    setSheets([])
    setSheetIndex(0)
    setStructure(null)
    setRows([])
    setReport(null)
    setPicks(new Map())
    setConfirm(null)
  }

  function close() {
    reset()
    onClose()
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const parsed = await parseGradeWorkbook(file)
      if (parsed.length === 0) throw new Error('That file has no sheets.')
      setSheets(parsed)
      setSheetIndex(0)
      setStructure(detectStructure(parsed[0]))
      setStage('structure')
    } catch (err) {
      toast(errorText(err, 'Could not read that file.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  function pickSheet(index: number) {
    setSheetIndex(index)
    setStructure(detectStructure(sheets[index]))
  }

  function toStructurePatch(component: GradeComponent, patch: Partial<{ from: string; to: string; total: string }>) {
    if (!structure) return
    const plan = structure.components[component]
    const from = patch.from !== undefined ? parseColumn(patch.from) : plan.range?.from ?? null
    const to = patch.to !== undefined ? parseColumn(patch.to) : plan.range?.to ?? null
    const total =
      patch.total !== undefined
        ? patch.total.trim() === ''
          ? null
          : Number(patch.total)
        : plan.total

    setStructure({
      ...structure,
      components: {
        ...structure.components,
        [component]: {
          range: from !== null && to !== null && to >= from ? { from, to } : null,
          total: Number.isFinite(total as number) ? (total as number) : null,
        },
      },
    })
  }

  function toMatch() {
    if (!structure) return
    const sheet = sheets[sheetIndex]
    const collected = collectRows(sheet, structure)
    const next = matchRows(
      collected.map((r) => ({ index: r.index, rawName: r.rawName })),
      students.map((s) => ({ studentId: s.id, fullName: s.fullName })),
    )
    setRows(collected)
    setReport(next)
    // ONLY exact matches start ticked. Fuzzy and ambiguous are decisions.
    const seeded = new Map<number, string | null>()
    for (const r of next.rows) {
      seeded.set(r.row.index, r.bucket === 'exact' ? r.candidates[0].studentId : null)
    }
    setPicks(seeded)
    setStage('match')
  }

  const mapped = useMemo(
    () => GRADE_COMPONENTS.filter((c) => structure?.components[c].range && structure.components[c].total),
    [structure],
  )

  const structureProblem = useMemo(() => {
    if (!structure) return 'Pick a file first.'
    if (mapped.length === 0) return 'Map at least one component to a column range and a total.'
    for (const c of mapped) {
      const plan = structure.components[c]
      if ((plan.total ?? 0) <= 0) return `${COMPONENT_LABEL[c]} needs a total above 0.`
    }
    return null
  }, [structure, mapped])

  /** What the write would do — computed BEFORE anything is sent. */
  async function preflight() {
    if (!structure) return
    setBusy(true)
    try {
      const marks: { component: GradeComponent; studentId: string; score: number }[] = []
      for (const row of rows) {
        const studentId = picks.get(row.index)
        if (!studentId) continue
        for (const c of mapped) {
          const value = row.totals[c]
          // Null means the sheet had no marks there. Sending 0 would record a
          // score nobody gave, and the official grade counts it.
          if (value === null) continue
          marks.push({ component: c, studentId, score: value })
        }
      }

      // Count what already exists, so the confirm can say how much is replaced.
      const existing = await listGradeItems(sectionId, subjectId, term)
      const targets = new Map<GradeComponent, GradeItem>()
      for (const item of existing) {
        if (item.archivedAt !== null) continue
        if (item.name.trim().toLowerCase() === importedName(item.component).toLowerCase()) {
          targets.set(item.component, item)
        }
      }
      const scoreRows = await listGradeScores([...targets.values()].map((i) => i.id))
      const have = new Set(scoreRows.map((s) => cellKey(s.itemId, s.studentId)))
      const overwrites = marks.filter((m) => {
        const item = targets.get(m.component)
        return item ? have.has(cellKey(item.id, m.studentId)) : false
      }).length

      setConfirm({
        marks,
        columns: mapped.map((c) => ({
          component: c,
          name: importedName(c),
          maxScore: structure.components[c].total as number,
        })),
        students: new Set(marks.map((m) => m.studentId)).size,
        overwrites,
        newColumns: mapped.filter((c) => !targets.has(c)).length,
        skipped: rows.length - [...picks.values()].filter(Boolean).length,
        ungraded: report ? report.missingFromSheet.length : 0,
      })
    } catch (e) {
      toast(errorText(e, 'Could not work out what this would change.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function write() {
    if (!confirm) return
    setBusy(true)
    try {
      const result = await importGradeTerm(
        sectionId,
        subjectId,
        term,
        confirm.columns,
        confirm.marks,
      )
      toast(
        `Imported ${result.scoresWritten} marks` +
          (result.scoresOverwritten > 0 ? `, replacing ${result.scoresOverwritten}.` : '.'),
        'success',
      )
      onImported()
      close()
    } catch (e) {
      // The RPC is one transaction, so a refusal really did change nothing.
      toast(errorText(e, 'Nothing was imported.'), 'error')
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  const sheet = sheets[sheetIndex]

  return (
    <>
      <Sheet open={open} onClose={close} variant="screen" title="Import grades">
        <div className="mx-auto w-full max-w-2xl space-y-5 pb-8">
          <div>
            <h2 className="font-display text-xl font-bold">Import {TERM_LABEL[term]}</h2>
            <p className="text-sm text-muted">
              {subjectCode} · {sectionName}. Marks go into one column per component — your
              sheet records a total per component, not a maximum per quiz, so there is no
              per-item detail to recover.
            </p>
          </div>

          {stage === 'file' && (
            <Card pad="tight" className="space-y-3">
              <SectionLabel>1 · Pick the file</SectionLabel>
              <p className="text-xs text-muted">
                An .xlsx or .csv. Nothing is written until you have confirmed the columns
                and reviewed every name.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => void onFile(e)}
                className="hidden"
              />
              <Button loading={busy} className="w-full" onClick={() => fileRef.current?.click()}>
                Choose a file
              </Button>
            </Card>
          )}

          {stage === 'structure' && structure && sheet && (
            <>
              <Card pad="tight" className="space-y-3">
                <SectionLabel>2 · Confirm the columns</SectionLabel>
                {sheets.length > 1 && (
                  <Select
                    label="Sheet"
                    value={String(sheetIndex)}
                    onChange={(e) => pickSheet(Number(e.target.value))}
                  >
                    {sheets.map((s, i) => (
                      <option key={s.name} value={i}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
                <p className="text-xs text-warn">
                  These were guessed from the sheet&rsquo;s own headers. Check every one — a
                  wrong total rescales the whole class.
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted">Names in column</span>{' '}
                    <b>{columnLabel(structure.nameColumn)}</b>
                  </div>
                  <div>
                    <span className="text-muted">Students start at row</span>{' '}
                    <b>{structure.firstDataRow + 1}</b>
                  </div>
                </div>
              </Card>

              {GRADE_COMPONENTS.map((c) => {
                const plan = structure.components[c]
                return (
                  <Card key={c} pad="tight" className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-bold">{COMPONENT_LABEL[c]}</span>
                      {plan.range ? (
                        <Chip tone="success" size="sm">
                          {columnLabel(plan.range.from)}–{columnLabel(plan.range.to)}
                        </Chip>
                      ) : (
                        <Chip tone="neutral" size="sm">
                          not in this sheet
                        </Chip>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        label="From"
                        value={plan.range ? columnLabel(plan.range.from) : ''}
                        onChange={(e) => toStructurePatch(c, { from: e.target.value })}
                        wrapperClassName="w-20 shrink-0"
                        className="text-center uppercase"
                      />
                      <Input
                        label="To"
                        value={plan.range ? columnLabel(plan.range.to) : ''}
                        onChange={(e) => toStructurePatch(c, { to: e.target.value })}
                        wrapperClassName="w-20 shrink-0"
                        className="text-center uppercase"
                      />
                      <Input
                        label="Out of"
                        inputMode="decimal"
                        value={plan.total === null ? '' : String(plan.total)}
                        onChange={(e) => toStructurePatch(c, { total: e.target.value })}
                        wrapperClassName="min-w-0 flex-1"
                      />
                    </div>
                    {plan.range && (
                      <p className="text-2xs text-muted">
                        Header reads &ldquo;{sheet.rows[0]?.[plan.range.from] || '—'}&rdquo;. First
                        student&rsquo;s cells:{' '}
                        {sheet.rows[structure.firstDataRow]
                          ?.slice(plan.range.from, plan.range.to + 1)
                          .map((v) => v || '·')
                          .join('  ') || '—'}
                      </p>
                    )}
                  </Card>
                )
              })}

              {structureProblem && (
                <p className="text-sm text-danger">{structureProblem}</p>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStage('file')}>
                  Back
                </Button>
                <Button className="flex-1" disabled={structureProblem !== null} onClick={toMatch}>
                  Review {rowsPreviewCount(sheet, structure)} names
                </Button>
              </div>
            </>
          )}

          {stage === 'match' && report && (
            <MatchStage
              report={report}
              picks={picks}
              setPicks={setPicks}
              students={students}
              onBack={() => setStage('structure')}
              onNext={() => void preflight()}
              busy={busy}
            />
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirm !== null}
        title="Import these marks?"
        variant="danger"
        message={
          confirm
            ? `${confirm.marks.length} marks for ${confirm.students} students into ${TERM_LABEL[term]}.`
            : ''
        }
        detail={confirm ? <PreflightDetail confirm={confirm} /> : undefined}
        confirmLabel="Import"
        busy={busy}
        onConfirm={() => void write()}
        onClose={() => setConfirm(null)}
      />
    </>
  )
}

const TERM_LABEL: Record<TermKey, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  finals: 'Finals',
}

interface Preflight {
  marks: { component: GradeComponent; studentId: string; score: number }[]
  columns: { component: GradeComponent; name: string; maxScore: number }[]
  students: number
  overwrites: number
  newColumns: number
  skipped: number
  ungraded: number
}

function PreflightDetail({ confirm }: { confirm: Preflight }) {
  return (
    <ul className="space-y-1">
      <li>
        Creates {confirm.newColumns} column{confirm.newColumns === 1 ? '' : 's'}, reuses{' '}
        {confirm.columns.length - confirm.newColumns}.
      </li>
      {confirm.overwrites > 0 && (
        <li className="font-bold">
          Replaces {confirm.overwrites} mark{confirm.overwrites === 1 ? '' : 's'} already
          entered.
        </li>
      )}
      {confirm.skipped > 0 && (
        <li>
          {confirm.skipped} row{confirm.skipped === 1 ? '' : 's'} skipped.
        </li>
      )}
      {confirm.ungraded > 0 && (
        <li className="font-bold">
          {confirm.ungraded} student{confirm.ungraded === 1 ? '' : 's'} get no marks from this
          file.
        </li>
      )}
      <li className="text-2xs">It all lands together, or none of it does.</li>
    </ul>
  )
}

function MatchStage({
  report,
  picks,
  setPicks,
  students,
  onBack,
  onNext,
  busy,
}: {
  report: MatchReport
  picks: Map<number, string | null>
  setPicks: (next: Map<number, string | null>) => void
  students: RosterPerson[]
  onBack: () => void
  onNext: () => void
  busy: boolean
}) {
  const buckets = useMemo(
    () => ({
      exact: report.rows.filter((r) => r.bucket === 'exact'),
      ambiguous: report.rows.filter((r) => r.bucket === 'ambiguous'),
      fuzzy: report.rows.filter((r) => r.bucket === 'fuzzy'),
      unmatched: report.rows.filter((r) => r.bucket === 'unmatched'),
    }),
    [report],
  )

  function set(index: number, studentId: string | null) {
    const next = new Map(picks)
    next.set(index, studentId)
    setPicks(next)
  }

  const chosen = [...picks.values()].filter(Boolean).length

  return (
    <>
      <Card pad="tight" className="space-y-1 text-sm">
        <SectionLabel>3 · Review the names</SectionLabel>
        <p className="text-xs text-muted">
          {buckets.exact.length} matched exactly · {buckets.fuzzy.length} to check ·{' '}
          {buckets.ambiguous.length} ambiguous · {buckets.unmatched.length} with no student
          {report.skipped.length > 0 &&
            ` · ${report.skipped.length} heading row${report.skipped.length === 1 ? '' : 's'} ignored`}
        </p>
      </Card>

      {buckets.ambiguous.length > 0 && (
        <Group
          label="Ambiguous — pick one"
          tone="danger"
          note="These names match more than one student, and two real people can share a name. Nothing here is ticked for you."
          items={buckets.ambiguous}
          picks={picks}
          onPick={set}
          students={students}
        />
      )}
      {buckets.fuzzy.length > 0 && (
        <Group
          label="Close, not certain"
          tone="warn"
          note="These differ only by an initial or similar. An initial is often the only thing telling two students apart, so none of these is ticked for you."
          items={buckets.fuzzy}
          picks={picks}
          onPick={set}
          students={students}
        />
      )}
      {buckets.unmatched.length > 0 && (
        <Group
          label="No student in the app"
          tone="neutral"
          note="These rows are skipped. An import never creates a student."
          items={buckets.unmatched}
          picks={picks}
          onPick={set}
          students={students}
        />
      )}
      {buckets.exact.length > 0 && (
        <Group
          label={`Matched exactly (${buckets.exact.length})`}
          tone="success"
          note="Untick any you would rather skip."
          items={buckets.exact}
          picks={picks}
          onPick={set}
          students={students}
        />
      )}

      {report.missingFromSheet.length > 0 && (
        <Card pad="tight" className="space-y-1 border-warn bg-warn-solid/10">
          <SectionLabel>
            {report.missingFromSheet.length} students get nothing from this file
          </SectionLabel>
          <p className="text-xs text-warn">
            Not matched to any row. If that is a surprise, this is probably the wrong file or
            the wrong section.
          </p>
          <p className="text-xs text-muted">
            {report.missingFromSheet.map((s) => s.fullName).join(' · ')}
          </p>
        </Card>
      )}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" loading={busy} disabled={chosen === 0} onClick={onNext}>
          {chosen === 0
            ? 'Nothing selected'
            : `Review ${chosen} student${chosen === 1 ? '' : 's'}`}
        </Button>
      </div>
    </>
  )
}

function Group({
  label,
  tone,
  note,
  items,
  picks,
  onPick,
  students,
}: {
  label: string
  tone: 'success' | 'warn' | 'danger' | 'neutral'
  note: string
  items: MatchResult[]
  picks: Map<number, string | null>
  onPick: (index: number, studentId: string | null) => void
  students: RosterPerson[]
}) {
  return (
    <div className="space-y-2">
      <SectionLabel action={<Chip tone={tone} size="sm">{items.length}</Chip>}>{label}</SectionLabel>
      <p className="px-1 text-2xs text-muted">{note}</p>
      <Rows>
        {items.map((item) => {
          const picked = picks.get(item.row.index) ?? null
          return (
            <div key={item.row.index} className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm">{item.row.rawName}</span>
                <span className="shrink-0 text-2xs text-muted">row {item.row.index + 1}</span>
              </div>
              <Select
                aria-label={`Student for ${item.row.rawName}`}
                value={picked ?? ''}
                onChange={(e) => onPick(item.row.index, e.target.value || null)}
                className={cn(picked === null && 'text-muted')}
              >
                <option value="">Skip this row</option>
                {/* Candidates first, then everyone, so an ambiguous row still
                    allows the right answer when neither candidate is it. */}
                {item.candidates.length > 0 && (
                  <optgroup label="Suggested">
                    {item.candidates.map((c) => (
                      <option key={c.studentId} value={c.studentId}>
                        {c.fullName}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Everyone">
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </div>
          )
        })}
      </Rows>
    </div>
  )
}

/** "AB" → 27. Empty or unparseable → null. */
function parseColumn(raw: string): number | null {
  const s = raw.trim().toUpperCase()
  if (!/^[A-Z]{1,3}$/.test(s)) return null
  let n = 0
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function rowsPreviewCount(sheet: ParsedSheet, structure: SheetStructure): number {
  return collectRows(sheet, structure).length
}
