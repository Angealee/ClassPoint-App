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

/** Public-safe profile of any student, shown in the leaderboard tap-preview. */
export interface PublicProfile {
  id: string
  display_name: string
  section_id: string
  avatar_url: string | null
  bio: string | null
  interests: string | null
  lifetime_points: number
  /** When the roster entry was created — shown as "member since". */
  created_at: string | null
  /** Their most recent point awards (privacy-aware; from public_point_events). */
  events: PublicPointEvent[]
}
