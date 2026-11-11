import { rpc } from './_internal'
import { SPACE_ACCESS_UNKNOWN, type SpaceAccess, type SpaceState } from '@/lib/space-gate'
import type {
  ReportAction,
  ReportQueueItem,
  ReportReason,
  ReportTargetType,
  SpaceAdminSection,
  SpaceTimeout,
} from '@/lib/types'

interface AccessRow {
  state: string
  can_post: boolean
  timeout_until: string | null
  timeout_reason: string | null
}

export async function getSpaceAccess(): Promise<SpaceAccess> {
  const rows = await rpc<AccessRow[]>('get_space_access')
  const r = rows?.[0]
  if (!r) return SPACE_ACCESS_UNKNOWN
  return {
    state: (['open', 'paused', 'locked'] as const).includes(r.state as SpaceState)
      ? (r.state as SpaceState)
      : 'locked',
    canPost: !!r.can_post,
    timeoutUntil: r.timeout_until,
    timeoutReason: r.timeout_reason,
  }
}

interface AdminRow {
  flag_enabled: boolean
  section_id: string
  section_name: string
  space_enabled: boolean
  student_count: number
}

export async function getSpaceFlag(): Promise<boolean> {
  return !!(await rpc<boolean>('get_space_flag'))
}

export async function listSpaceSections(): Promise<SpaceAdminSection[]> {
  const rows = await rpc<AdminRow[]>('get_space_admin')
  return (rows ?? []).map((r) => ({
    sectionId: r.section_id,
    sectionName: r.section_name,
    spaceEnabled: !!r.space_enabled,
    studentCount: r.student_count ?? 0,
  }))
}

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

interface TimeoutRow {
  student_id: string
  display_name: string
  section_name: string | null
  until: string
  reason: string | null
}

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

export async function clearSpaceTimeout(studentId: string): Promise<number> {
  return (await rpc<number>('clear_space_timeout', { p_student_id: studentId })) ?? 0
}

export async function reportContent(
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  note?: string,
): Promise<number> {
  return (
    (await rpc<number>('report_content', {
      p_type: targetType,
      p_id: targetId,
      p_reason: reason,
      p_note: note?.trim() || null,
    })) ?? 0
  )
}

export async function myReportedIds(
  targetType: ReportTargetType,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await rpc<{ target_id: string }[]>('my_reported_ids', {
    p_type: targetType,
    p_ids: ids,
  })
  return new Set((rows ?? []).map((r) => r.target_id))
}

interface QueueRow {
  target_type: string
  target_id: string
  report_count: number
  reporters: string[] | null
  reasons: string[] | null
  notes: string[] | null
  first_at: string
  author_name: string | null
  author_id: string | null
  body: string | null
  context: string
  is_dm: boolean
  room_id: string | null
  is_hidden: boolean
  is_deleted: boolean
}

export async function getReportQueue(): Promise<ReportQueueItem[]> {
  const rows = await rpc<QueueRow[]>('get_space_report_queue')
  return (rows ?? []).map((r) => ({
    targetType: r.target_type as ReportTargetType,
    targetId: r.target_id,
    reportCount: r.report_count ?? 0,
    reporters: r.reporters ?? [],
    reasons: (r.reasons ?? []) as ReportReason[],
    notes: r.notes ?? [],
    firstAt: r.first_at,
    authorName: r.author_name,
    authorId: r.author_id,
    body: r.body,
    context: r.context,
    isDm: !!r.is_dm,
    roomId: r.room_id,
    isHidden: !!r.is_hidden,
    isDeleted: !!r.is_deleted,
  }))
}

export async function countOpenReports(): Promise<number> {
  return (await rpc<number>('count_open_reports')) ?? 0
}

export async function resolveReport(
  targetType: ReportTargetType,
  targetId: string,
  action: ReportAction,
): Promise<number> {
  return (
    (await rpc<number>('resolve_report', {
      p_type: targetType,
      p_id: targetId,
      p_action: action,
    })) ?? 0
  )
}
