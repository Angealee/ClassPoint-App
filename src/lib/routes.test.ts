import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every screen must be reachable by tapping.
 *
 * This exists because two screens were orphaned in production: `/app/history`
 * and `/app/attendance/stats` had their only links deleted when the Dashboard
 * was reverted. Nothing caught it — the routes still resolved, the build was
 * green, and the screens were simply unreachable for live students. A third,
 * `/teach/semesters`, had never been linked at all, which hid term dates,
 * subject creation and the whole semester rollover behind a typed URL.
 *
 * A pure-logic test in the spirit of the other five: it reads source text and
 * mocks nothing. It cannot prove a link is *visible* — only that some file
 * references the path. That is the cheap 90% that would have caught the real bug.
 *
 * The list is deliberately EXPLICIT rather than derived from the router. A
 * derived version has to model nested paths, `Navigate` redirects and
 * parameterised segments, and gets those wrong in both directions. Adding a
 * screen here by hand is a five-second cost paid once.
 */

const SRC = join(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

const FILES = walk(SRC).filter((f) => !f.endsWith('router.tsx'))

/**
 * Does any source file outside the router mention this path literally?
 *
 * BOTH quote styles, and that is not pedantry — the first version only matched
 * single quotes, which is how `navigate('/app/x')` is written. It therefore
 * could not see a perfectly good `<Link to="/app/x">`, and reported a linked
 * screen as orphaned. A reachability test that cries wolf gets ignored, which
 * is the one failure mode it cannot afford.
 */
function hasInboundLink(path: string): boolean {
  return FILES.some((f) => {
    const src = readFileSync(f, 'utf8')
    return src.includes(`'${path}'`) || src.includes(`"${path}"`)
  })
}

/**
 * Screens NOT in a bottom-tab bar, so a link is the only way in.
 *
 * Excluded on purpose: the four student tabs and four instructor tabs (the nav
 * arrays are the link); `/macalesideauth` (unlisted by design — linking it
 * defeats an unadvertised sign-in route); `/scan` (entered from a phone camera).
 */
const MUST_BE_LINKED = [
  // Student
  '/app/points',
  '/app/history',
  '/app/achievements',
  '/app/attendance/stats',
  '/app/settings',
  '/app/spenders',
  // Instructor
  '/teach/ops',
  '/teach/redemptions',
  '/teach/semesters',
]

describe('route reachability', () => {
  it.each(MUST_BE_LINKED)('%s is reachable from somewhere in the app', (path) => {
    expect(hasInboundLink(path)).toBe(true)
  })
})
