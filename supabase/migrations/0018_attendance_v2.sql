-- ============================================================================
-- ClassPoint · 0018 · Attendance v2 — excused/irregular + penalty reconciliation
-- Run after 0017. Safe to re-run (idempotent).
--
-- WHAT THIS CHANGES
--   1. Two new statuses:
--        'excused'   — a legitimate absence. Neutral: no penalty, and the
--                      session is excluded from streaks/rates entirely.
--        'irregular' — this student isn't part of this session at all
--                      (off-section, sitting in elsewhere). Also fully neutral.
--      "Neutral" means: the session neither breaks NOR extends a streak, and it
--      doesn't count toward present/attended totals. It simply doesn't exist
--      for that student.
--   2. set_attendance_status() — the ONE write path for status changes, and the
--      fix for the real gap: editing attendance AFTER penalties were committed
--      used to leave the points ledger wrong. It now reconciles the ledger on
--      every transition (absent→present removes the −5; present→absent adds one).
--   3. delete_attendance_record() — fixes a latent bug: resetting a committed
--      check-in orphaned its penalty (the FK is `on delete set null`, so the
--      −5 survived with nothing pointing at it and could never be undone).
--
-- DELIBERATELY UNCHANGED
--   • end_class_session() — it inserts absents with `on conflict do nothing`,
--     so a student already marked excused/irregular is never overwritten.
--     This is correct. Don't "fix" it.
--   • commit_attendance_penalties() — it only deducts for late/absent; every
--     other status already falls through penalty-free. It also does NOT queue
--     notifications: the point_events insert fires cp_notify_point_event
--     (0017), which already announces "−5 points · Absent · <topic>". Adding
--     one here would push twice for the same penalty.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Paste and run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Widen the status domain (keep the constraint name — 0007/0011 precedent)
-- ----------------------------------------------------------------------------
alter table public.attendance_records
  drop constraint if exists attendance_records_status_check;
alter table public.attendance_records
  add constraint attendance_records_status_check
  check (status in ('present', 'late', 'absent', 'excused', 'irregular'));

-- ----------------------------------------------------------------------------
-- 2. set_attendance_status() — status change + penalty reconciliation
--
-- The state machine, for a COMMITTED record:
--   old penalty (if any) is deleted  → trg_points_recompute restores the points
--   new penalty (if the new status earns one) is inserted and linked
-- so every transition is symmetric and the ledger always matches the status:
--   absent  → present    removes −5
--   present → absent     adds    −5
--   late    → excused    removes −1
--   absent  → irregular  removes −5
-- `committed` stays true: the record IS reconciled, it just changed.
--
-- For an UNCOMMITTED record it's a plain status update — penalties don't exist
-- yet and get computed at commit time.
-- ----------------------------------------------------------------------------
create or replace function public.set_attendance_status(p_record_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec     public.attendance_records%rowtype;
  v_session public.class_sessions%rowtype;
  v_label   text;
  v_points  integer := 0;
  v_event   uuid;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can change attendance.';
  end if;
  if p_status is null or p_status not in ('present', 'late', 'absent', 'excused', 'irregular') then
    raise exception 'Unknown attendance status: %', p_status;
  end if;

  -- Lock the record, then its session — same order everywhere, so concurrent
  -- edits serialize instead of deadlocking.
  select * into v_rec from public.attendance_records where id = p_record_id for update;
  if not found then
    raise exception 'That attendance record no longer exists.';
  end if;

  if v_rec.status = p_status then
    return; -- no-op; don't churn the ledger
  end if;

  select * into v_session from public.class_sessions where id = v_rec.session_id for update;
  if not found then
    raise exception 'That class session no longer exists.';
  end if;

  if not v_rec.committed then
    update public.attendance_records set status = p_status where id = p_record_id;
    return;
  end if;

  -- Reverse whatever the old status cost. Deleting the event is enough to give
  -- the points back: trg_points_recompute fires on delete and recomputes
  -- students.lifetime_points from the ledger.
  if v_rec.penalty_event_id is not null then
    delete from public.point_events where id = v_rec.penalty_event_id;
  end if;

  if v_session.apply_penalties then
    if p_status = 'late' then
      v_points := v_session.late_penalty;
    elsif p_status = 'absent' then
      v_points := v_session.absent_penalty;
    end if;
  end if;

  if v_points > 0 then
    -- Same label format commit_attendance_penalties uses, so the ledger reads
    -- consistently no matter which path wrote the penalty.
    v_label := coalesce(nullif(v_session.topic, ''), to_char(v_session.started_at, 'Mon DD'));
    insert into public.point_events (student_id, points, category, note)
         values (v_rec.student_id, -v_points, 'penalty', initcap(p_status) || ' · ' || v_label)
      returning id into v_event;
  end if;

  update public.attendance_records
     set status = p_status, penalty_event_id = v_event
   where id = p_record_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. delete_attendance_record() — reset a check-in without orphaning a penalty
-- ----------------------------------------------------------------------------
create or replace function public.delete_attendance_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec public.attendance_records%rowtype;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can reset attendance.';
  end if;

  select * into v_rec from public.attendance_records where id = p_record_id for update;
  if not found then
    return;
  end if;

  -- Order matters: drop the penalty first so the points come back, then the row.
  if v_rec.penalty_event_id is not null then
    delete from public.point_events where id = v_rec.penalty_event_id;
  end if;
  delete from public.attendance_records where id = p_record_id;
end;
$$;

grant execute on function public.set_attendance_status(uuid, text)   to authenticated;
grant execute on function public.delete_attendance_record(uuid)      to authenticated;

-- ----------------------------------------------------------------------------
-- 4. cp_achievement_metrics() — teach the streaks about neutral sessions
--
-- Return type is unchanged, so `create or replace` is fine here (a signature
-- change would need `drop function` first — the 0014 lesson).
--
-- The only edits vs the 0016 body are the two `and ar.status not in
-- ('excused','irregular')` filters in the streak subqueries. Excluding those
-- rows entirely is exactly "neutral": the run continues across an excused
-- session, but the excused session itself doesn't add to it. present_count and
-- attended_count already filter on ('present','late'), so they need nothing.
-- ----------------------------------------------------------------------------
create or replace function public.cp_achievement_metrics(p_student_id uuid)
returns table (
  points          integer,
  recitations     integer,
  present_count   integer,
  attended_count  integer,
  streak          integer,
  early_streak    integer,
  level           integer,
  rank            integer,
  views_received  integer,
  views_given     integer,
  unlocked_count  integer,
  banner_count    integer,
  has_events      boolean,
  has_attendance  boolean,
  has_avatar      boolean,
  has_bio_and_interests boolean,
  has_clean_slate boolean,
  has_comeback    boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points     integer;
  v_bio        text;
  v_interests  text;
  v_avatar     text;
  v_banners    text[];
  v_created_at timestamptz;
begin
  select lifetime_points, bio, interests, avatar_url, banner_urls, created_at
    into v_points, v_bio, v_interests, v_avatar, v_banners, v_created_at
    from public.students where id = p_student_id;
  if not found then
    raise exception 'Student not found.';
  end if;

  return query
  select
    v_points,
    (select count(*)::integer from public.point_events
      where student_id = p_student_id and category = 'recitation'),
    (select count(*)::integer from public.attendance_records
      where student_id = p_student_id and status = 'present'),
    (select count(*)::integer from public.attendance_records
      where student_id = p_student_id and status in ('present', 'late')),
    -- Current consecutive non-absent streak, counting backward from the most
    -- recent session: a running count of absences ordered newest-first hits 1
    -- exactly at (and stays >=1 after) the first absence, so "running_absent
    -- = 0" rows are exactly the unbroken run since then.
    -- Excused/irregular sessions are filtered out entirely — they neither
    -- break the run nor count toward it.
    (select count(*)::integer from (
        select sum(case when ar.status = 'absent' then 1 else 0 end)
                 over (order by cs.started_at desc) as running_absent
          from public.attendance_records ar
          join public.class_sessions cs on cs.id = ar.session_id
         where ar.student_id = p_student_id
           and ar.status not in ('excused', 'irregular')
      ) t where running_absent = 0),
    -- Same gaps-and-islands technique, keyed on "checked in within 2 minutes
    -- of the session opening" instead of "not absent".
    (select count(*)::integer from (
        select sum(
                 case when ar.scanned_at is not null
                           and ar.scanned_at <= cs.started_at + interval '2 minutes'
                      then 0 else 1 end
               ) over (order by cs.started_at desc) as running_not_early
          from public.attendance_records ar
          join public.class_sessions cs on cs.id = ar.session_id
         where ar.student_id = p_student_id
           and ar.status not in ('excused', 'irregular')
      ) t where running_not_early = 0),
    public.cp_level(v_points),
    (select rank from public.leaderboard_snapshot where student_id = p_student_id),
    (select coalesce(sum(view_count), 0)::integer from public.profile_views where viewed_id = p_student_id),
    (select coalesce(sum(view_count), 0)::integer from public.profile_views where viewer_id = p_student_id),
    (select count(*)::integer from public.student_achievements where student_id = p_student_id),
    coalesce(array_length(v_banners, 1), 0),
    exists(select 1 from public.point_events where student_id = p_student_id),
    exists(select 1 from public.attendance_records where student_id = p_student_id and scanned_at is not null),
    v_avatar is not null,
    v_bio is not null and v_interests is not null,
    -- Only eligible once enrolled 30+ days (otherwise a brand-new student
    -- would trivially clear "zero penalties" with zero elapsed time to earn
    -- one), and zero penalty-category events in the trailing 30 days.
    v_created_at <= now() - interval '30 days'
      and not exists (
        select 1 from public.point_events
         where student_id = p_student_id and category = 'penalty'
           and created_at >= now() - interval '30 days'
      ),
    exists (
      select 1
        from public.point_events p
        join public.point_events pen
          on pen.student_id = p.student_id and pen.category = 'penalty'
       where p.student_id = p_student_id and p.points > 0
         and p.created_at > pen.created_at
         and p.created_at <= pen.created_at + interval '24 hours'
    );
end;
$$;
