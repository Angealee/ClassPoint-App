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
-- 4. cp_achievement_metrics() — intentionally NOT recreated here.
--
-- Migration 0021 is the SOLE owner of cp_achievement_metrics: it drops and
-- recreates the function with two extra columns (points_spent,
-- redemptions_approved) AND already includes the excused/irregular streak
-- filters this phase introduced. Recreating it here too caused a return-type
-- clash (ERROR 42P13) whenever 0021 had already been applied — two migrations
-- can't both own a function whose signature changes.
--
-- The neutral-status behaviour still ships: the filters live in 0021's
-- canonical body. If you're applying these in a fresh, in-order run, the
-- streak metric simply picks up the filters at 0021 instead of here — and
-- since excused/irregular records can't exist until the CHECK widening above
-- is applied, there's no window where the difference is observable.
-- ----------------------------------------------------------------------------
