import { fetchAllRows } from './_internal'

// ============================================================================
// Full backup export (Phase A) — everything, for the "Backup all" workbook
// ============================================================================

/** Raw datasets for the full-backup workbook (assembled in lib/export-all.ts). */
export interface FullBackupData {
  sections: Array<{ id: string; name: string }>
  students: Array<{
    id: string
    section_id: string
    full_name: string
    display_name: string
    semester_points: number
    lifetime_points: number
    user_id: string | null
    archived_at: string | null
  }>
  secrets: Array<{ student_id: string; username: string | null; claimed_at: string | null }>
  events: Array<{
    student_id: string
    points: number
    category: string
    note: string | null
    created_at: string
  }>
  records: Array<{
    session_id: string
    student_id: string
    status: string
    scanned_at: string | null
    committed: boolean
  }>
  sessions: Array<{
    id: string
    section_id: string
    topic: string | null
    status: string
    started_at: string
    ended_at: string | null
    penalties_committed: boolean
  }>
  redemptions: Array<{
    student_id: string
    points: number
    kind: string
    note: string | null
    status: string
    requested_at: string
    decided_at: string | null
    decision_note: string | null
  }>
}


/** Every dataset the full backup needs, in one go (instructor RLS covers all). */
export async function fetchFullBackup(): Promise<FullBackupData> {
  const [sections, students, secrets, events, records, sessions, redemptions] =
    await Promise.all([
      fetchAllRows<FullBackupData['sections'][number]>('sections', 'id, name', 'name'),
      fetchAllRows<FullBackupData['students'][number]>(
        'students',
        'id, section_id, full_name, display_name, semester_points, lifetime_points, user_id, archived_at',
        'full_name',
      ),
      fetchAllRows<FullBackupData['secrets'][number]>(
        'student_secrets',
        'student_id, username, claimed_at',
        'student_id',
      ),
      fetchAllRows<FullBackupData['events'][number]>(
        'point_events',
        'student_id, points, category, note, created_at',
        'created_at',
      ),
      fetchAllRows<FullBackupData['records'][number]>(
        'attendance_records',
        'session_id, student_id, status, scanned_at, committed',
        'created_at',
      ),
      fetchAllRows<FullBackupData['sessions'][number]>(
        'class_sessions',
        'id, section_id, topic, status, started_at, ended_at, penalties_committed',
        'started_at',
      ),
      fetchAllRows<FullBackupData['redemptions'][number]>(
        'point_redemptions',
        'student_id, points, kind, note, status, requested_at, decided_at, decision_note',
        'requested_at',
      ),
    ])
  return { sections, students, secrets, events, records, sessions, redemptions }
}

