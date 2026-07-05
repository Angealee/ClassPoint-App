/**
 * App changelog / "What's new" notes.
 *
 * To announce a change to users: add a new entry at the TOP of CHANGELOG with a
 * bumped `version`. On the next app open, anyone who hasn't seen that version
 * gets the WhatsNew sheet listing every release they've missed. That's the whole
 * workflow — no other wiring needed.
 */

/** A main update with its sub-module bullet points. */
export interface ChangelogSection {
  /** The headline change (the "main update"). */
  heading: string
  /** The detail bullets under it (the "sub-module updates"). */
  items: string[]
}

export interface ChangelogEntry {
  /** Semver-ish "major.minor.patch". Must increase for each new release. */
  version: string
  /** ISO date (YYYY-MM-DD) the release shipped. */
  date: string
  /** Short headline for the release. */
  title: string
  /** Flat bullet points (legacy entries). */
  items?: string[]
  /**
   * Grouped updates: each main update with its sub-module bullets. Preferred for
   * new entries. While a release is still being built, keep ADDING to the
   * current entry's sections instead of bumping the version each time.
   */
  sections?: ChangelogSection[]
}

// Newest first. Prepend a new entry for every user-facing change.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.0.0',
    date: '2026-07-05',
    title: 'Attendance, profiles & more',
    sections: [
      {
        heading: 'New: check in by scanning a QR',
        items: [
          'Open the new Attendance tab and tap “Scan attendance” to check in to class with your instructor’s on-screen QR code.',
          'The QR refreshes every few seconds, so a screenshot won’t let someone check in for you.',
          'You’re marked Present, Late, or Absent based on when you scan — see it all in your attendance history.',
        ],
      },
      {
        heading: 'Attendance — for instructors',
        items: [
          'Start a class from the Attendance tab: set the topic and the late/absent timing, then show the rotating QR.',
          'Watch the roster fill in live as students check in, then review and correct anyone before finalising.',
          'Tap any student on the live roster to check them in by hand — for anyone with no internet to scan — or reset them back to waiting.',
          'Present the QR fullscreen so a whole class can scan from a projector, and search or filter a long roster to find someone fast.',
          'The QR stops once the Absent-after time passes, the section picker stays pinned at the top, and you can edit or delete a past session.',
          'Late and absent penalties are applied on finalise, and every session can be exported to Excel.',
        ],
      },
      {
        heading: 'Reset your PIN yourself',
        items: [
          'Forgot your PIN? Tap “Forgot your PIN?” on sign-in, get a one-time reset code from your instructor, then choose a new one.',
          'Instructors can issue a reset code straight from the roster — tap the key icon next to any claimed student.',
        ],
      },
      {
        heading: 'See who viewed your profile',
        items: [
          'Your profile now shows who recently viewed it — with their photo and name, just like “seen by”.',
          'Check your total profile views on your Profile tab and your own preview. Only you can see this.',
        ],
      },
      {
        heading: 'Show off with photo banners',
        items: [
          'Add up to 3 showcase photos to your profile (≤ 5 MB each) — classmates see them when they tap you on the leaderboard.',
        ],
      },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-07-02',
    title: 'Forgot your PIN?',
    items: [
      'Forgot your PIN? Tap “Forgot your PIN?” on the sign-in screen, ask your instructor for a one-time reset code, then choose a new PIN.',
      'Instructors can issue a reset code straight from the roster — tap the key icon next to any student who has claimed their account.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-06-27',
    title: 'Leaderboard glow-up',
    sections: [
      {
        heading: 'A winners’ podium worth climbing',
        items: [
          'The top 3 now stand on a real podium with a platform base, a gold spotlight, and a confetti pop when the board opens.',
          'A gold ring around each top-3 avatar shows their level progress.',
          'Tap a podium spot for a quick spotlight before their profile opens.',
        ],
      },
      {
        heading: 'Your rank, front and center',
        items: [
          'A “Your rank” band shows your standing — even when you’re outside the top 10.',
          'See if you climbed or slipped since the last update, and how many points to the next spot.',
        ],
      },
      {
        heading: 'New update times',
        items: [
          'The leaderboard now settles at 12:30 PM and 7:30 PM (the midday update moved from 7:30 AM).',
        ],
      },
      {
        heading: 'Cleaner and easier to read',
        items: [
          'Tidier header with the scope and countdown on one line, plus a recap when you return after being away.',
        ],
      },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-06-25',
    title: 'Section leaderboards & mobile polish',
    items: [
      'View any section’s leaderboard, not just the global one — use the new picker on the Leaderboard screen.',
      'The top-3 podium now fits neatly on phones — no more cramped rank 1 / 2 / 3 cards.',
      'Instructors can now award more than 5 points at once with the Custom amount.',
    ],
  },
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
