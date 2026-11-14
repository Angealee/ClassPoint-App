
export const SCORE_MAX = 9999.99
export const SCORE_DECIMALS = 2

export type ParsedScore =
  | { ok: true; value: number | null; absent?: boolean }
  | { ok: false; reason: string }

export function parseScoreInput(raw: string): ParsedScore {
  const s = raw.trim()
  if (s === '') return { ok: true, value: null }

  if (/^(a|ab|abs|absent)$/i.test(s)) return { ok: true, value: null, absent: true }

  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(s)) {
    return { ok: false, reason: 'Only a number, like 18 or 18.5, or A for absent.' }
  }

  const n = Number(s)
  if (!Number.isFinite(n)) return { ok: false, reason: 'Only a number, like 18 or 18.5, or A for absent.' }
  if (n > SCORE_MAX) return { ok: false, reason: `That is above the largest score, ${SCORE_MAX}.` }

  const f = 10 ** SCORE_DECIMALS
  return { ok: true, value: Math.round(n * f) / f }
}

/** How a stored score is written back into an input. */
export function formatScoreInput(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function parsePastedColumn(text: string): string[] {
  if (text === '') return []
  const lines = text.split(/\r\n|\n|\r/).map((line) => line.split('\t')[0].trim())
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

export function isColumnPaste(text: string): boolean {
  return /\r|\n/.test(text.replace(/(\r\n|\n|\r)$/, ''))
}

export function isOverMax(value: number | null, maxScore: number): boolean {
  return value !== null && value > maxScore
}
