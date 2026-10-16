/**
 * Facts about a route that the LAYOUT needs, not the screen.
 *
 * A chat room wants the whole width for its side panel, and the width belongs
 * to `Shell`, which is mounted above the router outlet and cannot ask the
 * screen for anything. The alternative — a context the screen sets in an effect
 * — flashes the narrow layout on every entry and earns a set-state-in-effect
 * warning for the privilege.
 *
 * `ChatRoom` is mounted TWICE, under `/app/space` for students and
 * `/teach/space` for the instructor, so the test matches the shared tail rather
 * than either prefix. Keeping it here means the two layouts cannot disagree.
 */
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
 * The LANDING at `/teach/grades` stays narrow: it is a list of section cards,
 * and stretching a stack of rows across a 1440px display helps nobody. Same
 * split as the chat room and its room list.
 */
export function isGradeGrid(pathname: string): boolean {
  // The four tab values, NOT a wildcard segment. `…/<section>/<subject>/print`
  // is also three segments, and a wildcard matched it — harmless in practice,
  // since the print route renders outside `Shell` and never asks about width,
  // but a predicate that answers true for a URL it does not describe is how
  // the next reader gets misled.
  return /^\/teach\/grades\/[^/]+\/[^/]+\/(prelim|midterm|finals|overall)$/.test(pathname)
}

/**
 * Should this route use the full width?
 *
 * BOTH layouts must call this one function. It is tempting to widen only
 * `InstructorLayout` for an instructor-only screen, and that is precisely the
 * divergence this file exists to prevent — the next wide route would then have
 * to remember to touch two places.
 */
export function isWideRoute(pathname: string): boolean {
  return isChatRoom(pathname) || isGradeGrid(pathname)
}
