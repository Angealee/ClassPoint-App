/** 'redeem' rows are debits from an approved spend request (always negative). */
export type PointCategory = 'recitation' | 'activity' | 'penalty' | 'redeem'

export interface Section {
  id: string
  name: string
  /** Which semester this section belongs to (0027). */
  semesterId: string
}

export type TermKey = 'prelim' | 'midterm' | 'finals'

/** One of the three grading periods, with editable real-world dates (0027). */
export interface SemesterTerm {
  term: TermKey
  /** 'YYYY-MM-DD' */
  startsOn: string
  /** 'YYYY-MM-DD' */
  endsOn: string
}

/** An academic semester. Exactly one is active at a time (0027). */
export interface Semester {
  id: string
  name: string
  /** 'YYYY-MM-DD' — a Monday; anchors week 1. */
  startsOn: string
  isActive: boolean
  terms: SemesterTerm[]
}

/** A subject offered in a semester, e.g. "IT 32 · Platform Technologies" (0027). */
export interface Subject {
  id: string
  semesterId: string
  code: string
  name: string
}

/** A student as the instructor manages them (profile + secret token info). */
export interface SectionStudent {
  id: string
  section_id: string
  full_name: string
  display_name: string
  avatar_url: string | null
  /** This semester's points — what the roster and Award screen show (0029). */
  semester_points: number
  /** Career total across every semester. */
  lifetime_points: number
  user_id: string | null
  claim_token: string
  username: string | null
  claimed_at: string | null
}

export interface LeaderboardRow {
  id: string
  display_name: string
  full_name: string
  section_id: string
  /** This semester's points — what the board ranks on (0029). */
  points: number
}

/** One row of the frozen (twice-daily) leaderboard snapshot. */
export interface LeaderboardEntry {
  student_id: string
  display_name: string
  section_id: string
  /**
   * This semester's points — the board resets each semester (0029), so ranking
   * on an all-time total would pit a new cohort against veterans.
   */
  points: number
  rank: number
  /** Merged in live from `students` at read time (the snapshot doesn't store it). */
  avatar_url: string | null
  /**
   * Rank at the PREVIOUS refresh, or null if this is their first board (0037).
   * `previous_rank - rank` is how many places they moved: positive is a climb.
   */
  previous_rank: number | null
  /**
   * When the current run began, where a run is "held this rank or better".
   * Climbing keeps it; only dropping resets it. Drives the tenure flame.
   */
  rank_since: string
  /**
   * Points cashed out on approved redemptions THIS SEMESTER (0038).
   *
   * The spend board ranks on this, and `points + spent_points` is what the
   * student would have had if they'd never spent — which is where the shadow
   * rank on the leaderboard comes from.
   */
  spent_points: number
  /**
   * Place on the spend board, or null for a student who hasn't spent anything.
   *
   * Null is not "last": most students will have spent nothing, and ordering a
   * ~170-way tie at zero by name would look like a ranking while meaning
   * nothing. Those students are simply not on that board yet.
   */
  spend_rank: number | null
}

/** A recent point award/penalty as the instructor reviews it (for undo). */
export interface AwardRecord {
  id: string
  student_id: string
  student_name: string
  section_id: string
  points: number
  category: PointCategory
  note: string | null
  created_at: string
}

/** The frozen leaderboard plus when it was captured. */
export interface LeaderboardSnapshot {
  entries: LeaderboardEntry[]
  capturedAt: string | null
}

export interface PointEvent {
  id: string
  student_id: string
  points: number
  category: PointCategory
  note: string | null
  created_at: string
}

/** The signed-in student's own profile + points record. */
export interface StudentSelf {
  id: string
  section_id: string
  full_name: string
  display_name: string
  avatar_url: string | null
  /** Optional, student-written "about me" (max 160 chars). */
  bio: string | null
  /** Optional, comma-separated interests/hobbies (max 120 chars). */
  interests: string | null
  /** Up to 3 public "showcase" photo URLs on the profile. */
  banner_urls: string[] | null
  /**
   * Wide cover image at the top of the profile (0039).
   *
   * Deliberately NOT banner_urls[0]: that array is the photo STRIP, and taking
   * its first slot would silently change what the strip shows for every student
   * who already has photos.
   */
  header_url: string | null
  /**
   * Which part of `header_url` to show, 0-100 (0040).
   *
   * Renders as CSS `object-position: 50% <n>%`. 50 is centred, which is what
   * every cover did before this existed — and what cut the heads off portraits.
   */
  header_pos: number
  /** The currently-equipped achievement title, or null. */
  display_title: string | null
  /** Up to 3 favorite unlocked achievement codes, featured first. */
  pinned_achievements: string[] | null
  /**
   * This semester's points (0029) — the spendable balance, and what drives XP,
   * level and rank. Shown to students simply as "This semester".
   */
  semester_points: number
  /** Career total across every semester. Achievements stay pinned to this. */
  all_time_points: number
}

/** A point event as shown on another student's public profile preview. */
export interface PublicPointEvent {
  id: string
  points: number
  category: PointCategory
  note: string | null
  created_at: string
}

/**
 * 'excused' and 'irregular' are NEUTRAL: no penalty, and the session is
 * excluded from streaks, show-up rate, and achievement metrics entirely.
 * 'irregular' = the student isn't part of that session at all (off-section).
 */
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused' | 'irregular'

/** The two statuses that make a session not count for a student. */
export const NEUTRAL_STATUSES: readonly AttendanceStatus[] = ['excused', 'irregular']

/** Config the instructor sets before starting a class session. */
export interface SessionConfig {
  sectionId: string
  /** Which subject this class is for (0028). Null only if none are assigned. */
  subjectId: string | null
  topic: string
  lateAfterMin: number
  absentAfterMin: number
  latePenalty: number
  absentPenalty: number
  applyPenalties: boolean
}

/** A live/started class session the instructor is running. */
export interface ClassSession {
  id: string
  sectionId: string
  /** Null for sessions that predate subjects ("untagged") — see 0028. */
  subjectId: string | null
  subjectCode: string | null
  subjectName: string | null
  topic: string | null
  status: 'active' | 'ended'
  startedAt: string
  endedAt: string | null
  lateAfterMin: number
  absentAfterMin: number
  latePenalty: number
  absentPenalty: number
  applyPenalties: boolean
  penaltiesCommitted: boolean
  /** Rotating-QR secret — only present for the instructor who owns the session. */
  qrSecret?: string
}

/** A past session summarised for the history list. */
export interface SessionSummary {
  id: string
  /** Null for sessions that predate subjects ("untagged") — see 0028. */
  subjectId: string | null
  subjectCode: string | null
  topic: string | null
  startedAt: string
  endedAt: string | null
  status: 'active' | 'ended'
  present: number
  late: number
  absent: number
  excused: number
  irregular: number
  /** How many records in this session were synced from an offline scan. */
  syncedLate: number
  total: number
  penaltiesCommitted: boolean
}

export type ExcuseStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

/** Days after a session a student may still file an excuse (mirrors the RPC). */
export const EXCUSE_DEADLINE_DAYS = 7

/** A student's absence-excuse request (the DCT-CCS admission-slip flow). */
export interface AbsenceExcuse {
  id: string
  recordId: string
  reason: string
  /** True once the Dean's office has issued the physical admission slip. */
  hasSlip: boolean
  status: ExcuseStatus
  requestedAt: string
  decidedAt: string | null
  decisionNote: string | null
}

/** An excuse as the instructor sees it in the Requests inbox. */
export interface ExcuseRequest extends AbsenceExcuse {
  studentId: string
  studentName: string
  avatarUrl: string | null
  sectionId: string
  sessionTopic: string | null
  sessionStartedAt: string | null
}

/** One flying comment on the leaderboard. Self-destructs after 24h. */
export interface LeaderboardComment {
  id: string
  /** Null when the instructor posted it. */
  studentId: string | null
  /** Denormalized at post time so realtime payloads render with no extra fetch. */
  displayName: string
  avatarUrl: string | null
  body: string
  createdAt: string
}

/** Comments a student may post per rolling 24h (mirrors the RPC). */
export const MAX_COMMENTS_PER_DAY = 3
/** Longest a comment may be (mirrors the DB CHECK). */
export const MAX_COMMENT_LENGTH = 120

/** What a student is putting their points toward. */
export type RedemptionKind = 'quiz' | 'activity' | 'exam' | 'other'
export type RedemptionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

/** The most points a student may put into one request (mirrors the DB CHECK). */
export const MAX_REDEEM_POINTS = 50
/** How many requests a student may have waiting at once (mirrors the RPC). */
export const MAX_PENDING_REDEMPTIONS = 3

/**
 * One entry in the instructor-authored price list (0032).
 *
 * Tapping one pre-fills a redemption request — it does NOT create a different
 * kind of record, so approval and the point-locking logic are unchanged.
 */
export interface RewardCatalogItem {
  id: string
  label: string
  points: number
  kind: RedemptionKind
  sortOrder: number
  /** Set when retired: keeps past redemptions meaningful, stops offering it. */
  archivedAt: string | null
}

/** One request to spend points on a grade. */
export interface Redemption {
  id: string
  studentId: string
  points: number
  kind: RedemptionKind
  note: string | null
  status: RedemptionStatus
  requestedAt: string
  decidedAt: string | null
  decisionNote: string | null
}

/** A pending/decided request as the instructor sees it (student joined in). */
export interface RedemptionRequest extends Redemption {
  studentName: string
  avatarUrl: string | null
  sectionId: string
  /**
   * The student's SPENDABLE balance right now — this semester's points (0029),
   * not their career total. Context for the approve decision, and the same
   * number decide_point_redemption re-validates against.
   */
  semesterPoints: number
}

/** One student's spending totals, for the instructor's top-spenders view. */
export interface SpenderStat {
  studentId: string
  studentName: string
  avatarUrl: string | null
  /** Points actually spent this semester, from the same snapshot students see. */
  spent: number
  /** Place on the spend board (0038). */
  rank: number
}

/** One student's attendance record across a whole section's sessions. */
export interface StudentAttendanceStat {
  studentId: string
  fullName: string
  avatarUrl: string | null
  present: number
  late: number
  absent: number
  excused: number
  irregular: number
  /** Sessions that count toward the rate — excludes excused/irregular. */
  counted: number
  /** (present + late) / counted, 0–1. Null when nothing counts yet. */
  rate: number | null
}

/** Everything the Session History analytics view needs. */
export interface AttendanceAnalytics {
  students: StudentAttendanceStat[]
  /** Points deducted by attendance penalties across these sessions. */
  penaltyPoints: number
  /** How many students took at least one attendance penalty. */
  penalizedStudents: number
}

/** One row of the instructor's per-session roster (student + their status). */
export interface AttendanceRosterRow {
  studentId: string
  fullName: string
  avatarUrl: string | null
  /** Archived students only appear in sessions where they have a record. */
  archived: boolean
  recordId: string | null
  status: AttendanceStatus | null
  scannedAt: string | null
  committed: boolean
  /** Recorded/upgraded via an offline sync. */
  syncedLate: boolean
}

/** One student's full detail for the instructor record page. */
export interface InstructorStudentDetail {
  id: string
  sectionId: string
  sectionName: string
  fullName: string
  displayName: string
  avatarUrl: string | null
  /** This semester's points — the headline figure on the record page. */
  semesterPoints: number
  /** Career total across every semester. */
  lifetimePoints: number
  archivedAt: string | null
  username: string | null
  claimed: boolean
}

/** Whole-section register: students × sessions grid of statuses. */
export interface SectionRegister {
  sessions: Array<{
    id: string
    topic: string | null
    startedAt: string
    /** Null when untagged; drives the register's Subject row (0028). */
    subjectCode: string | null
  }>
  students: Array<{ id: string; fullName: string }>
  /** statuses[studentId][sessionId] = status (missing = no record). */
  statuses: Record<string, Record<string, AttendanceStatus>>
}

/** A student hidden by Archive — restorable, records intact. */
export interface ArchivedStudent {
  id: string
  fullName: string
  displayName: string
  avatarUrl: string | null
  lifetimePoints: number
  archivedAt: string
}

/** The result a student sees after scanning. */
export interface ScanResult {
  status: AttendanceStatus
  already: boolean
  topic: string | null
  markedAt: string | null
}

/** A student's own attendance entry for their history module. */
export interface MyAttendanceEntry {
  recordId: string
  sessionId: string
  /** Null for sessions that predate subjects — see 0028. */
  subjectId: string | null
  subjectCode: string | null
  topic: string | null
  startedAt: string
  status: AttendanceStatus
  scannedAt: string | null
  /** Recorded/upgraded by an offline sync (shown as "Offline check-in"). */
  syncedLate: boolean
}

/** Server outcome from submit_offline_scan (mirrors the RPC's `outcome`). */
export type OfflineScanOutcome =
  | 'recorded'
  | 'upgraded'
  | 'already'
  | 'expired'
  | 'invalid'
  | 'session_missing'
  | 'wrong_section'

/** Public-safe profile of any student, shown in the leaderboard tap-preview. */
export interface PublicProfile {
  id: string
  display_name: string
  section_id: string
  avatar_url: string | null
  bio: string | null
  interests: string | null
  /** Up to 3 public "showcase" photo URLs on the profile. */
  banner_urls: string[] | null
  /** Wide cover image at the top of the profile (0039). */
  header_url: string | null
  /** Vertical focal point of the cover, 0-100 (0040). */
  header_pos: number
  /** Their currently-equipped achievement title, or null. */
  display_title: string | null
  /** Up to 3 favorite unlocked achievement codes, featured first. */
  pinned_achievements: string[] | null
  /** This semester's points (0029) — what a public profile shows. */
  semester_points: number
  /** When the roster entry was created — shown as "member since". */
  created_at: string | null
  /** Their most recent point awards (privacy-aware; from public_point_events). */
  events: PublicPointEvent[]
}

/** One recent visitor to a student's own profile ("seen by …"). */
export interface ProfileVisitor {
  displayName: string
  avatarUrl: string | null
  lastViewedAt: string
}

/** A student's own profile-view stats + recent visitors. */
export interface ProfileViews {
  /** Total views across all visitors (repeat views counted). */
  total: number
  /** Distinct people who viewed. */
  visitors: number
  recent: ProfileVisitor[]
}

/** One row of the full, paginated visitor list. */
export interface ProfileVisitorRow {
  /** The viewer's student id — lets a tap open their profile. */
  studentId: string
  displayName: string
  avatarUrl: string | null
  sectionId: string
  lifetimePoints: number
  /** Snapshot rank, or null if not ranked. */
  rank: number | null
  lastViewedAt: string
  viewCount: number
}

/** A page of the full visitor list, plus the grand total for the header. */
export interface ProfileVisitorPage {
  rows: ProfileVisitorRow[]
  /** Distinct visitors overall (not just this page). */
  total: number
}

/** How rare one achievement is across the class. */
export interface AchievementRarity {
  code: string
  /** How many students hold it. */
  holders: number
  /** The pool it's out of (students with a real account). */
  totalStudents: number
}

export type AchievementCategory = 'points' | 'attendance' | 'growth' | 'social' | 'fun' | 'recognition'

/** Which raw number (from get_achievement_progress) an achievement tracks. */
export type AchievementMetric =
  | 'points'
  | 'recitations'
  | 'present_count'
  | 'attended_count'
  | 'streak'
  | 'early_streak'
  | 'level'
  | 'rank'
  | 'views_received'
  | 'views_given'
  | 'unlocked_count'
  | 'banner_count'
  | 'points_spent'
  | 'redemptions_approved'
  /**
   * Per-term metrics (0036). Each is the student's BEST SINGLE TERM across
   * every term of every semester — which is what makes the badges read as
   * "do it in any one term" while still unlocking only once, ever.
   */
  | 'term_points'
  | 'term_recitations'
  | 'term_early_streak'
  | 'perfect_terms'
  /**
   * The STRICT current streak (0036): classes in a row marked present. A late
   * resets it, unlike `streak`, which only breaks on an absence. Drives the
   * home-screen flame; no badge uses it.
   */
  | 'present_streak'

/** One row of the achievement catalog — the static, shared definition. */
export interface Achievement {
  code: string
  category: AchievementCategory
  name: string
  description: string
  /** Hidden as "???" until unlocked. */
  secret: boolean
  /** 'system' = auto-evaluated by sync_achievements(); 'instructor' = only manually grantable. */
  grantedBy: 'system' | 'instructor'
  /** Non-null only for achievements that also grant a display title. */
  titleText: string | null
  /** Which metric this achievement tracks, for a "7/10"-style progress readout. Null = no numeric progress (boolean/one-off/instructor-granted). */
  metric: AchievementMetric | null
  /** The value that clears it (for 'rank', lower is better). */
  threshold: number | null
  sortOrder: number
}

/** The catalog merged with one student's unlock state. */
export interface AchievementState extends Achievement {
  /** ISO timestamp of when this student unlocked it, or null if still locked. */
  unlockedAt: string | null
}

/** What sync_achievements() returns for each newly-unlocked achievement (drives the celebration). */
export interface UnlockedAchievement {
  code: string
  name: string
  titleText: string | null
}

/** The raw numbers behind locked achievements' progress bars (get_achievement_progress). */
export type AchievementProgress = Record<AchievementMetric, number | null>

/**
 * What each notification is about — mirrors `notifications.type` in the DB
 * (open set there; unknown values render with the default bell icon).
 */
export type NotificationType =
  | 'point'
  | 'deduct'
  | 'level'
  | 'rank'
  | 'achievement'
  | 'redemption'
  // Queued by decide_absence_excuse (0025). Was missing here, so every
  // admission-slip decision rendered with the generic grey bell.
  | 'excuse'
  /** An instructor announcement sent via send_broadcast (0034). */
  | 'broadcast'
  /** Someone shouted you out in the Lounge (0042). Deep-links to the post. */
  | 'space_shoutout'
  /** Someone mentioned you or replied to you in a chat room (0043). */
  | 'space_mention'
  /** A direct message (0043). */
  | 'space_dm'
  | 'test'

/** One row of the student's notification history (the bell). */
export interface AppNotification {
  id: string
  type: NotificationType | (string & {})
  title: string
  body: string
  /** In-app destination when tapped (e.g. '/app/leaderboard'). */
  url: string
  createdAt: string
  /** Null while unread. */
  readAt: string | null
}

// ─── Instructor ops (0034) ──────────────────────────────────────────────────

/** One backed-up table's freshness, from `get_backup_health()`. */
export interface BackupHealth {
  tableName: string
  /** Date of the most recent snapshot, or null if the mirror is empty. */
  lastSnapshot: string | null
  /** Rows captured in that most recent snapshot. */
  rowCount: number
  /** How many distinct daily snapshots are retained (the job keeps 14). */
  snapshotDays: number
}

/** One row of the destructive-action audit trail (0023). */
export interface AuditEntry {
  id: number
  at: string
  actor: string | null
  action: 'delete' | 'archive' | 'restore' | 'hard_delete' | 'broadcast' | (string & {})
  tableName: string
  rowId: string | null
  studentId: string | null
  summary: string | null
  rowData: Record<string, unknown>
}

/** One claim / PIN-reset attempt from the auth trail (0026). */
export interface AuthEvent {
  id: number
  at: string
  kind: 'claim' | 'pin_reset' | (string & {})
  success: boolean
  ip: string | null
  userAgent: string | null
  studentId: string | null
  detail: string | null
}

/** Per-section "what needs finishing" signals, from `get_section_overview()`. */
export interface SectionOverview {
  sectionId: string
  lastSessionAt: string | null
  activeSession: boolean
  /** Ended sessions set to apply penalties that were never committed. */
  unfinalized: number
}

/**
 * One student on the cross-section risk list (`get_absence_risk()`).
 *
 * `actionable` is the count still inside 0025's 7-day excuse window — the
 * absences the instructor can still do something about today.
 */
export interface AbsenceRisk {
  studentId: string
  displayName: string
  fullName: string
  sectionId: string
  sectionName: string
  unexcused: number
  actionable: number
  /** Soonest excuse deadline still open, or null when none are actionable. */
  nextDeadline: string | null
  lastAbsenceAt: string | null
}

/**
 * One student's attendance across a term (`get_term_attendance()`).
 *
 * ATTENDANCE ONLY, by the instructor's rule: points are never turned into a
 * grade, so there is deliberately no points column here.
 */
export interface TermAttendanceRow {
  studentId: string
  fullName: string
  displayName: string
  present: number
  late: number
  absent: number
  excused: number
  irregular: number
  /** present + late + absent. Neutral statuses are excluded by design. */
  counted: number
  showUpRate: number
}

// ─── Semester rollover (0035) ───────────────────────────────────────────────

/**
 * One problem found by the rollover pre-flight.
 *
 * `block` items are refused by `set_active_semester` itself — the UI showing
 * them is a courtesy, the SQL is the gate. `warn` items are the instructor's
 * call to override (notably `unplaced`: leaving a student behind is often
 * deliberate — they dropped, transferred or graduated).
 */
export interface RolloverCheck {
  code:
    | 'active_session'
    | 'pending_redemption'
    | 'pending_excuse'
    | 'uncommitted_penalties'
    | 'unplaced'
    | 'no_sections'
    | (string & {})
  severity: 'block' | 'warn'
  count: number
  detail: string
}

/**
 * One row of a past semester's final leaderboard.
 *
 * Recomputed from the ledger rather than read from the snapshot (which only
 * holds the current board), and it includes archived students — they were on
 * that board when it counted.
 */
export interface PastLeaderboardEntry {
  studentId: string
  displayName: string
  sectionId: string
  sectionName: string
  points: number
  rank: number
  avatarUrl: string | null
}

// ─── Student Space (0041) ───────────────────────────────────────────────────

/**
 * One section's beta membership, for /teach/space.
 *
 * `SpaceAccess` — the student-facing shape — deliberately lives in
 * lib/space-gate.ts instead of here, beside the functions that interpret it.
 * It is the one type in the app whose meaning is inseparable from its rules.
 */
export interface SpaceAdminSection {
  sectionId: string
  sectionName: string
  spaceEnabled: boolean
  /** Active students, so the roster shows what enabling a section costs. */
  studentCount: number
}

/** A live mute. Lapsed timeouts stay in the table but are never listed. */
export interface SpaceTimeout {
  studentId: string
  displayName: string
  sectionName: string | null
  /** ISO — when the mute lifts. */
  until: string
  reason: string | null
}

// ─── The Student Lounge (0042) ──────────────────────────────────────────────

/** What a Lounge card is. `pulse` cards are written by ClassPoint, not a student. */
export type LoungePostKind = 'text' | 'shoutout' | 'pulse'

/** Which milestone a Class Pulse card announces. */
export type PulseKind = 'level' | 'podium'

/**
 * One card in the feed.
 *
 * Author and target are DENORMALIZED on the row (0020's rule) so a realtime
 * payload renders with no join and no second round-trip.
 */
export interface LoungePost {
  id: string
  kind: LoungePostKind
  /** Null when the instructor wrote it. On a `pulse` card, the student it is about. */
  authorStudentId: string | null
  displayName: string
  avatarUrl: string | null
  /**
   * Null when the post is hidden and you are not the instructor — the server
   * withholds it rather than trusting the client not to draw it.
   */
  body: string | null
  targetStudentId: string | null
  targetDisplayName: string | null
  targetAvatarUrl: string | null
  pulseKind: PulseKind | null
  pulseValue: number | null
  wCount: number
  replyCount: number
  iGaveW: boolean
  canDelete: boolean
  pinnedAt: string | null
  /** Non-null once auto-hidden by reports (0044). */
  hiddenAt: string | null
  createdAt: string
}

export interface LoungeReply {
  id: string
  authorStudentId: string | null
  displayName: string
  avatarUrl: string | null
  body: string | null
  canDelete: boolean
  hiddenAt: string | null
  createdAt: string
}

/** What the composer needs to show its counters without guessing. */
export interface LoungeQuota {
  postsLeft: number
  shoutoutsLeft: number
  wsLeft: number
}

/** One shoutout on someone's profile strip (7-day window). */
export interface ShoutoutReceived {
  id: string
  displayName: string
  avatarUrl: string | null
  body: string
  createdAt: string
}

/** Longest a post or reply may be (mirrors the DB CHECK and cp_lounge_clean). */
export const MAX_POST_LENGTH = 600
/** Text posts per rolling 24h (mirrors post_to_lounge). */
export const MAX_POSTS_PER_DAY = 5
/** Shoutouts per rolling 7 days, max one per classmate (mirrors post_shoutout). */
export const MAX_SHOUTOUTS_PER_WEEK = 3
/** Ws you can be holding at once, per rolling 24h (mirrors give_w). */
export const MAX_WS_PER_DAY = 3

// ─── Student Space messaging (0043) ─────────────────────────────────────────

export type RoomKind = 'section' | 'global' | 'dm'

/**
 * The six reactions, as CODE → GLYPH.
 *
 * ⚠ The DATABASE stores the code, never the emoji. Several glyphs carry a
 * variation selector (❤️ is U+2764 U+FE0F), so a CHECK against the character
 * itself fails the moment any layer normalises the string — and the reaction
 * silently does not save. This map is the only place the glyph appears, which
 * also means changing one is a client edit rather than a migration.
 */
export const CHAT_REACTIONS = {
  like: '👍',
  lol: '😂',
  fire: '🔥',
  wow: '😮',
  sad: '😢',
  love: '❤️',
} as const

export type ReactionCode = keyof typeof CHAT_REACTIONS

/** Order shown in the reaction bar. */
export const REACTION_ORDER: ReactionCode[] = ['like', 'lol', 'fire', 'wow', 'sad', 'love']

export interface SpaceRoom {
  id: string
  kind: RoomKind
  /** 'Global', the section name, or the other person in a DM. */
  name: string
  slowModeSeconds: number
  announceOnly: boolean
  pinnedMessageId: string | null
  muted: boolean
  lastMessageAt: string | null
  lastMessageBy: string | null
  lastMessageBody: string | null
  memberCount: number
}

export interface SpaceMessage {
  id: string
  /** Null when the instructor sent it. */
  authorStudentId: string | null
  displayName: string
  avatarUrl: string | null
  /**
   * Null for a tombstone (deleted) or a hidden message you may not read. The
   * server withholds it; the client never receives text it should not draw.
   */
  body: string | null
  replyToId: string | null
  replyToName: string | null
  replyToExcerpt: string | null
  mentionsMe: boolean
  canDelete: boolean
  /** code → count, e.g. { fire: 3, lol: 1 }. */
  reactions: Partial<Record<ReactionCode, number>>
  /** The codes YOU reacted with. */
  myReactions: ReactionCode[]
  hiddenAt: string | null
  deletedAt: string | null
  createdAt: string
}

/** Longest a chat message may be — same limit and normaliser as a Lounge post. */
export const MAX_MESSAGE_LENGTH = 600
