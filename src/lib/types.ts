export type PointCategory = 'recitation' | 'activity' | 'penalty'

export interface Section {
  id: string
  name: string
}

/** A student as the instructor manages them (profile + secret token info). */
export interface SectionStudent {
  id: string
  section_id: string
  full_name: string
  display_name: string
  avatar_url: string | null
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
  lifetime_points: number
}

/** One row of the frozen (twice-daily) leaderboard snapshot. */
export interface LeaderboardEntry {
  student_id: string
  display_name: string
  section_id: string
  lifetime_points: number
  rank: number
  /** Merged in live from `students` at read time (the snapshot doesn't store it). */
  avatar_url: string | null
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
  /** The currently-equipped achievement title, or null. */
  display_title: string | null
  /** Up to 3 favorite unlocked achievement codes, featured first. */
  pinned_achievements: string[] | null
  lifetime_points: number
}

/** A point event as shown on another student's public profile preview. */
export interface PublicPointEvent {
  id: string
  points: number
  category: PointCategory
  note: string | null
  created_at: string
}

export type AttendanceStatus = 'present' | 'late' | 'absent'

/** Config the instructor sets before starting a class session. */
export interface SessionConfig {
  sectionId: string
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
  topic: string | null
  startedAt: string
  endedAt: string | null
  status: 'active' | 'ended'
  present: number
  late: number
  absent: number
  total: number
  penaltiesCommitted: boolean
}

/** One row of the instructor's per-session roster (student + their status). */
export interface AttendanceRosterRow {
  studentId: string
  fullName: string
  avatarUrl: string | null
  recordId: string | null
  status: AttendanceStatus | null
  scannedAt: string | null
  committed: boolean
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
  topic: string | null
  startedAt: string
  status: AttendanceStatus
  scannedAt: string | null
}

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
  /** Their currently-equipped achievement title, or null. */
  display_title: string | null
  /** Up to 3 favorite unlocked achievement codes, featured first. */
  pinned_achievements: string[] | null
  lifetime_points: number
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
  | 'attendance_penalty'
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
