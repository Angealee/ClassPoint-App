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
