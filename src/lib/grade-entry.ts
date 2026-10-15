/**
 * Turning what the instructor types into a score, and what they paste into a
 * column of them.
 *
 * Pure and tested because every one of these failure modes is silent: a value
 * that parses to the wrong number, or a paste that lands one row off, produces
 * a grade that looks completely ordinary. Nothing here talks to the database.
 */

/** Mirrors `numeric(6,2)` on grade_scores.score and grade_items.max_score. */
export const SCORE_MAX = 9999.99
export const SCORE_DECIMALS = 2

export type ParsedScore =
  | { ok: true; value: number | null }
  | { ok: false; reason: string }

/**
 * Read one cell.
 *
 * ⚠ AN EMPTY CELL IS `null`, WHICH IS NOT ZERO. Clearing a cell deletes the
 * row, which takes the item out of that student's in-progress denominator;
 * typing 0 stores a real mark. That distinction is the whole reason the app can
 * show an honest "so far" figure at all, so it starts here.
 *
 * Deliberately stricter than `Number()`: that accepts '1e3', ' 12 ', '0x10' and
 * '-5', and a score of 1000 arriving from a typo'd exponent is exactly the kind
 * of thing nobody would catch by eye. Only plain decimals get through.
 */
export function parseScoreInput(raw: string): ParsedScore {
  const s = raw.trim()
  if (s === '') return { ok: true, value: null }

  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(s)) {
    // Covers letters, a stray minus, exponents and thousands separators. The
    // message names what IS accepted rather than what was wrong — the input is
    // one cell wide and there is no room for a diagnosis.
    return { ok: false, reason: 'Only a number, like 18 or 18.5.' }
  }

  const n = Number(s)
  if (!Number.isFinite(n)) return { ok: false, reason: 'Only a number, like 18 or 18.5.' }
  if (n > SCORE_MAX) return { ok: false, reason: `That is above the largest score, ${SCORE_MAX}.` }

  // Round here rather than letting Postgres do it on the way in: numeric(6,2)
  // would silently truncate 18.567 to 18.57 and the cell would keep showing
  // what was typed until the next reload.
  const f = 10 ** SCORE_DECIMALS
  return { ok: true, value: Math.round(n * f) / f }
}

/** How a stored score is written back into an input. */
export function formatScoreInput(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  // No trailing zeros: 18 reads as "18", not "18.00". The grade figures above
  // the grid are the ones that want two decimals; a cell wants what was typed.
  return String(value)
}

/**
 * Split a clipboard paste into one value per row.
 *
 * Excel copies a column as newline-separated text with a trailing newline, and
 * a BLOCK as tab-separated columns. Only the first column is taken: filling
 * sideways would need to know which items the other columns belong to, and
 * guessing that wrong writes marks into the wrong quiz.
 *
 * An empty line in the MIDDLE is kept, because it means "clear this one" — a
 * column copied out of Excel has a gap exactly where the student was unmarked.
 * Only a single trailing empty is dropped, since that is the copy itself.
 */
export function parsePastedColumn(text: string): string[] {
  if (text === '') return []
  const lines = text.split(/\r\n|\n|\r/).map((line) => line.split('\t')[0].trim())
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Is this paste worth treating as a column rather than an ordinary edit? */
export function isColumnPaste(text: string): boolean {
  return /\r|\n/.test(text.replace(/(\r\n|\n|\r)$/, ''))
}

/**
 * A mark above the item's maximum.
 *
 * Allowed — bonus marks are real and the component transmutes past 100 — but
 * flagged, because the same shape is produced by typing 95 into a quiz out of
 * 20. Clamping would turn that typo into a plausible full mark.
 */
export function isOverMax(value: number | null, maxScore: number): boolean {
  return value !== null && value > maxScore
}
