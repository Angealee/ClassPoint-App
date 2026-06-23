/**
 * App changelog / "What's new" notes.
 *
 * To announce a change to users: add a new entry at the TOP of CHANGELOG with a
 * bumped `version`. On the next app open, anyone who hasn't seen that version
 * gets the WhatsNew sheet listing every release they've missed. That's the whole
 * workflow — no other wiring needed.
 */

export interface ChangelogEntry {
  /** Semver-ish "major.minor.patch". Must increase for each new release. */
  version: string
  /** ISO date (YYYY-MM-DD) the release shipped. */
  date: string
  /** Short headline for the release. */
  title: string
  /** User-facing bullet points — plain language, no jargon. */
  items: string[]
}

// Newest first. Prepend a new entry for every user-facing change.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.4.0',
    date: '2026-06-23',
    title: 'Smoother on mobile',
    items: [
      'The winners’ podium is back on the leaderboard — and now you can tap any player (podium or list) to open their profile.',
      'Pop-up panels feel snappier on phones: swipe them down to close, with smoother open/close animations.',
      'Added this “What’s new” screen so you’ll always know what changed.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-06-23',
    title: 'Classmate profiles',
    items: [
      'Tap anyone on the leaderboard to open their profile — level, rank, points, and their recent points history.',
      'Add a short bio and your interests in Profile so classmates can get to know you.',
      'Use the new “Preview” button in Profile to see exactly what others see.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-15',
    title: 'Notifications & sounds',
    items: [
      'Get push notifications for new points, level-ups, and rank changes — even when the app is closed.',
      'Sound and vibration alerts, each toggleable in Profile.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-06-01',
    title: 'Profile pictures & penalties',
    items: [
      'Set your own profile picture.',
      'Penalty deductions now show clearly in your points feed.',
    ],
  },
]

export const LATEST_VERSION = CHANGELOG[0]?.version ?? '0.0.0'

const SEEN_KEY = 'cp_seen_changelog_version'

export function getSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

export function setSeenVersion(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version)
  } catch {
    // Storage may be unavailable (private mode) — failing silently is fine.
  }
}

/** Compare "a.b.c" version strings. Returns 1 if a > b, -1 if a < b, else 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

/**
 * Releases the user hasn't acknowledged yet (newest first).
 * First run on a device shows only the latest release as a one-time highlight,
 * so brand-new users aren't buried in the full history.
 */
export function unseenEntries(): ChangelogEntry[] {
  const seen = getSeenVersion()
  if (!seen) return CHANGELOG.slice(0, 1)
  return CHANGELOG.filter((e) => compareVersions(e.version, seen) > 0)
}
