/**
 * Facts about a route that the LAYOUT needs, not the screen.
 *
 * A chat room wants the whole width for its side panel and a grade sheet wants
 * the whole window, and width belongs to `Shell`, which is mounted above the
 * router outlet and cannot ask the screen for anything. The alternative — a
 * context the screen sets in an effect — flashes the narrow layout on every
 * entry and earns a set-state-in-effect warning for the privilege.
 *
 * `ChatRoom` is mounted TWICE, under `/app/space` for students and
 * `/teach/space` for the instructor, so the test matches the shared tail rather
 * than either prefix. Keeping it here means the two layouts cannot disagree.
 */

/**
 * How much of the window a route may use.
 *
 * `reading` — the 672px column almost every screen uses.
 * `wide`    — grows to the RIGHT only, keeping the left margin a centred layout
 *             would have had, so the sidebar never shifts when you enter or
 *             leave. The chat room's rule, and the reason it is not `full`.
 * `full`    — edge to edge, sidebar collapsed to an icon rail, viewport height
 *             pinned on desktop so the screen can hand its scrolling to one
 *             child. For a grid, where every pixel is a column you can read.
 */
export type RouteWidth = 'reading' | 'wide' | 'full'

export function isChatRoom(pathname: string): boolean {
  return /\/space\/chat\/[^/]+$/.test(pathname)
}

/**
 * One grade sheet: `/teach/grades/<section>/<subject>/<term>`.
 *
 * The scope lives in the PATH rather than in `?section=…` for exactly this
 * reason — `Shell` only ever sees `pathname`, so a query-string scope would
 * make the width undecidable here and the grid would be stuck in the 672px
 * reading column.
 *
 * The four tab values, NOT a wildcard segment:
 * `…/<section>/<subject>/print` is also three segments, and a wildcard matched
 * it — harmless in practice, since the print route renders outside `Shell` and
 * never asks about width, but a predicate that answers true for a URL it does
 * not describe is how the next reader gets misled.
 *
 * The LANDING at `/teach/grades` stays in the reading column: it is a list of
 * section cards, and stretching a stack of rows across a 1920px display helps
 * nobody. Same split as the chat room and its room list.
 */
export function isGradeGrid(pathname: string): boolean {
  return /^\/teach\/grades\/[^/]+\/[^/]+\/(prelim|midterm|finals|overall)$/.test(pathname)
}

/**
 * The one answer both layouts ask for.
 *
 * It is tempting to widen only `InstructorLayout` for an instructor-only
 * screen, and that is precisely the divergence this file exists to prevent —
 * the next wide route would then have to remember to touch two places.
 */
export function routeWidth(pathname: string): RouteWidth {
  if (isGradeGrid(pathname)) return 'full'
  if (isChatRoom(pathname)) return 'wide'
  return 'reading'
}
