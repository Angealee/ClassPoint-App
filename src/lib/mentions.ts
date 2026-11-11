
export interface MentionCandidate {
  id: string
  displayName: string
}

/** Escape a display name for use inside a regular expression. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function resolveMentions(body: string, candidates: MentionCandidate[]): string[] {
  if (!body || candidates.length === 0) return []

  const byLongest = [...candidates].sort(
    (a, b) => b.displayName.length - a.displayName.length,
  )

  const found: string[] = []
  let work = body

  for (const c of byLongest) {
    const name = c.displayName.trim()
    if (!name) continue
    const re = new RegExp(`(^|[^\\w@])@${escapeRe(name)}(?![\\w])`, 'gi')
    const next = work.replace(re, (m) => ' '.repeat(m.length))
    if (next !== work) {
      work = next
      if (!found.includes(c.id)) found.push(c.id)
    }
  }
  return found
}

/** Longer than any real name anyone will type before giving up. */
const MAX_QUERY = 24

export interface MentionQuery {
  /** What the caret is currently searching for, without the `@`. */
  query: string
  /** Index of the `@` in the full value, for replacing on select. */
  start: number
}

export function mentionQuery(beforeCaret: string): MentionQuery | null {
  const at = beforeCaret.lastIndexOf('@')
  if (at === -1) return null
  if (at > 0 && !/\s/.test(beforeCaret[at - 1])) return null

  const query = beforeCaret.slice(at + 1)
  if (query.length > MAX_QUERY) return null
  if (/[@\n]/.test(query)) return null
  // At most two spaces — see above.
  if ((query.match(/ /g) ?? []).length > 2) return null
  return { query, start: at }
}

export function matchMentions(
  query: string,
  candidates: MentionCandidate[],
  limit = 6,
): MentionCandidate[] {
  const q = query.trim().toLowerCase()
  const scored = candidates
    .map((c) => ({ c, i: c.displayName.toLowerCase().indexOf(q) }))
    .filter((x) => q === '' || x.i !== -1)
    .sort((a, b) => a.i - b.i || a.c.displayName.localeCompare(b.c.displayName))
  return scored.slice(0, limit).map((x) => x.c)
}

export function applyMention(
  value: string,
  start: number,
  caret: number,
  displayName: string,
): { value: string; caret: number } {
  const insert = `@${displayName} `
  return {
    value: value.slice(0, start) + insert + value.slice(caret),
    caret: start + insert.length,
  }
}
