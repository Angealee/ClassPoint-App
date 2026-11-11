-- ============================================================================
-- 0066 · get_event_attendees() — the checked-in list, read like the count
--
-- THE BUG (reported live, 2026-09-21): the monitor said "2 checked in" but the
-- list showed only 1. The count comes from get_event_stats (0055), a SECURITY
-- DEFINER function that BYPASSES RLS and counts every event_attendance row; the
-- list was a direct embed select that goes through the CALLER's RLS. When the
-- two read paths disagree — a definer count vs an RLS'd select — the number and
-- the names drift. get_event_stats was made a definer RPC for exactly this
-- reason (0055's "instructor monitor polls" note); the list must go the same way.
--
-- This RPC returns the attendee rows the count is counting, under the same
-- bypass, so the list can NEVER show fewer than the number. Instructor-gated
-- exactly like get_event_stats — same gate, same caller, so if the count works
-- the list works. `p_limit` NULL = all (the read-only review); a cap keeps the
-- live monitor/feed cheap at a school-wide event.
--
-- OWNERSHIP: new function, no move. No audit action, no constraint to widen.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Paste and run. Depends only on 0055's event tables. Idempotent.
-- ============================================================================

create or replace function public.get_event_attendees(
  p_event_id uuid,
  p_limit    integer default null
)
returns table (
  student_id   uuid,
  display_name text,
  avatar_url   text,
  section_name text,
  scanned_at   timestamptz,
  manual       boolean,
  points       integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can view event attendees.';
  end if;
  -- Every column is qualified (ea./s./sec./pe.) so an OUT column sharing a name
  -- with a table column can't shadow it (the 0035/0050 RETURNS TABLE trap).
  -- LEFT JOINs so a null section or a 0-point check-in still returns its row.
  return query
    select
      ea.student_id,
      s.display_name,
      s.avatar_url,
      sec.name,
      ea.scanned_at,
      ea.manual,
      coalesce(pe.points, 0)
    from public.event_attendance ea
    left join public.students s      on s.id = ea.student_id
    left join public.sections sec    on sec.id = ea.section_id
    left join public.point_events pe on pe.id = ea.point_event_id
    where ea.event_id = p_event_id
    order by ea.scanned_at desc, ea.id desc
    limit p_limit;                                  -- NULL = no limit
end;
$$;

grant execute on function public.get_event_attendees(uuid, integer) to authenticated;

-- ============================================================================
-- Verify:
--   -- one function, no accidental overload:
--   select count(*) from pg_proc where proname = 'get_event_attendees';   -- 1
--
--   -- as the instructor, the list length equals get_event_stats' total for the
--   -- same event (they now read the same rows the same way):
--   select (select total from public.get_event_stats('<event-uuid>'))
--        = (select count(*) from public.get_event_attendees('<event-uuid>'));  -- t
-- ============================================================================
