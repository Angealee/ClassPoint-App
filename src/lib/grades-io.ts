import { GRADE_COMPONENTS } from '@/lib/grading'
import { isLikelyHeading } from '@/lib/grade-match'
import type { GradeComponent } from '@/lib/types'

/**
 * Reading the instructor's grade spreadsheet.
 *
 * ⚠ EVERYTHING HERE IS A SUGGESTION. Detection reads the merged group headers
 * and the totals row, which works on the file this was built against — and one
 * inserted column shifts all of it. So the importer shows what was detected
 * next to the real header text and writes nothing until a person confirms it.
 * A wrong total rescales the whole class, which is the exact failure the
 * grades feature exists to remove.
 *
 * `xlsx` is heavy, so — like roster-io.ts — it is imported dynamically and this
 * module is only pulled in when the instructor actually imports.
 */

export interface ParsedSheet {
  name: string
  /** Every cell as a trimmed string; ragged rows are padded by the reader. */
  rows: string[][]
  /** Merged ranges, 0-based and inclusive — the group headers live in these. */
  merges: { r1: number; c1: number; r2: number; c2: number }[]
}

/** 0-based, inclusive. */
export interface ColumnRange {
  from: number
  to: number
}

export interface ComponentPlan {
  range: ColumnRange | null
  /** What the component is out of. Typed by the instructor, suggested here. */
  total: number | null
}

export interface SheetStructure {
  nameColumn: number
  /** The row holding each component's total — row 2 in the instructor's file. */
  totalRow: number
  firstDataRow: number
  components: Record<GradeComponent, ComponentPlan>
}

/** What one student's row amounts to, once the ranges are agreed. */
export interface ImportRow {
  index: number
  rawName: string
  /** The SUM of that component's columns, or null when every cell is blank. */
  totals: Record<GradeComponent, number | null>
}

const HEADER_PATTERNS: Array<[GradeComponent, RegExp]> = [
  ['performance_task', /perform|task|activit/i],
  ['quiz', /quiz/i],
  ['recitation', /recit|oral|particip/i],
  ['exam', /exam|final\s*test/i],
]

export async function parseGradeWorkbook(file: File): Promise<ParsedSheet[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })

  return wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: true,
      defval: '',
    })
    const width = raw.reduce((w, r) => Math.max(w, r.length), 0)
    const rows = raw.map((r) =>
      Array.from({ length: width }, (_, i) => String(r[i] ?? '').trim()),
    )
    const merges = (sheet['!merges'] ?? []).map((m) => ({
      r1: m.s.r,
      c1: m.s.c,
      r2: m.e.r,
      c2: m.e.c,
    }))
    return { name, rows, merges }
  })
}

function isNumeric(value: string): boolean {
  return value !== '' && Number.isFinite(Number(value))
}

/**
 * Guess the layout.
 *
 * The name column is the one carrying the most non-numeric text in the body —
 * a roster has exactly one such column and everything else is marks. The totals
 * row is the last row before the body that still holds numbers, which is where
 * "50 / 100 / 100 / 50" lives in the instructor's file.
 */
export function detectStructure(sheet: ParsedSheet): SheetStructure {
  const rows = sheet.rows
  const width = rows[0]?.length ?? 0

  // ⚠ ORDER MATTERS, and the first attempt got it backwards. Finding the body
  // first and the name column second looks natural, but the instructor's
  // totals row carries "FULL NAME" in the name column — text beside numbers,
  // which is exactly the shape of a student row. It was read as the first
  // student, and every range and total shifted a row with it.
  //
  // So: the name column is found across the WHOLE sheet, and the body then
  // starts at the first row whose name is an actual name.
  let nameColumn = 0
  let best = -1
  for (let c = 0; c < width; c += 1) {
    let score = 0
    for (let r = 0; r < rows.length; r += 1) {
      const v = rows[r][c]
      if (v !== '' && !isNumeric(v)) score += 1
    }
    if (score > best) {
      best = score
      nameColumn = c
    }
  }

  let firstDataRow = rows.length
  for (let r = 0; r < rows.length; r += 1) {
    const name = rows[r][nameColumn] ?? ''
    if (name === '' || isLikelyHeading(name)) continue
    firstDataRow = r
    break
  }

  // The totals row: the last row above the body holding at least two numbers.
  let totalRow = Math.max(0, firstDataRow - 1)
  for (let r = firstDataRow - 1; r >= 0; r -= 1) {
    if (rows[r].filter(isNumeric).length >= 2) {
      totalRow = r
      break
    }
  }

  const components = {} as Record<GradeComponent, ComponentPlan>
  for (const component of GRADE_COMPONENTS) components[component] = { range: null, total: null }

  // Group headers live in the merged cells of the rows above the body.
  for (const merge of sheet.merges) {
    if (merge.r1 >= firstDataRow) continue
    const label = sheet.rows[merge.r1]?.[merge.c1] ?? ''
    const hit = HEADER_PATTERNS.find(([, re]) => re.test(label))
    if (!hit) continue
    const [component] = hit
    if (components[component].range) continue
    components[component] = {
      range: { from: merge.c1, to: merge.c2 },
      total: suggestTotal(rows, totalRow, merge.c1, merge.c2),
    }
  }

  // A single unmerged header cell — how the Exam column is usually written.
  for (let r = 0; r < firstDataRow; r += 1) {
    for (let c = 0; c < width; c += 1) {
      const hit = HEADER_PATTERNS.find(([, re]) => re.test(rows[r][c]))
      if (!hit) continue
      const [component] = hit
      if (components[component].range) continue
      components[component] = {
        range: { from: c, to: c },
        total: suggestTotal(rows, totalRow, c, c),
      }
    }
  }

  return { nameColumn, totalRow, firstDataRow, components }
}

/**
 * The first number at or after the range start, on the totals row.
 *
 * In the instructor's file the component total is written twice — once at the
 * head of the range and again under the TOTAL column — so taking the first one
 * at or after the start picks the same value either way.
 */
function suggestTotal(rows: string[][], totalRow: number, from: number, to: number): number | null {
  const row = rows[totalRow]
  if (!row) return null
  for (let c = from; c < row.length && c <= Math.max(to, from); c += 1) {
    if (isNumeric(row[c])) return Number(row[c])
  }
  // Nothing inside the range — look just past it, where a TOTAL column sits.
  for (let c = to + 1; c < Math.min(row.length, to + 3); c += 1) {
    if (isNumeric(row[c])) return Number(row[c])
  }
  return null
}

/**
 * Collapse each student's row into one figure per component.
 *
 * Imported terms store ONE combined column per component (the source sheet has
 * no per-item maximum, so nothing per-item can be recovered without guessing),
 * which makes the sum the whole payload.
 *
 * ⚠ A component whose cells are ALL blank yields null, not 0 — the same
 * blank-versus-zero rule the rest of the feature runs on. Importing a zero
 * there would mark every student as having scored nothing.
 */
export function collectRows(sheet: ParsedSheet, structure: SheetStructure): ImportRow[] {
  const out: ImportRow[] = []

  for (let r = structure.firstDataRow; r < sheet.rows.length; r += 1) {
    const row = sheet.rows[r]
    const rawName = row[structure.nameColumn] ?? ''
    if (rawName === '') continue

    const totals = {} as Record<GradeComponent, number | null>
    for (const component of GRADE_COMPONENTS) {
      const plan = structure.components[component]
      if (!plan.range) {
        totals[component] = null
        continue
      }
      let sum = 0
      let seen = 0
      for (let c = plan.range.from; c <= plan.range.to && c < row.length; c += 1) {
        if (!isNumeric(row[c])) continue
        sum += Number(row[c])
        seen += 1
      }
      totals[component] = seen === 0 ? null : sum
    }

    out.push({ index: r, rawName, totals })
  }

  return out
}

/** Spreadsheet column letters, for showing a range the way the file does. */
export function columnLabel(index: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}
