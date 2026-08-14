-- ============================================================================
-- ClassPoint · 0031 · Attendance aggregates (the 1000-row truncation fix)
-- Run after 0030. Safe to re-run.
--
-- WHY: three hot paths fetched `attendance_records` with `.in(session_ids)` and
-- no paging. PostgREST caps any response at 1000 rows and truncates SILENTLY —
-- no error, no warning. At this app's real scale (one roster × two subjects ×
-- 18 weeks) the section crosses 1000 records around week 12:
--
--     30 students × 36 sessions = 1080 rows   → truncates ~week 17
--     40 students × 36 sessions = 1440 rows   → truncates ~week 12
--
-- Past that line, sessions at the tail of the list tally as "0 present, 0 late,
-- 0 absent", show-up rates RISE (the denominator shrinks), and "Needs attention"
-- quietly empties — wrong numbers on the exact screen used to decide who is
-- failing attendance.
--
-- THE FIX (hybrid, by design):
--   • Tallies the client only ever aggregates move INTO the database as the two
--     functions below — the response shrinks to one row per session / student
--     and stops growing with the semester.
--   • True row-matrix needs (the printable register, a student's full history)
--     stay client-side but page through `.range()` — that half lives in api.ts
--     (`fetchAllPages`), not here.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Per-session tallies — replaces the unbounded fetch in listSessions()
--    One row per session THAT HAS RECORDS; the client keeps its zero-tally
--    fallback for sessions with none, exactly as before.
-- ----------------------------------------------------------------------------
drop function if exists public.get_section_session_tallies(uuid);
create function public.get_section_session_tallies(p_section_id uuid)
returns table (
  session_id  uuid,
  present     integer,
  late        integer,
  absent      integer,
  excused     integer,
  irregular   integer,
  total       integer,
  synced_late integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read section tallies.';
  end if;

  return query
  select
    ar.session_id,
    (count(*) filter (where ar.status = 'present'))::integer,
    (count(*) filter (where ar.status = 'late'))::integer,
    (count(*) filter (where ar.status = 'absent'))::integer,
    (count(*) filter (where ar.status = 'excused'))::integer,
    (count(*) filter (where ar.status = 'irregular'))::integer,
    count(*)::integer,
    (count(*) filter (where ar.synced_late))::integer
  from public.attendance_records ar
  join public.class_sessions cs on cs.id = ar.session_id
  where cs.section_id = p_section_id
  group by ar.session_id;
end;
$$;

grant execute on function public.get_section_session_tallies(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Per-student section stats — replaces the record fetch AND the follow-up
--    penalty scan in getAttendanceAnalytics(). Also the backend for the
--    cross-section risk overview (Era 5.0 Phase G).
--
--    Semantics preserved exactly from the client version it replaces:
--      • roster = ACTIVE students of the section (archived excluded) — every
--        one appears, even with zero records (left join);
--      • records = the section's sessions, optionally one subject's;
--      • counted excludes excused/irregular (the NEUTRAL rule from 0018);
--      • penalty_points sums |points| of events referenced by a record's
--        penalty_event_id — which is precisely the attendance penalties and
--        never the instructor's manual ones (those are unreferenced), the same
--        narrowing the old client pass did via its penaltyIds set.
-- ----------------------------------------------------------------------------
drop function if exists public.get_section_attendance_stats(uuid, uuid);
create function public.get_section_attendance_stats(
  p_section_id uuid,
  p_subject_id uuid default null
)
returns table (
  student_id     uuid,
  full_name      text,
  avatar_url     text,
  present        integer,
  late           integer,
  absent         integer,
  excused        integer,
  irregular      integer,
  counted        integer,
  penalty_points integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read attendance stats.';
  end if;

  return query
  select
    s.id,
    s.full_name,
    s.avatar_url,
    (count(ar.id) filter (where ar.status = 'present'))::integer,
    (count(ar.id) filter (where ar.status = 'late'))::integer,
    (count(ar.id) filter (where ar.status = 'absent'))::integer,
    (count(ar.id) filter (where ar.status = 'excused'))::integer,
    (count(ar.id) filter (where ar.status = 'irregular'))::integer,
    (count(ar.id) filter (where ar.status in ('present', 'late', 'absent')))::integer,
    coalesce(sum(abs(pe.points)), 0)::integer
  from public.students s
  left join public.attendance_records ar
    on ar.student_id = s.id
   and ar.session_id in (
         select cs.id from public.class_sessions cs
          where cs.section_id = p_section_id
            and (p_subject_id is null or cs.subject_id = p_subject_id)
       )
  left join public.point_events pe
    on pe.id = ar.penalty_event_id
   and pe.category = 'penalty'
  where s.section_id = p_section_id
    and s.archived_at is null
  group by s.id, s.full_name, s.avatar_url
  order by s.full_name;
end;
$$;

grant execute on function public.get_section_attendance_stats(uuid, uuid) to authenticated;

-- ============================================================================
-- Verify (run twice — this file is idempotent):
--
--   -- Tallies must equal a manual count for one section:
--   select * from public.get_section_session_tallies('<section-uuid>') limit 5;
--   select session_id, count(*) from public.attendance_records ar
--     join public.class_sessions cs on cs.id = ar.session_id
--    where cs.section_id = '<section-uuid>' group by 1 limit 5;
--
--   -- Stats parity: every ACTIVE student appears (zero-record students too),
--   -- counted excludes excused/irregular, penalty_points only counts events
--   -- referenced by penalty_event_id:
--   select * from public.get_section_attendance_stats('<section-uuid>');
--   select * from public.get_section_attendance_stats('<section-uuid>', '<subject-uuid>');
--
--   -- Row counts stay bounded by roster/session size — this is the point:
--   select count(*) from public.get_section_attendance_stats('<section-uuid>');  -- = roster size
-- ============================================================================
