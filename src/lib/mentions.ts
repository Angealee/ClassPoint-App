/**
 * Resolving `@name` in a chat message to student ids.
 *
 * ── WHY THE CLIENT RESOLVES THESE, NOT THE SERVER ──────────────────────────
 * `send_message` takes an explicit `uuid[]`. The alternative — parsing the body
 * in SQL — means the database guessing which "Maria" was meant out of three,
 * and getting it wrong sends a push to the wrong person. Here the roster is
 * already in hand, so the match is against real display names.
 *
 * The server still validates every id it is handed, so a doctored client can
 * only mention people who actually exist.
 */

export interface MentionCandidate {
  id: string
  displayName: string
}

/** Escape a display name for use inside a regular expression. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Every candidate whose name is @-mentioned in `body`, deduplicated.
 *
 * ⚠ THREE RULES THAT ARE EASY TO GET WRONG, all pinned by the test:
 *
 *   1. LONGEST NAME FIRST. With "Maria" and "Maria Santos" both on the roster,
 *      scanning shortest-first matches "Maria" inside "@Maria Santos" and
 *      notifies the wrong person. Candidates are sorted by length descending.
 *
 *   2. THE `@` MUST NOT FOLLOW A WORD CHARACTER. Otherwise every email address
 *      in a message mentions somebody — "mail me at koby@Maria.com" would ping
 *      Maria.
 *
 *   3. THE NAME MUST END ON A BOUNDARY. "@Ann" must not match inside "@Anna",
 *      which would notify Ann every time somebody addressed Anna.
 */
export function resolveMentions(body: string, candidates: MentionCandidate[]): string[] {
  if (!body || candidates.length === 0) return []

  const byLongest = [...candidates].sort(
    (a, b) => b.displayName.length - a.displayName.length,
  )

  const found: string[] = []
  // Matches are CONSUMED as they are found — blanked out of a working copy —
  // so a shorter name can never match inside a longer one that already
  // matched. Sorting alone is not enough: without this, "@Maria Santos"
  // resolves to BOTH Maria Santos and Maria, and the wrong person gets a push.
  let work = body

  for (const c of byLongest) {
    const name = c.displayName.trim()
    if (!name) continue
    // (^|[^\w@]) — the @ may not follow a word character (rule 2) or another @.
    // (?![\w])   — the name may not run straight into more letters (rule 3).
    const re = new RegExp(`(^|[^\\w@])@${escapeRe(name)}(?![\\w])`, 'gi')
    const next = work.replace(re, (m) => ' '.repeat(m.length))
    if (next !== work) {
      work = next
      if (!found.includes(c.id)) found.push(c.id)
    }
  }
  return found
}

// ── Typing an @mention ──────────────────────────────────────────────────────

/** Longer than any real name anyone will type before giving up. */
const MAX_QUERY = 24

export interface MentionQuery {
  /** What the caret is currently searching for, without the `@`. */
  query: string
  /** Index of the `@` in the full value, for replacing on select. */
  start: number
}

/**
 * The @mention being typed at the caret, or null.
 *
 * Anchored to an `@` that starts the string or follows whitespace, so an email
 * address never opens the picker. The query may hold ONE space, because half
 * the names in this class are two words and "@Maria S" has to keep matching;
 * past that the query stops matching anybody and the picker closes on its own,
 * which is the right behaviour for a sentence that happens to contain an `@`.
 */
export function mentionQuery(beforeCaret: string): MentionQuery | null {
  const at = beforeCaret.lastIndexOf('@')
  if (at === -1) return null
  if (at > 0 && !/\s/.test(beforeCaret[at - 1])) return null

  const query = beforeCaret.slice(at + 1)
  if (query.length > MAX_QUERY) return null
  if (/[@\n]/.test(query)) return null
  // At most one space — see above.
  if ((query.match(/ /g) ?? []).length > 1) return null
  return { query, start: at }
}

/** People whose name starts with, or contains, what has been typed so far. */
export function matchMentions(
  query: string,
  candidates: MentionCandidate[],
  limit = 6,
): MentionCandidate[] {
  const q = query.trim().toLowerCase()
  const scored = candidates
    .map((c) => ({ c, i: c.displayName.toLowerCase().indexOf(q) }))
    .filter((x) => q === '' || x.i !== -1)
    // A prefix match is what you meant; a mid-name match is a fallback.
    .sort((a, b) => a.i - b.i || a.c.displayName.localeCompare(b.c.displayName))
  return scored.slice(0, limit).map((x) => x.c)
}

/**
 * Insert a chosen name over the query being typed.
 *
 * The trailing space is not a nicety: without it the next thing typed runs into
 * the name, and `resolveMentions` requires the name not to be followed by a
 * word character — so the mention this picker just inserted would not resolve.
 */
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
