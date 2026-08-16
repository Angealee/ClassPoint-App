-- ============================================================================
-- ClassPoint · 0035 · Semester rollover
-- Run after 0034. Safe to re-run.
--
-- The migration this whole academic structure was built toward: ending one
-- semester and starting the next without losing anyone's account, achievements
-- or history.
--
-- This file honours a contract written at the foot of 0029, which is worth
-- restating because getting it wrong corrupts every student's balance:
--
--   * `cp_recompute_points` is ACTIVE-SEMESTER-RELATIVE. The trigger recomputes
--     against whatever semester is active AT THE TIME A POINT ROW CHANGES, so
--     it physically cannot notice that the semester itself changed.
--     `set_active_semester` must therefore BULK RECOMPUTE `semester_points` for
--     every student as part of the switch. It does, below.
--
--   * A redemption requested in one semester and approved in the next would
--     debit the wrong pool. The pre-flight refuses to switch while any
--     redemption is pending, which closes that window entirely.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. audit_log gains the two rollover actions
--    Constraint name preserved (the 0007/0011 rule), and 0034's 'broadcast'
--    carried forward — dropping it here would silently narrow the constraint.
-- ----------------------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'delete','archive','restore','hard_delete','broadcast',
    'promote','semester_activate'
  ));

-- ----------------------------------------------------------------------------
-- 2. promote_students — move a set of students into a new section
--
--    One audit row per student: a bulk move is exactly the operation you want
--    an itemised record of when someone turns up in the wrong class.
-- ----------------------------------------------------------------------------
drop function if exists public.promote_students(uuid[], uuid);
create function public.promote_students(p_student_ids uuid[], p_target_section uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section public.sections%rowtype;
  v_student public.students%rowtype;
  v_count   integer := 0;
  v_id      uuid;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can promote students.';
  end if;

  select * into v_section from public.sections where id = p_target_section;
  if not found then
    raise exception 'That target section no longer exists.';
  end if;

  if p_student_ids is null or array_length(p_student_ids, 1) is null then
    return 0;
  end if;

  foreach v_id in array p_student_ids loop
    select * into v_student from public.students where students.id = v_id for update;
    if not found then
      continue;                          -- deleted mid-wizard; skip quietly
    end if;
    if v_student.archived_at is not null then
      continue;                          -- archived students don't get promoted
    end if;
    if v_student.section_id = p_target_section then
      continue;                          -- already there; idempotent
    end if;

    update public.students set section_id = p_target_section where students.id = v_id;

    insert into public.audit_log (actor, action, table_name, row_id, student_id, summary, row_data)
         values (auth.uid(), 'promote', 'students', v_id, v_id,
                 v_student.full_name || ' → ' || v_section.name,
                 jsonb_build_object(
                   'from_section', v_student.section_id,
                   'to_section',   p_target_section,
                   'student',      to_jsonb(v_student)
                 ));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.promote_students(uuid[], uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. archive_students — bulk wrapper
--
--    Calls the single-student RPC for its audit row and locking, but refreshes
--    the leaderboard ONCE at the end rather than once per student. Archiving a
--    class of 40 through the single function would rebuild the whole snapshot
--    40 times.
-- ----------------------------------------------------------------------------
drop function if exists public.archive_students(uuid[]);
create function public.archive_students(p_student_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_count   integer := 0;
  v_id      uuid;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can archive students.';
  end if;

  if p_student_ids is null or array_length(p_student_ids, 1) is null then
    return 0;
  end if;

  foreach v_id in array p_student_ids loop
    select * into v_student from public.students where students.id = v_id for update;
    if not found or v_student.archived_at is not null then
      continue;
    end if;

    update public.students set archived_at = now() where students.id = v_id;

    insert into public.audit_log (actor, action, table_name, row_id, student_id, summary, row_data)
         values (auth.uid(), 'archive', 'students', v_id, v_id,
                 v_student.full_name || ' · ' || v_student.lifetime_points || ' pts',
                 to_jsonb(v_student));
    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    perform public.refresh_leaderboard_snapshot();
  end if;
  return v_count;
end;
$$;

grant execute on function public.archive_students(uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Rollover pre-flight — readable on its own so the wizard can SHOW the
--    blockers before the instructor commits to anything.
--
--    Returns one row per problem. An empty result means it is safe to activate.
--    `unplaced` is deliberately a WARNING, not a blocker (instructor's call):
--    leaving a student behind is often intentional — they dropped, transferred
--    or graduated — so it reports rather than refuses.
-- ----------------------------------------------------------------------------
drop function if exists public.get_rollover_preflight(uuid);
create function public.get_rollover_preflight(p_semester_id uuid)
returns table (
  code       text,
  severity   text,
  -- NOT named `count`: a RETURNS TABLE column is a plpgsql variable, so an OUT
  -- column called `count` shadows the aggregate and `count(*)` below stops
  -- parsing as a function call.
  item_count integer,
  detail     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can run the rollover pre-flight.';
  end if;

  return query
  select 'active_session'::text, 'block'::text, count(*)::integer,
         'A class is still running. End it before switching semesters.'::text
    from public.class_sessions where status = 'active'
   having count(*) > 0;

  return query
  select 'pending_redemption'::text, 'block'::text, count(*)::integer,
         'Point requests are still pending. A request approved after the switch would debit the new semester''s points.'::text
    from public.point_redemptions where status = 'pending'
   having count(*) > 0;

  return query
  select 'pending_excuse'::text, 'block'::text, count(*)::integer,
         'Absence excuses are still pending. Decide them while their sessions still belong to this semester.'::text
    from public.absence_excuses where status = 'pending'
   having count(*) > 0;

  return query
  select 'uncommitted_penalties'::text, 'warn'::text, count(*)::integer,
         'Ended sessions have penalties that were never committed. Those deductions will never be applied.'::text
    from public.class_sessions
   where status = 'ended' and apply_penalties and not penalties_committed
   having count(*) > 0;

  -- Active students still sitting in a section that is NOT in the semester
  -- about to become active: after the switch they become read-only.
  return query
  select 'unplaced'::text, 'warn'::text, count(*)::integer,
         'Students are not in the new semester. They keep their account and history but become read-only.'::text
    from public.students stu
    join public.sections sec on sec.id = stu.section_id
   where stu.archived_at is null
     and sec.semester_id is distinct from p_semester_id
   having count(*) > 0;

  return query
  select 'no_sections'::text, 'block'::text, 0,
         'The new semester has no sections yet.'::text
   where not exists (
     select 1 from public.sections where semester_id = p_semester_id
   );
end;
$$;

grant execute on function public.get_rollover_preflight(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. set_active_semester — the switch itself
-- ----------------------------------------------------------------------------
drop function if exists public.set_active_semester(uuid);
create function public.set_active_semester(p_semester_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semester public.semesters%rowtype;
  v_previous uuid;
  v_blocker  record;
  v_students integer;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can switch semesters.';
  end if;

  select * into v_semester from public.semesters where id = p_semester_id for update;
  if not found then
    raise exception 'That semester no longer exists.';
  end if;
  if v_semester.is_active then
    return 0;                            -- already active; idempotent no-op
  end if;

  -- Re-run the blocking pre-flight HERE rather than trusting the UI to have
  -- checked. The wizard shows it, but this function is the actual gate.
  for v_blocker in
    select * from public.get_rollover_preflight(p_semester_id) where severity = 'block'
  loop
    raise exception '%', v_blocker.detail;
  end loop;

  select id into v_previous from public.semesters where is_active limit 1;

  -- Two-step flip. The partial unique index `(is_active) where is_active` means
  -- a single UPDATE that sets one row true while another is still true would
  -- violate it mid-statement — clear first, then set.
  update public.semesters set is_active = false where is_active;
  update public.semesters set is_active = true where id = p_semester_id;

  -- THE 0029 CONTRACT. cp_recompute_points is active-semester-relative and runs
  -- only when a point row changes, so nothing else in the system will ever
  -- rebuild this cache for a semester CHANGE. Without these lines every student
  -- keeps last semester's balance as their new spendable points.
  update public.students s
     set semester_points = greatest(0, coalesce((
           select sum(pe.points) from public.point_events pe
            where pe.student_id = s.id and pe.semester_id = p_semester_id
         ), 0));

  select count(*) into v_students from public.students where archived_at is null;

  perform public.refresh_leaderboard_snapshot();

  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
       values (auth.uid(), 'semester_activate', 'semesters', p_semester_id,
               'Activated ' || v_semester.name,
               jsonb_build_object(
                 'from_semester', v_previous,
                 'to_semester',   p_semester_id,
                 'name',          v_semester.name,
                 'students',      v_students
               ));

  return v_students;
end;
$$;

grant execute on function public.set_active_semester(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. get_semester_leaderboard — a past semester's final board, on demand
--
--    Computed from `point_events` rather than read from `leaderboard_snapshot`,
--    because the snapshot only ever holds the CURRENT board.
--
--    Archived students ARE included here, unlike the live board which filters
--    them out: they were on that board when it mattered, and a history that
--    quietly drops people is not a history. Zero-point students are included
--    too, again matching the live board.
--
--    Granted to authenticated (not instructor-only) — students get a semester
--    picker on their leaderboard.
-- ----------------------------------------------------------------------------
drop function if exists public.get_semester_leaderboard(uuid);
create function public.get_semester_leaderboard(p_semester_id uuid)
returns table (
  student_id   uuid,
  display_name text,
  section_id   uuid,
  section_name text,
  points       integer,
  rank         integer,
  avatar_url   text
)
language sql
stable
security definer
set search_path = public
as $$
  -- Every reference is qualified through the `t` subquery. Bare `points` or
  -- `rank` in the outer query would collide with this function's own OUT column
  -- names, which are in scope as parameters.
  select t.student_id,
         t.display_name,
         t.section_id,
         t.section_name,
         t.points,
         -- row_number, NOT rank, with the same display_name tiebreaker the live
         -- board uses (refresh_leaderboard_snapshot, 0029). If this produced
         -- ties where the live board produced a strict order, a student's
         -- remembered "I finished 7th" would disagree with their own history.
         (row_number() over (order by t.points desc, t.display_name asc))::integer,
         t.avatar_url
    from (
      select stu.id            as student_id,
             stu.display_name  as display_name,
             stu.section_id    as section_id,
             sec.name          as section_name,
             stu.avatar_url    as avatar_url,
             greatest(0, coalesce(sum(pe.points), 0))::integer as points
        from public.students stu
        join public.sections sec on sec.id = stu.section_id
        left join public.point_events pe
               on pe.student_id = stu.id and pe.semester_id = p_semester_id
       where sec.semester_id = p_semester_id
       group by stu.id, stu.display_name, stu.section_id, sec.name, stu.avatar_url
    ) t
   order by t.points desc, t.display_name;
$$;

grant execute on function public.get_semester_leaderboard(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Ownership move: scan_attendance 0023 → 0035
--
--    Same signature, so a plain `create or replace` rebinds it. Body copied
--    forward VERBATIM from 0023 with ONE addition: the active-semester guard,
--    deliberately deferred from 0028 because a past-semester section could not
--    exist until this migration made one possible.
--
--    Without it, a student stranded in an ended semester could still scan into
--    an old section's session and earn attendance in a semester that is over.
-- ----------------------------------------------------------------------------
create or replace function public.scan_attendance(
  p_session_id uuid,
  p_window     bigint,
  p_code       text
)
returns table (status text, already boolean, topic text, marked_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_student   public.students%rowtype;
  v_session   public.class_sessions%rowtype;
  v_secret    text;
  v_now_w     bigint;
  v_expected  text;
  v_elapsed   numeric;
  v_status    text;
  v_existing  public.attendance_records%rowtype;
  v_semester  uuid;
begin
  -- Identify the caller as a claimed, active student.
  select * into v_student from public.students where user_id = auth.uid();
  if not found then
    raise exception 'Only a signed-in student can check in.';
  end if;
  if v_student.archived_at is not null then
    raise exception 'This account has been archived — talk to your instructor.';
  end if;

  select * into v_session from public.class_sessions where id = p_session_id;
  if not found then
    raise exception 'That class session no longer exists.';
  end if;
  if v_session.status <> 'active' then
    raise exception 'This class session has ended.';
  end if;
  if v_student.section_id <> v_session.section_id then
    raise exception 'This class is for a different section.';
  end if;

  -- NEW IN 0035: the section must belong to the ACTIVE semester. Deferred from
  -- 0028 on purpose — before rollover existed there was no way to be in a
  -- past-semester section, and copying this long function forward twice is how
  -- ownership bugs get made.
  select sec.semester_id into v_semester
    from public.sections sec where sec.id = v_session.section_id;
  if v_semester is distinct from public.cp_active_semester_id() then
    raise exception 'That class belongs to a semester that has ended.';
  end if;

  -- 15-second windows. Accept the previous/current/next window: "previous" covers
  -- scan latency, "next" tolerates the instructor device's clock running slightly
  -- ahead of the DB. A valid code still lasts under a minute, so a forwarded
  -- screenshot stops working quickly.
  v_now_w := floor(extract(epoch from now()) / 15)::bigint;
  if p_window not in (v_now_w - 1, v_now_w, v_now_w + 1) then
    raise exception 'This QR code has expired — scan the one on screen now.';
  end if;

  select qr_secret into v_secret from public.class_session_secrets where session_id = p_session_id;
  v_expected := left(
    encode(extensions.hmac(p_session_id::text || '.' || p_window::text, v_secret, 'sha256'), 'hex'),
    16
  );
  if v_expected is distinct from lower(p_code) then
    raise exception 'That code is not valid for this class.';
  end if;

  -- Already checked in? Return the recorded status (idempotent, no double log).
  select * into v_existing
    from public.attendance_records
   where session_id = p_session_id and student_id = v_student.id;
  if found then
    return query select v_existing.status, true, v_session.topic, v_existing.scanned_at;
    return;
  end if;

  v_elapsed := extract(epoch from (now() - v_session.started_at)) / 60.0;
  if v_elapsed >= v_session.absent_after_min then
    v_status := 'absent';
  elsif v_elapsed >= v_session.late_after_min then
    v_status := 'late';
  else
    v_status := 'present';
  end if;

  insert into public.attendance_records (session_id, student_id, status, scanned_at)
       values (p_session_id, v_student.id, v_status, now())
  on conflict (session_id, student_id) do nothing;

  return query select v_status, false, v_session.topic, now();
end;
$$;

-- ============================================================================
-- Verify (run the whole file twice — it is idempotent):
--
--   select * from public.get_rollover_preflight(
--     (select id from public.semesters where not is_active limit 1));
--
--   -- Past board (empty until a second semester exists):
--   select * from public.get_semester_leaderboard(
--     (select id from public.semesters where is_active)) limit 5;
--
-- ── THE ACID TEST (do this on a scratch semester before the real rollover) ──
--   Create "TEST SEM", give it a section, promote 2 students into it, then:
--
--     select semester_points, lifetime_points from public.students
--      where id = '<a student with points>';        -- note both numbers
--
--     select public.set_active_semester('<test sem id>');
--     -- semester_points must now be 0; lifetime_points UNCHANGED.
--
--     select public.set_active_semester('<original sem id>');
--     -- semester_points must ROUND-TRIP to its exact original value.
--
--   If it does not round-trip, STOP — the bulk recompute in section 5 is the
--   only thing standing between a rollover and every student's balance being
--   wrong. Then clean up the test semester.
-- ============================================================================
