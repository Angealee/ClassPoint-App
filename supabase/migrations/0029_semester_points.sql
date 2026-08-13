-- ============================================================================
-- ClassPoint · 0029 · Per-semester points (one shared pool, fresh each semester)
-- Run after 0028. Safe to re-run.
--
-- WHY: points accumulated forever, so a leaderboard in semester 2 would rank a
-- brand-new cohort against veterans who had been banking points since June.
-- From here, the RACE resets every semester while the HISTORY never does:
--
--   students.semester_points  → this semester's balance: XP, level, rank, and
--                               what a student can actually spend.
--   students.lifetime_points  → untouched, all-time. Achievements stay lifetime
--                               (a badge earned is a badge kept), and the
--                               instructor's records still show a career total.
--
-- Points remain ONE shared pool across subjects — a point earned in IT 32 spends
-- in Elective 1. Only attendance is subject-scoped (0028).
--
-- SHIPS INVISIBLE: until the first rollover there is exactly one semester, so
-- semester_points == lifetime_points for everyone. That's the point — any bug in
-- this migration shows up immediately as a visible difference between the two
-- columns, rather than as silent corruption on rollover day.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Deploy this migration BEFORE the matching client build: the snapshot
--   keeps both point columns filled, so a stale tab keeps working meanwhile.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Stamp every point event with its semester
-- ----------------------------------------------------------------------------
alter table public.point_events
  add column if not exists semester_id uuid references public.semesters(id);

create index if not exists point_events_semester_idx
  on public.point_events (student_id, semester_id, created_at desc);

-- A BEFORE INSERT trigger rather than a column DEFAULT on purpose: a default is
-- skipped when the client sends an explicit null, and api.ts inserts into
-- point_events directly (awardPoints). This way every row gets stamped, and
-- awardPoints needs no change.
create or replace function public.cp_stamp_semester()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.semester_id is null then
    NEW.semester_id := public.cp_active_semester_id();
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_stamp_semester on public.point_events;
create trigger trg_stamp_semester
  before insert on public.point_events
  for each row execute function public.cp_stamp_semester();

-- Everything that already exists belongs to the first semester.
update public.point_events
   set semester_id = (select id from public.semesters order by starts_on limit 1)
 where semester_id is null;

-- ----------------------------------------------------------------------------
-- 2. The semester balance cache
-- ----------------------------------------------------------------------------
alter table public.students
  add column if not exists semester_points integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'students_semester_points_check'
  ) then
    alter table public.students
      add constraint students_semester_points_check check (semester_points >= 0);
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 3. cp_recompute_points — ownership move 0007 → 0029
--    Same trigger signature, so `create or replace` rebinds it everywhere.
--    Now maintains BOTH caches. lifetime_points keeps its exact old meaning.
-- ----------------------------------------------------------------------------
create or replace function public.cp_recompute_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(NEW.student_id, OLD.student_id);
  v_semester uuid := public.cp_active_semester_id();
begin
  update public.students s
     set lifetime_points = greatest(
           0,
           coalesce((select sum(points) from public.point_events where student_id = target), 0)
         ),
         semester_points = greatest(
           0,
           coalesce((
             select sum(points) from public.point_events
              where student_id = target and semester_id = v_semester
           ), 0)
         )
   where s.id = target;
  return null;
end;
$$;

-- Backfill both caches once. Recomputing is idempotent by definition.
update public.students s
   set lifetime_points = greatest(
         0, coalesce((select sum(points) from public.point_events where student_id = s.id), 0)
       ),
       semester_points = greatest(
         0,
         coalesce((
           select sum(points) from public.point_events
            where student_id = s.id and semester_id = public.cp_active_semester_id()
         ), 0)
       );

-- ----------------------------------------------------------------------------
-- 4. The leaderboard ranks THIS SEMESTER
--    Ownership move: refresh_leaderboard_snapshot 0023 → 0029 (same signature).
--    Both point columns stay filled so a client mid-deploy can read either.
-- ----------------------------------------------------------------------------
alter table public.leaderboard_snapshot
  add column if not exists semester_points integer not null default 0;

create or replace function public.refresh_leaderboard_snapshot()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.leaderboard_snapshot;

  insert into public.leaderboard_snapshot
    (student_id, display_name, section_id, lifetime_points, semester_points, rank)
  select
    s.id,
    s.display_name,
    s.section_id,
    s.lifetime_points,
    s.semester_points,
    row_number() over (order by s.semester_points desc, s.display_name asc)
  from public.students s
  where s.archived_at is null;

  insert into public.leaderboard_meta (id, captured_at)
       values (true, now())
  on conflict (id) do update set captured_at = excluded.captured_at;
end;
$$;

select public.refresh_leaderboard_snapshot();

-- ----------------------------------------------------------------------------
-- 5. Spending draws on the SEMESTER pool
--    Ownership moves: request_point_redemption + decide_point_redemption
--    0019 → 0029. Same signatures; the ONLY change in either body is
--    lifetime_points → semester_points. Lock order (student row first) is
--    untouched, so the two still can't deadlock against each other.
--
--    The overspend argument from 0019 carries over unchanged: semester_points is
--    greatest(0, sum), so it is always ≥ the raw sum, and validating against it
--    can never authorise more than the student actually holds.
-- ----------------------------------------------------------------------------
create or replace function public.request_point_redemption(
  p_points int,
  p_kind   text,
  p_note   text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student        public.students%rowtype;
  v_pending_count  int;
  v_pending_points int;
  v_available      int;
  v_note           text := nullif(btrim(coalesce(p_note, '')), '');
  v_id             uuid;
begin
  -- Lock first, validate second: everything below reads a balance.
  select * into v_student from public.students where user_id = auth.uid() for update;
  if not found then
    raise exception 'Only students can request to use points.';
  end if;

  if p_kind is null or p_kind not in ('quiz', 'activity', 'exam', 'other') then
    raise exception 'Pick what these points are for.';
  end if;
  if p_kind = 'other' and v_note is null then
    raise exception 'Add a short note so your instructor knows what this is for.';
  end if;
  if v_note is not null and char_length(v_note) > 120 then
    raise exception 'Keep the note under 120 characters.';
  end if;
  if p_points is null or p_points < 1 or p_points > 50 then
    raise exception 'You can request between 1 and 50 points at a time.';
  end if;

  select count(*)::int, coalesce(sum(points), 0)::int
    into v_pending_count, v_pending_points
    from public.point_redemptions
   where student_id = v_student.id and status = 'pending';

  if v_pending_count >= 3 then
    raise exception 'You already have 3 requests waiting. Cancel one first.';
  end if;

  -- Points already promised to pending requests aren't spendable twice.
  v_available := v_student.semester_points - v_pending_points;
  if p_points > v_available then
    raise exception 'Not enough points — you have % available after your pending requests.',
      greatest(v_available, 0);
  end if;

  insert into public.point_redemptions (student_id, points, kind, note)
       values (v_student.id, p_points, p_kind, v_note)
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.decide_point_redemption(
  p_id      uuid,
  p_approve boolean,
  p_note    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req     public.point_redemptions%rowtype;
  v_student public.students%rowtype;
  v_event   uuid;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_label   text;
  v_title   text;
  v_body    text;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can decide requests.';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'Keep the note under 200 characters.';
  end if;

  -- Lock the request (guards a double-tap on Approve), then the student row.
  -- Same lock order as request_point_redemption → no deadlock between them.
  select * into v_req from public.point_redemptions where id = p_id for update;
  if not found then
    raise exception 'That request no longer exists.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'That request was already %.', v_req.status;
  end if;

  select * into v_student from public.students where id = v_req.student_id for update;
  if not found then
    raise exception 'That student no longer exists.';
  end if;

  v_label := case v_req.kind
               when 'quiz' then 'Quiz'
               when 'activity' then 'Activity'
               when 'exam' then 'Exam'
               else 'Other'
             end;

  if p_approve then
    -- Re-validate: their balance may have dropped since they asked.
    if v_req.points > v_student.semester_points then
      raise exception 'They only have % points now — not enough for this request.',
        v_student.semester_points;
    end if;

    insert into public.point_events (student_id, points, category, note)
         values (
           v_req.student_id, -v_req.points, 'redeem',
           'Used · ' || v_label || coalesce(' · ' || v_req.note, '')
         )
      returning id into v_event;
  end if;

  update public.point_redemptions
     set status         = case when p_approve then 'approved' else 'rejected' end,
         decided_at     = now(),
         decided_by     = auth.uid(),
         decision_note  = v_note,
         point_event_id = v_event
   where id = p_id;

  -- One push per decision: cp_notify_point_event (0017) deliberately skips
  -- 'redeem' rows so the debit above doesn't also announce itself.
  if p_approve then
    v_title := 'Request approved — ' || v_req.points || ' points used';
    v_body  := coalesce(v_note, 'Applied to your ' || lower(v_label) || '. Worth it.');
  else
    v_title := 'Request declined';
    v_body  := coalesce(v_note, 'Your ' || v_req.points || ' points are still yours.');
  end if;

  perform public.cp_push_dispatch(array[
    public.cp_queue_notification(v_req.student_id, 'redemption', v_title, v_body, '/app/points')
  ]);
end;
$$;

grant execute on function public.request_point_redemption(int, text, text) to authenticated;
grant execute on function public.decide_point_redemption(uuid, boolean, text) to authenticated;

-- ============================================================================
-- KNOWN, DELIBERATE, AND SAFE UNTIL ROLLOVER
--
--   cp_recompute_points computes semester_points relative to the ACTIVE
--   semester. Editing a PAST semester's event after a rollover therefore fixes
--   lifetime_points and leaves semester_points alone — which is correct — but it
--   also means the trigger alone cannot rebuild the cache when the active
--   semester CHANGES. `set_active_semester` (rollover migration) MUST bulk
--   recompute semester_points for every student as part of the switch.
--
--   Likewise, a redemption requested in one semester and approved in the next
--   would debit the new pool. The rollover pre-flight refuses to switch while
--   any redemption is still pending, which closes that window.
--
--   Neither can happen before a second semester exists.
--
-- Achievements are NOT touched here: cp_achievement_metrics keeps reading
-- lifetime_points for its `points` and `level` metrics, because badges are
-- lifetime by decision. A student can therefore sit at "Level 1" this semester
-- while holding the "Reach Level 3" badge — that badge is a trophy from an
-- earlier term, not a bug.
-- ============================================================================
-- Verify (run twice — this file is idempotent):
--
--   -- Before the first rollover these must be identical for everyone:
--   select count(*) from public.students where semester_points <> lifetime_points;  -- 0
--   select count(*) from public.point_events where semester_id is null;             -- 0
--
--   -- Award a point, then confirm BOTH caches moved:
--   select display_name, semester_points, lifetime_points from public.students
--    order by semester_points desc limit 5;
--
--   select student_id, semester_points, lifetime_points, rank
--     from public.leaderboard_snapshot order by rank limit 5;
-- ============================================================================
