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
