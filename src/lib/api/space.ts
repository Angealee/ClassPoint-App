import { rpc } from './_internal'
import { SPACE_ACCESS_UNKNOWN, type SpaceAccess, type SpaceState } from '@/lib/space-gate'
import type { SpaceAdminSection, SpaceTimeout } from '@/lib/types'

// ============================================================================
// Student Space — the gate (migration 0041)
// ============================================================================

interface AccessRow {
  state: string
  can_post: boolean
  timeout_until: string | null
  timeout_reason: string | null
}

/**
 * Who may be in Student Space, decided server-side.
 *
 * Degrades to LOCKED rather than throwing: this is fetched off the critical
 * path alongside achievements, and a student whose gate call fails should see
 * the app they had yesterday, not an error. Locked is also the safe direction —
 * it can only ever under-promise.
 */
export async function getSpaceAccess(): Promise<SpaceAccess> {
  const rows = await rpc<AccessRow[]>('get_space_access')
  const r = rows?.[0]
  if (!r) return SPACE_ACCESS_UNKNOWN
  return {
    // Anything the client does not recognise is treated as locked, so a server
    // running ahead of this build cannot accidentally open a door.
    state: (['open', 'paused', 'locked'] as const).includes(r.state as SpaceState)
      ? (r.state as SpaceState)
      : 'locked',
    canPost: !!r.can_post,
    timeoutUntil: r.timeout_until,
    timeoutReason: r.timeout_reason,
  }
}

// ── Instructor: /teach/space ────────────────────────────────────────────────

interface AdminRow {
  flag_enabled: boolean
  section_id: string
  section_name: string
  space_enabled: boolean
  student_count: number
}

/** The master switch's value on its own — survives a semester with no sections. */
export async function getSpaceFlag(): Promise<boolean> {
  return !!(await rpc<boolean>('get_space_flag'))
}

/** Every section this semester with its beta membership and headcount. */
export async function listSpaceSections(): Promise<SpaceAdminSection[]> {
  const rows = await rpc<AdminRow[]>('get_space_admin')
  return (rows ?? []).map((r) => ({
    sectionId: r.section_id,
    sectionName: r.section_name,
    spaceEnabled: !!r.space_enabled,
    studentCount: r.student_count ?? 0,
  }))
}

/** The kill switch. Off = every beta section sees the Paused screen. */
export async function setSpaceFlag(enabled: boolean): Promise<boolean> {
  return !!(await rpc<boolean>('set_space_flag', { p_enabled: enabled }))
}

/** Add or remove one section from the beta roster. */
export async function setSectionSpace(sectionId: string, enabled: boolean): Promise<boolean> {
  return !!(await rpc<boolean>('set_section_space', {
    p_section_id: sectionId,
    p_enabled: enabled,
  }))
}

// ── Instructor: timeouts ────────────────────────────────────────────────────

interface TimeoutRow {
  student_id: string
  display_name: string
  section_name: string | null
  until: string
  reason: string | null
}

/** Everyone currently muted. Lapsed rows are kept in the table but not listed. */
export async function listSpaceTimeouts(): Promise<SpaceTimeout[]> {
  const rows = await rpc<TimeoutRow[]>('list_space_timeouts')
  return (rows ?? []).map((r) => ({
    studentId: r.student_id,
    displayName: r.display_name,
    sectionName: r.section_name,
    until: r.until,
    reason: r.reason,
  }))
}

/** Mute a student. The RPC caps this at 90 days and writes an audit row. */
export async function timeoutStudent(
  studentId: string,
  until: Date,
  reason?: string,
): Promise<string> {
  return await rpc<string>('timeout_student', {
    p_student_id: studentId,
    p_until: until.toISOString(),
    p_reason: reason ?? null,
  })
}

/** Lift a mute early. Expires the rows rather than deleting them. */
export async function clearSpaceTimeout(studentId: string): Promise<number> {
  return (await rpc<number>('clear_space_timeout', { p_student_id: studentId })) ?? 0
}

