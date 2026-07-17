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
  /** Flags a headline feature — renders a "MAJOR" pill so it stands out. */
  major?: boolean
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

/**
 * THE OVERHAUL DRAFT — not visible to users yet.
 *
 * Per the user's decision (2026-07-16): all overhaul phases ship quietly and get
 * announced together as one big 3.0.0. Accumulate sections here as each phase
 * lands; when the user says "announce it", move this entry to the TOP of
 * CHANGELOG (and delete this const). Do NOT add per-phase entries to CHANGELOG.
 */
export const DRAFT_3_0_0: ChangelogEntry = {
  version: '3.0.0',
  date: '2026-07-16', // update to the real announce date when it ships
  title: 'The Overhaul 🚀',
  sections: [
    {
      heading: 'Notifications that actually show up',
      major: true,
      items: [
        'New bell in the header: every point, level-up, rank move and badge lands in one list you can scroll back through. The dot tells you what you missed.',
        'Push is rebuilt — notifications now reach your lock screen fast instead of trickling in late, even with the app fully closed.',
        'Nothing gets lost anymore: if a notification can’t be delivered right away, it retries on its own until it lands.',
        'New “Send test” button in Profile → Notifications: lock your phone, tap it, and confirm push works on your device.',
        'iPhone: push still needs ClassPoint added to your Home Screen (Share → Add to Home Screen). The bell works everywhere regardless.',
      ],
    },
    {
      heading: 'Share the board · flying comments',
      major: true,
      items: [
        'New Share button on the leaderboard: turn the rankings into a proper 1080×1350 image, sized for a story or a post. Pick Podium or Top 10, preview it, then share or save.',
        'Your rank rides along on the card — everyone has something to brag about, not just the top 3.',
        'Comments now fly across the leaderboard. Post one and the whole class sees it drift past their board in real time.',
        'Three comments a day each, they vanish after 24 hours, and your name rides with them — so keep it fun. Tap a quick chip if you can’t think of anything.',
        'Instructors can post too (badged as Instructor, no daily limit) and delete anything — tap a comment, or use the Recent comments list.',
      ],
    },
    {
      heading: 'Spend your points on your grades',
      major: true,
      items: [
        'New on your Home screen: Use points. Put up to 50 points toward a quiz, activity or exam and your instructor approves or declines it.',
        'Nothing is spent until it’s approved — and you can withdraw a request any time before that.',
        'Fair warning: spending really does cost you. Your points, level and leaderboard rank all drop, exactly like losing points. The app tells you the damage before you commit.',
        'A new gold gauge tracks everything you’ve ever cashed in, so your spending is a flex of its own.',
        'You’ll get a notification the moment your instructor decides, with their note if they left one.',
        'Instructors: a new inbox (the ticket icon) badges every waiting request — approve or decline with an optional note, and see who’s spent the most.',
      ],
    },
    {
      heading: 'Attendance, rebuilt',
      major: true,
      items: [
        'Two new marks: Excused and Irregular. Neither costs you points, and neither counts against your attendance — an excused class is simply left out of your show-up rate and never breaks your streak.',
        'Your show-up rate is now fairer: it only counts classes that actually counted.',
        'Instructors: sessions are grouped by week (“Week 5 · Jul 13–19”) so you can find any class at a glance.',
        'Instructors: tap any past session for a full page — everyone grouped by status, editable after the fact, exportable, deletable.',
        'Instructors: fixing attendance after finalising now adjusts points automatically. Mark someone present who was absent and their −5 comes straight back.',
        'Instructors: new Class history page — attendance % per student, a weekly show-up trend, an automatic “needs attention” list, and a one-tap Excel summary.',
      ],
    },
    {
      heading: 'Safety nets everywhere',
      items: [
        'Every risky action — deleting sessions, students, photos, or point awards — now asks you to confirm first. No more accidental oops.',
      ],
    },
  ],
}

// Newest first. Prepend a new entry for every user-facing change.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.2.0',
    date: '2026-07-06',
    title: 'The big update 🎉',
    sections: [
      {
        heading: 'QR Attendance',
        major: true,
        items: [
          'Students: open the Attendance tab and tap “Scan attendance” to check in with your instructor’s on-screen QR — you’re marked Present, Late, or Absent from when you scan.',
          'The QR refreshes every few seconds, so a screenshot can’t check in for someone else.',
          'Instructors: start a class with your own late/absent timing, watch the roster fill in live, and mark anyone by hand who has no internet.',
          'Show the QR fullscreen for a whole class to scan from a projector; the code stops once the Absent-after time passes.',
          'Review and correct everyone before finalising — penalties apply on finish, and any session exports to Excel.',
        ],
      },
      {
        heading: 'Achievements & titles',
        major: true,
        items: [
          'Unlock 30 illustrated badges for what you already do — earning points, showing up, building your profile, and climbing the ranks.',
          'Locked badges show your progress (like “7 / 12”), and a few are secret — hidden as “???” until you find them.',
          'The toughest badges grant a display title (like “The Overachiever Elite” or “The Eye of Seeing Everything”) you can equip — classmates see it on your profile.',
          'Pin your 3 favorite badges and browse everything in the new trophy case from your Profile. Every unlock pops a celebration.',
        ],
      },
      {
        heading: 'Show off with 3 photos',
        items: [
          'Add up to 3 showcase photos to your profile (≤ 5 MB each) — classmates see them when they tap you on the leaderboard.',
        ],
      },
      {
        heading: 'See who viewed your profile',
        items: [
          'Your profile shows who recently viewed it — photo and name, just like “seen by” — plus your total view count. Only you can see this.',
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
        heading: 'Fixes & polish',
        items: [
          'Fixed the “couldn’t start the class” error — sessions now open reliably the first time.',
          'Fixed a crash when instructors tapped a student on the Ranks tab.',
          'Faster, smoother live attendance roster — it stays snappy even when a whole class scans at once.',
          'Lots of little reliability and mobile-layout polish across the app.',
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
