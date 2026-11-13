export type PointCategory =
  | 'recitation'
  | 'activity'
  | 'penalty'
  | 'redeem'
  | 'event'
  | 'event_attend'

export interface Section {
  id: string
  name: string
  /** Which semester this section belongs to (0027). */
  semesterId: string
}

export type TermKey = 'prelim' | 'midterm' | 'finals'

export interface SemesterTerm {
  term: TermKey
  /** 'YYYY-MM-DD' */
  startsOn: string
  /** 'YYYY-MM-DD' */
  endsOn: string
}

export interface Semester {
  id: string
  name: string
  /** 'YYYY-MM-DD' — a Monday; anchors week 1. */
  startsOn: string
  isActive: boolean
  farewellMessage: string | null
  terms: SemesterTerm[]
}

export interface Subject {
  id: string
  semesterId: string
  code: string
  name: string
}

export interface SectionStudent {
  id: string
  section_id: string
  full_name: string
  display_name: string
  last_name: string | null
  first_name: string | null
  middle_name: string | null
  suffix: string | null
  avatar_url: string | null
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
  points: number
  rank: number
  avatar_url: string | null
  previous_rank: number | null
  rank_since: string
  spent_points: number
  spend_rank: number | null
}

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
  header_url: string | null
  header_pos: number
  /** The currently-equipped achievement title, or null. */
  display_title: string | null
  /** Up to 3 favorite unlocked achievement codes, featured first. */
  pinned_achievements: string[] | null
  semester_points: number
  all_time_points: number
  archived_at: string | null
}

export interface PublicPointEvent {
  id: string
  points: number
  category: PointCategory
  note: string | null
  created_at: string
}

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused' | 'irregular'

export const NEUTRAL_STATUSES: readonly AttendanceStatus[] = ['excused', 'irregular']

/** Config the instructor sets before starting a class session. */
export interface SessionConfig {
  sectionId: string
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
  qrSecret?: string
}

/** A past session summarised for the history list. */
export interface SessionSummary {
  id: string
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
  syncedLate: number
  total: number
  penaltiesCommitted: boolean
}

export type ExcuseStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export const EXCUSE_DEADLINE_DAYS = 7

export interface AbsenceExcuse {
  id: string
  recordId: string
  reason: string
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

export interface LeaderboardComment {
  id: string
  /** Null when the instructor posted it. */
  studentId: string | null
  displayName: string
  avatarUrl: string | null
  body: string
  createdAt: string
}

export const MAX_COMMENTS_PER_DAY = 3
/** Longest a comment may be (mirrors the DB CHECK). */
export const MAX_COMMENT_LENGTH = 120

/** What a student is putting their points toward. */
export type RedemptionKind = 'quiz' | 'activity' | 'exam' | 'other'
export type RedemptionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'reversed'

export const MAX_REDEEM_POINTS = 50
export const MAX_PENDING_REDEMPTIONS = 3

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
  gradeItemId?: string | null
  gradeBonus?: number | null
}

export interface RedemptionGradeContext {
  itemId: string
  itemName: string
  component: GradeComponent
  term: TermKey
  maxScore: number
  /** The bonus the student agreed to. */
  bonus: number
  currentScore: number | null
}

export interface RedemptionRequest extends Redemption {
  studentName: string
  avatarUrl: string | null
  sectionId: string
  /** Present only for a grade boost. */
  grade?: RedemptionGradeContext
  semesterPoints: number
}

export interface SpenderStat {
  studentId: string
  studentName: string
  avatarUrl: string | null
  spent: number
  /** Place on the spend board (0038). */
  rank: number
}

export interface StudentAttendanceStat {
  studentId: string
  fullName: string
  avatarUrl: string | null
  present: number
  late: number
  absent: number
  excused: number
  irregular: number
  counted: number
  rate: number | null
}

/** Everything the Session History analytics view needs. */
export interface AttendanceAnalytics {
  students: StudentAttendanceStat[]
  penaltyPoints: number
  /** How many students took at least one attendance penalty. */
  penalizedStudents: number
}

export interface AttendanceRosterRow {
  studentId: string
  fullName: string
  avatarUrl: string | null
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
  semesterPoints: number
  /** Career total across every semester. */
  lifetimePoints: number
  archivedAt: string | null
  username: string | null
  claimed: boolean
}

export interface SectionRegister {
  sessions: Array<{
    id: string
    topic: string | null
    startedAt: string
    subjectCode: string | null
  }>
  students: Array<{ id: string; fullName: string }>
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
  sectionName: string | null
  semesterName: string | null
}

/** The result a student sees after scanning. */
export interface ScanResult {
  status: AttendanceStatus
  already: boolean
  topic: string | null
  markedAt: string | null
}

export interface EventSession {
  id: string
  name: string
  pointsPerScan: number
  status: 'active' | 'ended'
  startedAt: string
  endedAt: string | null
  qrSecret?: string
}

/** What a student sees after scanning a global event QR. */
export interface EventScanResult {
  already: boolean
  points: number
  eventName: string
  markedAt: string | null
}

/** One section's turnout, for the live event monitor. */
export interface EventSectionCount {
  sectionId: string | null
  sectionName: string
  count: number
}

export interface EventStats {
  total: number
  bySection: EventSectionCount[]
}

/** A student's own past event check-in — their event history. */
export interface EventHistoryEntry {
  eventId: string
  name: string
  scannedAt: string
  points: number
  manual: boolean
}

export interface EventAttendee {
  studentId: string
  displayName: string
  avatarUrl: string | null
  sectionName: string | null
  scannedAt: string
  manual: boolean
  points: number
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
  syncedLate: boolean
}

export type OfflineScanOutcome =
  | 'recorded'
  | 'upgraded'
  | 'already'
  | 'expired'
  | 'invalid'
  | 'session_missing'
  | 'wrong_section'

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
  | 'term_points'
  | 'term_recitations'
  | 'term_early_streak'
  | 'perfect_terms'
  | 'present_streak'

export interface Achievement {
  code: string
  category: AchievementCategory
  name: string
  description: string
  /** Hidden as "???" until unlocked. */
  secret: boolean
  grantedBy: 'system' | 'instructor'
  titleText: string | null
  metric: AchievementMetric | null
  /** The value that clears it (for 'rank', lower is better). */
  threshold: number | null
  sortOrder: number
}

/** The catalog merged with one student's unlock state. */
export interface AchievementState extends Achievement {
  unlockedAt: string | null
}

export interface UnlockedAchievement {
  code: string
  name: string
  titleText: string | null
}

export type AchievementProgress = Record<AchievementMetric, number | null>

export type NotificationType =
  | 'point'
  | 'deduct'
  | 'level'
  | 'rank'
  | 'achievement'
  | 'redemption'
  | 'excuse'
  /** An instructor announcement sent via send_broadcast (0034). */
  | 'broadcast'
  | 'space_shoutout'
  /** Someone answered your comment in the Lounge (0068). */
  | 'space_reply'
  /** A classmate gave you a W (0070). */
  | 'space_person_w'
  | 'space_mention'
  /** A direct message (0043). */
  | 'space_dm'
  /** Your report was reviewed (0044). No outcome, by decision. */
  | 'space_report'
  /** A Random Event was posted (0045). */
  | 'space_event'
  /** A peer evaluation opened for your section (0050). */
  | 'peer_eval_open'
  /** Your peer feedback was released (0051). */
  | 'peer_eval_results'
  | 'grades_open'
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

/** One backed-up table's freshness, from `get_backup_health()`. */
export interface BackupHealth {
  tableName: string
  lastSnapshot: string | null
  /** Rows captured in that most recent snapshot. */
  rowCount: number
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

export interface SectionOverview {
  sectionId: string
  lastSessionAt: string | null
  activeSession: boolean
  unfinalized: number
}

export interface AbsenceRisk {
  studentId: string
  displayName: string
  fullName: string
  sectionId: string
  sectionName: string
  unexcused: number
  actionable: number
  nextDeadline: string | null
  lastAbsenceAt: string | null
}

export interface TermAttendanceRow {
  studentId: string
  fullName: string
  displayName: string
  present: number
  late: number
  absent: number
  excused: number
  irregular: number
  counted: number
  showUpRate: number
}

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

export interface SemesterCloseRow {
  studentId: string
  fullName: string
  sectionName: string
}

export interface PastLeaderboardEntry {
  studentId: string
  displayName: string
  sectionId: string
  sectionName: string
  points: number
  rank: number
  avatarUrl: string | null
}

export interface SpaceAdminSection {
  sectionId: string
  sectionName: string
  spaceEnabled: boolean
  studentCount: number
}

export interface SpaceTimeout {
  studentId: string
  displayName: string
  sectionName: string | null
  /** ISO — when the mute lifts. */
  until: string
  reason: string | null
}

export type LoungePostKind = 'text' | 'shoutout' | 'pulse'

/** Which milestone a Class Pulse card announces. */
export type PulseKind = 'level' | 'podium' | 'event'

export interface LoungePost {
  id: string
  kind: LoungePostKind
  authorStudentId: string | null
  displayName: string
  avatarUrl: string | null
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
  /** The thread ROOT this answers (always a top-level comment), or null if it IS one (0068). */
  parentReplyId: string | null
  /** The comment actually answered — may be inside the thread — and its author's name. */
  replyToId: string | null
  replyToName: string | null
}

/** A person's W standing (0070): public count, and whether YOU gave one today. */
export interface PersonWs {
  total: number
  iGaveToday: boolean
}

/** One student who gave a W (0068). */
export interface PostW {
  studentId: string
  displayName: string
  avatarUrl: string | null
  sectionId: string | null
  createdAt: string
}

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

export const MAX_POST_LENGTH = 600
/** Text posts per rolling 24h (mirrors post_to_lounge). */
export const MAX_POSTS_PER_DAY = 5
export const MAX_SHOUTOUTS_PER_WEEK = 3
export const MAX_WS_PER_DAY = 3

export type RoomKind = 'section' | 'global' | 'dm'

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

export const MAX_MESSAGE_LENGTH = 600

export type ReportTargetType = 'post' | 'reply' | 'message'
export type ReportReason = 'harassment' | 'inappropriate' | 'spam' | 'other'
export type ReportAction = 'delete' | 'restore' | 'dismiss'

/** The reasons offered, in the order shown. */
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Bullying or harassment' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Something else' },
]

export const AUTO_HIDE_AT = 7

export interface ReportQueueItem {
  targetType: ReportTargetType
  targetId: string
  reportCount: number
  reporters: string[]
  reasons: ReportReason[]
  notes: string[]
  firstAt: string
  authorName: string | null
  authorId: string | null
  body: string | null
  /** 'Lounge post' · 'Global room' · 'Direct message' … */
  context: string
  isDm: boolean
  roomId: string | null
  isHidden: boolean
  isDeleted: boolean
}

export interface LoungeEvent {
  id: string
  question: string
  points: number
  winnerCap: number
  /** Whether it auto-awards on close — never what the answer is. */
  hasKey: boolean
  closesAt: string | null
  answerCount: number
  myAnswer: string | null
  createdAt: string
}

/** One answer. Visible to peers only once the event is closed. */
export interface LoungeEventAnswer {
  id: string
  studentId: string
  displayName: string
  avatarUrl: string | null
  body: string
  /** Null until the event closes. */
  isCorrect: boolean | null
  awardedPoints: number | null
  createdAt: string
}

/** One row of the instructor's event history. */
export interface LoungeEventSummary {
  id: string
  question: string
  points: number
  winnerCap: number
  hasKey: boolean
  closesAt: string | null
  status: 'open' | 'closed'
  closedAt: string | null
  answerCount: number
  awardedCount: number
  createdAt: string
}

/** Most an event can pay per winner (mirrors the DB CHECK). */
export const MAX_EVENT_POINTS = 50

export interface SpacePerson {
  id: string
  displayName: string
  avatarUrl: string | null
  semesterPoints: number
  sectionId: string | null
  rank: number | null
}

export interface RoomPin {
  messageId: string
  /** Null when the instructor sent it. */
  authorId: string | null
  displayName: string
  avatarUrl: string | null
  body: string | null
  createdAt: string
  pinnedAt: string
  /** Null when the instructor pinned it. */
  pinnedBy: string | null
  canUnpin: boolean
}

/** Mirrors the cap enforced inside `pin_message`. */
export const MAX_ROOM_PINS = 10

export interface RoomAudience {
  kind: RoomKind
  sectionId: string | null
  /** DM only — null for the derived kinds. */
  memberIds: string[] | null
  hasInstructor: boolean
}

export type RoomNotifyLevel = 'all' | 'mentions' | 'none'

/** Mirrors the CHECK on `peer_groups.name`. */
export const PEER_GROUP_NAME_MAX = 40

export interface PeerPerson {
  id: string
  displayName: string
  avatarUrl: string | null
}

/** One member of a group, as `get_section_groups` returns them. */
export type PeerGroupMember = PeerPerson

export interface PeerGroup {
  id: string
  name: string
  sortOrder: number
  memberCount: number
  members: PeerGroupMember[]
  createdAt: string
}

export interface RosterPerson {
  id: string
  fullName: string
  displayName: string
  avatarUrl: string | null
}

export const PEER_TITLE_MAX = 80
export const PEER_INSTRUCTIONS_MAX = 600
export const PEER_CRITERION_LABEL_MAX = 60
export const PEER_COMMENT_MAX = 400
/** Enforced inside `create_peer_evaluation`, not by a CHECK. */
export const PEER_MAX_CRITERIA = 10

/** One option on a criterion's rating scale. */
export interface PeerScaleOption {
  value: number
  label: string
}

export interface PeerCriterion {
  id: string
  label: string
  scale: PeerScaleOption[]
}

export type PeerEvalScope = 'section' | 'group'
export type PeerEvalStatus = 'open' | 'closed'

export type PeerEvalState = 'open' | 'paused'

/** A row in the student's list at `/app/peer`. */
export interface PeerEvaluationSummary {
  id: string
  title: string
  instructions: string | null
  subjectCode: string
  subjectName: string
  scope: PeerEvalScope
  status: PeerEvalStatus
  closesAt: string | null
  resultsReleasedAt: string | null
  peerCount: number
  submittedAt: string | null
  createdAt: string
}

export interface PeerEvaluationForm {
  id: string
  title: string
  instructions: string | null
  subjectCode: string
  subjectName: string
  scope: PeerEvalScope
  status: PeerEvalStatus
  closesAt: string | null
  submittedAt: string | null
  criteria: PeerCriterion[]
  peers: PeerPerson[]
}

export interface PeerRatingInput {
  ratee_id: string
  criterion_id: string
  score: number
}

export interface PeerCommentInput {
  ratee_id: string
  body: string
}

/** A row in the instructor's list at `/teach/peer`. */
export interface PeerEvaluationListItem {
  id: string
  title: string
  subjectCode: string
  subjectName: string
  scope: PeerEvalScope
  status: PeerEvalStatus
  closesAt: string | null
  closedAt: string | null
  resultsReleasedAt: string | null
  sectionNames: string[]
  groupNames: string[]
  criteriaCount: number
  submittedCount: number
  /** Only students who actually have someone to rate. */
  expectedCount: number
  createdAt: string
}

/** One row of the completion view. */
export interface PeerCompletionRow {
  studentId: string
  displayName: string
  fullName: string
  avatarUrl: string | null
  sectionName: string
  groupName: string | null
  peerCount: number
  submittedAt: string | null
  applicable: boolean
}

export const PEER_MIN_RATERS_FOR_COMMENTS = 3

/** One criterion's aggregate for one student. */
export interface PeerCriterionResult {
  id: string
  label: string
  /** The mean rating on this criterion's own scale. */
  avg: number
  /** That mean min-max normalised against the scale's ends. */
  pct: number
  scaleMin: number
  scaleMax: number
  ratings?: number
}

/** One comment, as the INSTRUCTOR sees it: attributed. */
export interface PeerCommentRow {
  submissionId: string
  body: string
  evaluatorId: string
  evaluatorName: string
  hiddenAt: string | null
  flagged: boolean
  createdAt: string
}

/** One student's row on the instructor's results board. */
export interface PeerResultRow {
  studentId: string
  displayName: string
  fullName: string
  avatarUrl: string | null
  sectionName: string
  groupName: string | null
  raterCount: number
  /** Null when nobody rated them. */
  overallPct: number | null
  overallRaw: number | null
  sameScale: boolean
  criteria: PeerCriterionResult[]
  comments: PeerCommentRow[]
}

export interface MyPeerResults {
  id: string
  title: string
  subjectCode: string
  subjectName: string
  releasedAt: string
  raterCount: number
  sameScale: boolean
  overallPct: number | null
  overallRaw: number | null
  criteria: PeerCriterionResult[]
  comments: string[]
  commentsWithheld: boolean
  minRaters: number
}

export interface PeerEvaluationTemplate {
  title: string
  instructions: string
  scope: PeerEvalScope
  subjectId: string
  sectionIds: string[]
  groupIds: string[]
  criteria: { label: string; scale: PeerScaleOption[] }[]
}

/** One of the four things a term grade is made of. */
export type GradeComponent = 'performance_task' | 'quiz' | 'recitation' | 'exam'

/** Which figure a screen is showing — see ComponentSums. */
export type GradeView = 'official' | 'soFar'

export interface GradePolicy {
  subjectId: string
  term: TermKey
  /** Class Standing split — these three must sum to 1. */
  ptWeight: number
  quizWeight: number
  recitWeight: number
  /** Term split — these two must sum to 1. */
  csWeight: number
  examWeight: number
  finalWeight: number
  transmuteBase: number
  transmuteSpan: number
}

export interface ComponentSums {
  sumScore: number
  sumMax: number
  sumMaxMarked: number
}

export type TermSums = Record<GradeComponent, ComponentSums>

/** One score column: "Quiz 1", out of 20. Scoped to a section. */
export interface GradeItem {
  id: string
  sectionId: string
  subjectId: string
  term: TermKey
  component: GradeComponent
  name: string
  maxScore: number
  position: number
  /** Set when retired: leaves the denominator, keeps its scores. */
  archivedAt: string | null
  assistOff: boolean
  sessionId: string | null
}

export interface GradeAbsence {
  itemId: string
  studentId: string
  source: 'manual' | 'auto'
}

export interface GradeAttendance {
  showed: number
  counted: number
}

export const MAX_BOOST_COST = MAX_REDEEM_POINTS

export interface GradeScore {
  itemId: string
  studentId: string
  score: number
}

export interface GradeBoost {
  itemId: string
  studentId: string
  scoreBefore: number
  scoreAfter: number
  marksGranted: number
  pointsSpent: number
  appliedAt: string
}

/** What `reverse_grade_boost` reports back. */
export interface ReverseBoostResult {
  markRestored: boolean
  pointsRefunded: number
  /** The mark as it stands after the reversal. */
  scoreNow: number | null
}

/** One column as the student sees it. */
export interface MyGradeItem {
  id: string
  term: TermKey
  component: GradeComponent
  name: string
  maxScore: number
  position: number
  /** null = not marked yet. Never a zero standing in for that. */
  score: number | null
  offered: boolean
  absent: boolean
  /** Set once a boost has been applied to this column. */
  boost: { marks: number; points: number; before: number } | null
  pending: boolean
}

export interface MyGradeSubject {
  subjectId: string
  code: string
  name: string
  policies: GradePolicy[]
  attendance: Record<TermKey, GradeAttendance>
  items: MyGradeItem[]
}

export interface MyGrades {
  enabled: boolean
  figures: boolean
  subjects: MyGradeSubject[]
}

export interface GradeSumsRow {
  studentId: string
  fullName: string
  term: TermKey
  sums: TermSums
}
