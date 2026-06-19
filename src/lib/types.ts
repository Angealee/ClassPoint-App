export type PointCategory = 'recitation' | 'activity'

export interface Section {
  id: string
  name: string
}

/** A roster entry as the instructor sees it (profile + secret token info). */
export interface RosterStudent {
  id: string
  section_id: string
  full_name: string
  display_name: string
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
  lifetime_points: number
}
