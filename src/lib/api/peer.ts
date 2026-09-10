import { rpc } from './_internal'
import type { PeerGroup, PeerGroupMember } from '@/lib/types'

// ============================================================================
// Peer Evaluation · groups (migration 0049)
//
// Instructor-only, end to end. `peer_groups` and `peer_group_members` are
// instructor-select in RLS and have NO write policies at all, so every call
// here goes through a security-definer RPC that re-asserts the caller. There is
// no student-facing read of a group; Phase 2 hands a student their groupmates
// through the evaluation they are actually in.
// ============================================================================

interface GroupRow {
  id: string
  name: string
  sort_order: number
  member_count: number
  members: PeerGroupMember[] | null
  created_at: string
}

function mapGroup(r: GroupRow): PeerGroup {
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    memberCount: r.member_count ?? 0,
    // The RPC already builds camelCase objects in its jsonb, so this is a
    // shape guard rather than a mapping — `jsonb_agg` returns null for a group
    // with no members before the coalesce, and a client running ahead of the
    // migration would get undefined.
    members: r.members ?? [],
    createdAt: r.created_at,
  }
}

/**
 * Every live group in a section, with its members attached.
 *
 * ONE call fills the builder. The screen derives "unassigned" as the section
 * roster minus everyone returned here rather than asking the server a second
 * question — a second source for who is placed is a second thing that can
 * disagree with the first.
 */
export async function getSectionGroups(sectionId: string): Promise<PeerGroup[]> {
  const rows = await rpc<GroupRow[]>('get_section_groups', { p_section: sectionId })
  return (rows ?? []).map(mapGroup)
}

/** Returns the new group's id. Raises in words on a duplicate name. */
export async function createPeerGroup(sectionId: string, name: string): Promise<string> {
  return await rpc<string>('create_peer_group', { p_section: sectionId, p_name: name })
}

export async function renamePeerGroup(groupId: string, name: string): Promise<void> {
  await rpc('rename_peer_group', { p_group: groupId, p_name: name })
}

/**
 * Replace a group's membership with exactly this list.
 *
 * Takes the WHOLE list, not a delta: the sheet the instructor is looking at
 * holds the complete answer, and a delta API lets the screen and the table
 * disagree about a checkbox that toggled twice.
 *
 * ⚠ A student in this list who is already on another team in the same section
 * is MOVED here — the database does that silently, because the alternative is
 * a unique-constraint violation with an index name for a message. The sheet is
 * where the instructor sees the move coming, so it must keep showing each
 * student's current group.
 */
export async function setPeerGroupMembers(groupId: string, studentIds: string[]): Promise<void> {
  await rpc('set_peer_group_members', { p_group: groupId, p_students: studentIds })
}

/** Archive, never delete — Phase 2 snapshots the group id on every submission. */
export async function archivePeerGroup(groupId: string): Promise<void> {
  await rpc('archive_peer_group', { p_group: groupId })
}
