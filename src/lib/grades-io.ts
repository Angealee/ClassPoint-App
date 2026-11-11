import { GRADE_COMPONENTS } from '@/lib/grading'
import { isLikelyHeading } from '@/lib/grade-match'
import type { GradeComponent } from '@/lib/types'

export interface ParsedSheet {
  name: string
  rows: string[][]
  merges: { r1: number; c1: number; r2: number; c2: number }[]
}

/** 0-based, inclusive. */
export interface ColumnRange {
  from: number
  to: number
}

export interface ComponentPlan {
  range: ColumnRange | null
  total: number | null
}

export interface SheetStructure {
  nameColumn: number
  totalRow: number
  firstDataRow: number
  components: Record<GradeComponent, ComponentPlan>
}

export interface ImportRow {
  index: number
  rawName: string
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

export function detectStructure(sheet: ParsedSheet): SheetStructure {
  const rows = sheet.rows
  const width = rows[0]?.length ?? 0

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

  let totalRow = Math.max(0, firstDataRow - 1)
  for (let r = firstDataRow - 1; r >= 0; r -= 1) {
    if (rows[r].filter(isNumeric).length >= 2) {
      totalRow = r
      break
    }
  }

  const components = {} as Record<GradeComponent, ComponentPlan>
  for (const component of GRADE_COMPONENTS) components[component] = { range: null, total: null }

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

function suggestTotal(rows: string[][], totalRow: number, from: number, to: number): number | null {
  const row = rows[totalRow]
  if (!row) return null
  for (let c = from; c < row.length && c <= Math.max(to, from); c += 1) {
    if (isNumeric(row[c])) return Number(row[c])
  }
  for (let c = to + 1; c < Math.min(row.length, to + 3); c += 1) {
    if (isNumeric(row[c])) return Number(row[c])
  }
  return null
}

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

export function columnLabel(index: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}
