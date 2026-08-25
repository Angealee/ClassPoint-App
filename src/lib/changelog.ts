/**
 * App changelog / "What's new" notes.
 *
 * To announce a change to users: add a new entry at the TOP of CHANGELOG with a
 * bumped `version`. On the next app open, anyone who hasn't seen that version
 * gets the WhatsNew sheet listing every release they've missed. That's the whole
 * workflow — no other wiring needed.
 *
 * Sections flagged `major: true` render a "MAJOR" pill so headline features
 * stand out from the smaller updates.
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

// Newest first. Prepend a new entry for every user-facing change.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '3.0.0',
    date: '2026-07-19',
    title: 'The big one 🚀',
    sections: [
      // ── Major updates ──────────────────────────────────────────────────
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
        heading: 'Check in even with no data or wifi',
        major: true,
        items: [
          'No signal? Scan the QR anyway — your phone reads it offline, saves the proof, and checks you in automatically the moment you’re back online. Your status counts from when you scanned, not when it syncs (you have 48 hours).',
          'You can now scan the class QR straight from your phone’s normal camera — it opens ClassPoint and checks you in. The in-app scanner still works too.',
          'The Attendance tab shows exactly what happened: waiting to sync, checked in, or — if something went wrong — the details to show your instructor.',
          'If you were marked absent but actually scanned in time, syncing fixes it and gives back any deducted points automatically.',
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
          'Instructors: a new inbox badges every waiting request — approve or decline with an optional note, and see who’s spent the most.',
        ],
      },
      {
        heading: 'Share the board · flying comments',
        major: true,
        items: [
          'New Share button on the leaderboard: turn the rankings into a proper 1080×1350 image, sized for a story or a post. Pick Podium or Top 10, preview it, then share or save.',
          'Your rank rides along on the card — everyone has something to brag about, not just the top 3.',
          'Comments now fly across the leaderboard. Post one and the whole class sees it drift past their board in real time.',
          'Three comments a day each, they vanish after 24 hours, and your name rides with them — so keep it fun. Tap a quick chip if you can’t think of anything, and tap a comment to open the sender’s profile.',
          'Instructors can post too (badged as Instructor, no daily limit) and delete anything.',
        ],
      },
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
      // ── Minor updates ──────────────────────────────────────────────────
      {
        heading: 'Excuse an absence, the proper way',
        items: [
          'Missed a class? The Attendance tab now walks you through it — get a valid excuse letter, have the Dean’s office validate it and issue your admission slip, then present it to your instructor.',
          'File the request right in the app (within 7 days), mark when you’ve got your admission slip, and your instructor sees it in their Requests inbox — slip-holders first.',
          'The moment your instructor excuses it, the absence stops counting against you and any deducted points come straight back — with a notification.',
          'Instructors: absence and point requests now live in one tabbed Requests inbox.',
        ],
      },
      {
        heading: 'Achievement library + who’s viewing you',
        items: [
          'Tap any badge to see its full story — how rare it is (“✦ Legendary · 8% of the class · 3 of 42”), when you unlocked it, and a little something extra under each one.',
          'Four new badges to chase, including two secret ones tied to spending and commenting.',
          'Your profile-views strip is now tappable — open the full list of who’s viewed you and when. Still only you can see it.',
        ],
      },
      {
        heading: 'A real record for every student',
        items: [
          'Instructors: tap “View ›” on any student for their full record — attendance week by week, points history, requests and badges, all on one page.',
          'One tap prints a formal Attendance Record — sessions, check-in times, totals, attendance rate and signature lines — ready to hand to a parent or the dean’s office as paper or PDF.',
          'New Register export: the classic class-record grid (students × sessions, P/L/A/E/I) as a spreadsheet.',
          'From a student’s record you can award points, reset their PIN, or archive — everything in one place when someone’s standing at your desk.',
        ],
      },
      {
        heading: 'Your records are now un-loseable',
        items: [
          'Every night the entire class record — points, attendance, sessions, everything — is snapshotted automatically, with two weeks of history kept.',
          'Removing a student now ARCHIVES them instead of deleting: they vanish from the roster and leaderboard, but every record survives and they can be restored in one tap.',
          'Permanent deletion still exists, but only for already-archived students — and it makes you type their name first. No more one-tap catastrophes.',
          'Instructors: a new “Backup all” button downloads the whole term — roster, points ledger, attendance, sessions, requests — as one spreadsheet.',
        ],
      },
      {
        heading: 'Smoother, snappier everywhere',
        items: [
          'Screens now fade and rise gently as you move between them — a small thing that makes the whole app feel more alive.',
          'Points, level and rank roll up when they change instead of snapping.',
          'A satisfying check appears when you approve a request, save your profile, or finalise attendance.',
          'The bottom tabs give a little bounce when tapped. (All of this respects your phone’s “reduce motion” setting.)',
          'Every risky action — deleting sessions, students, photos, or point awards — now asks you to confirm first, and crashes show a friendly recovery screen instead of a wall of text.',
        ],
      },
    ],
  },
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

/**
 * The 4.0.0 draft — COMPLETE and ready to announce, but deliberately still a
 * draft. Every phase of the era has landed; the copy below is final.
 *
 * ── HOW TO ANNOUNCE IT ──────────────────────────────────────────────────────
 * Do this only AFTER migrations 0033, 0034 and 0035 are applied and the build
 * is deployed. Announcing first would tell students about a live-class banner
 * and a rollover that the database doesn't have yet.
 *
 *   1. Set `date` below to the real ship date.
 *   2. Move this whole object into the CHANGELOG array as its FIRST element.
 *   3. Delete this `export const DRAFT_4_0_0` wrapper.
 *
 * Why the draft mechanism exists at all: LATEST_VERSION reads CHANGELOG[0], and
 * the "What's new" sheet is gated on that version against localStorage. An
 * entry outside the array is invisible to every student, which is what let this
 * accumulate across nine phases without leaking half-built features.
 */
export const DRAFT_4_0_0: ChangelogEntry = {
  version: '4.0.0',
  date: '2026-08-13', // placeholder — set to the real ship date when announced
  title: 'A whole new semester',
  // Ordered by what a student notices first, not by the order the phases were
  // built. The two fix-and-polish sections sit at the end: they're real work
  // and worth saying, but nobody opens "What's new" to read about retry states.
  sections: [
    {
      heading: 'You’ll know when class starts 🔔',
      major: true,
      items: [
        'The moment your instructor starts class, a banner appears on your dashboard — subject, how long ago it started, and a Scan now button that opens the camera. Once you’ve checked in it flips to “You’re in” instead of nagging you.',
        'An absence you could still excuse now gets one reminder before the 7-day window shuts, with the actual last date on it. No more finding out it’s too late.',
        'The scanner tells you it’s starting up instead of showing a black square, and on phones that support it there’s a flashlight button for a dim room.',
      ],
    },
    {
      heading: 'Know your attendance at a glance 📊',
      items: [
        'A new Attendance card on your home screen: your show-up rate, your current streak, and how your last class was marked — so a wrong mark is something you spot, not something you find out about later.',
        'Tap it for the full picture: your rate broken down by Prelim, Midterm and Finals, a bar per week so you can see whether you are slipping or recovering, and how punctual you have actually been.',
        'Punctuality is measured from when you scanned against when class started — average minutes in, how many times you made it inside the first two minutes, and your fastest.',
      ],
    },
    {
      heading: 'Your points, the whole story 📈',
      major: true,
      items: [
        'Tap “See all” on your dashboard for the full history: a bar per week so you can see how you’re trending, a breakdown of where points came from — recitation, activities, penalties, spending — and everything loads back to the start of the semester.',
        'Attendance history is now split by Prelim, Midterm and Finals, so you can see exactly how a term is going while it’s still fixable.',
        'Each class now shows the time you actually checked in — so “am I really late?” has an answer that isn’t “ask the instructor”.',
      ],
    },
    {
      heading: 'Four new badges, one term at a time 🏅',
      items: [
        'The old badges reward a whole career. These four are won inside a single six-week term, so there’s always something in reach — even if you’re starting from behind.',
        'Term Ace: bank 18 points in one term. Deliberately hard. Flawless: get through a term with zero absences.',
        'Certified Yapper: eight recitation awards in one term. Six Sharp: six classes in a row, on time.',
        'Win one in any term and it’s yours for good — you don’t lose it when the term ends.',
        'Four older badges that were showing up blank in the trophy case finally have their artwork.',
      ],
    },
    {
      heading: 'Your streak stays lit 🔥',
      items: [
        'A fire streak on your home screen: how many classes in a row you’ve been present for. Arrive late and it resets — this one is strict on purpose.',
        'It shows even at zero now, with a nudge to start one. It used to hide itself until you were already doing well, which helped nobody.',
        'On the leaderboard, a flame next to anyone holding their rank or better for more than a day — and an arrow showing how many places they moved since the last update.',
        'Your attendance streak now lives on your dashboard and attendance screen permanently. It used to vanish the moment you unlocked its badge, which was exactly backwards.',
        'Your dashboard says where you are in the semester — term and week — instead of leaving you to count.',
        'You can change your PIN yourself under Profile. No more asking for a reset code just because you wanted a better one.',
      ],
    },
    {
      heading: 'One semester ends, the next begins 🎓',
      major: true,
      items: [
        'Points, levels and the leaderboard now reset when a new semester starts — everyone gets a fresh race. Your all-time total, your badges, your username and your PIN all carry over untouched.',
        'Tap "Past" on the leaderboard to see how a finished semester ended, including where you placed.',
        'If your section isn\'t running any more, your account stays open and read-only: your points, badges and full attendance record are all still there, they just stop changing.',
        'Instructors: the rollover wizard lives under Semesters. Build the next semester ahead of time — sections, subjects, who moves across — and nothing changes for students until you activate it.',
      ],
    },
    {
      heading: 'Announcements, and a look under the hood 🛠️',
      items: [
        'Your instructor can now send announcements straight to your notifications — class cancelled, room moved, that kind of thing.',
        'Instructors: a new Ops & trust screen shows whether the nightly backup actually ran, every delete that has ever happened (with the full record of what was removed), recent claim and PIN-reset attempts, and a button to rebuild the leaderboard without waiting for the twice-daily freeze.',
        'Instructors: a "needs attention" list across every section, ranked by who can still file an excuse — so the top of the list is always someone you can still help today.',
        'Instructors: a per-term attendance workbook, one sheet per section. Attendance only — points stay out of it.',
      ],
    },
    {
      heading: 'Points now come with a price list 🏷️',
      major: true,
      items: [
        'Use points finally tells you what things cost. Tap a reward and the request fills itself in — no more guessing whether 10 points is a lot or a little.',
        'Rewards you can’t afford yet still show, greyed out, with how far off you are. That’s the fun part: something to aim at.',
        'Need something that isn’t on the list? The old “ask for anything” option is still right there underneath.',
        'Instructors: you set the menu and the prices under Requests → Rewards. Retiring a reward is reversible and never touches requests students already made.',
      ],
    },
    {
      heading: 'Attendance math that stays honest 🧮',
      items: [
        'Instructors: attendance stats are now computed in the database instead of on your phone, so show-up rates and the “needs attention” list stay exact no matter how long the semester runs. (The old way silently miscounted once a section passed a thousand records — roughly week 12.)',
        'Rosters and the section grid load lighter too — the app stops downloading data it never showed.',
      ],
    },
    {
      heading: 'Instructors: fewer taps, nothing buried 🧭',
      major: true,
      items: [
        'Awarding points moved to where the students already are: open a section, tap the students you want, and the award bar slides up. Ticking several and awarding them in one go still works exactly as before — it’s just fewer screens to get there.',
        'Class stats are no longer trapped behind a live class. History is its own tab now, holding the points log and the full attendance record side by side.',
        'The bottom bar is down to four tabs, so everything is a bigger target on a phone.',
        'Old bookmarks still work — anything pointing at the old Award or Class history addresses lands in the right place.',
      ],
    },
    {
      heading: 'Prelim, midterm, finals — the app finally knows 📅',
      major: true,
      items: [
        'Your attendance is now grouped by term, not just by week. "Midterm · Week 9" beats squinting at dates.',
        'Each term has its own real dates, so a suspended class or a moved holiday no longer throws the whole calendar off.',
        'Instructors: term dates and subjects live in one Semesters screen, and everything else follows them.',
      ],
    },
    {
      heading: 'Two subjects, two attendance records 📚',
      major: true,
      items: [
        'IT 32 and Elective 1 are tracked separately now. Perfect attendance in one no longer hides a string of absences in the other.',
        'Your streak and show-up rate are counted per subject — so each class gets its own clean slate.',
        'Points do NOT split. A point earned in either subject goes into the same pile and spends anywhere. Only attendance cares which class you were in.',
      ],
    },
    {
      heading: 'Streaks and stats, per subject 🎯',
      major: true,
      items: [
        'Your attendance screen now breaks your show-up rate down by subject, so a rough patch in one class doesn’t quietly drag the other one down with it.',
        'Streaks got smarter, not stingier: we count your best run whether it’s within one subject or across both, so your streak can only ever look better than before.',
        'Heads up on "On Time" and "Reliable": those two now measure your strongest subject instead of adding both together, so your progress bar on them may step back a little. Nothing you already unlocked is ever taken away.',
        'Instructors: Class history has a subject toggle, and the printable record can be filtered to one subject before you print it.',
      ],
    },
    {
      heading: 'Every semester, a fresh race 🏁',
      major: true,
      items: [
        'Points, level, and the leaderboard now reset when a new semester starts. Nobody has to catch up to a year of someone else’s recitations.',
        'Your badges are yours forever — achievements never reset, and neither does your all-time total. Check the Profile for both numbers.',
        'The points you can spend are this semester’s points, so the balance on your screen is always the real one.',
      ],
    },
    {
      heading: 'Your account got a bouncer 🔒',
      major: true,
      items: [
        'Five wrong PINs in a row and sign-in takes a breather before you can try again — and it gets longer if you keep going. Motivation to remember your PIN.',
        'New claim tokens are twice as long, so they are far harder to guess. Already have a token? It still works — nothing to redo.',
        'Claiming an account and resetting a PIN have limits now too: too many wrong codes from one place and it asks you to come back in a few minutes.',
        'Every claim and PIN reset is written down now, so your instructor can tell the difference between "I forgot my PIN again" and someone actually snooping.',
      ],
    },
    {
      heading: 'Fixes you can feel 🩹',
      items: [
        'If your attendance or requests fail to load, the app now says so and offers a retry — instead of pretending you have no record at all.',
        'When your instructor corrects an attendance mark, your screen updates on the spot. No more closing and reopening the app to see it.',
        'Pull down on Attendance or Use Points to refresh, same as the dashboard.',
        'Admission-slip decisions finally show the right icon in your notifications.',
        'Instructors: ticked students no longer follow you into another section (that one could award the wrong class), deducting says "Deduct" and asks first, "Select all" is back, and a session tagged with the wrong subject can be re-tagged.',
      ],
    },
    {
      heading: 'Smaller, smoother, kinder 🪶',
      items: [
        'Profile pictures are resized on your phone before they upload, so setting one is quick even on bad wifi — and everyone else’s screens load faster too.',
        'The app now notices new versions on its own instead of waiting for you to happen to reload.',
        'If you use larger text, a screen reader, or have motion turned down in your phone settings, the app finally respects all of it — pop-ups keep your place, and confirmations get read out.',
        'Instructors: the live check-in roster is noticeably lighter on the phone during class.',
      ],
    },
  ],
}

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
