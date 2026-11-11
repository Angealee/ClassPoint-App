-- ============================================================================
-- 0060 · Closing a semester
--
-- WHAT THIS ADDS
--   The first semester is over and a new cohort is arriving, and nothing in the
--   app could END a semester. 0035 gave us promote / archive / activate, but
--   the only BULK archive reachable from the UI covers the unticked students of
--   ONE selected section — so closing a semester meant repeating a confirm
--   dialog once per section and hoping you had not missed one.
--
--     * semesters.farewell_message    — what the outgoing batch reads on their
--                                       way out. Per SEMESTER, so next year's
--                                       batch gets its own and this year's
--                                       keeps the words written for them.
--     * archive_semester_students()   — archive everyone in a semester, in one
--                                       call, with one snapshot refresh.
--     * get_semester_close_preview()  — who that is, so the confirm dialog can
--                                       state a real number and name names.
--     * restore_student_into()        — bring an archived student BACK, into a
--                                       section of the semester they are
--                                       rejoining. This is the half 0023 was
--                                       missing (see section 4).
--
-- OWNERSHIP MOVE
--   request_point_redemption  0029 → 0060. Same signature, plain
--   `create or replace`, body carried forward VERBATIM plus exactly one new
--   line: an archived guard. It was the ONLY student-callable write in the app
--   with no archived check, so an archived student holding leftover
--   semester_points could still file requests into the instructor's inbox.
--   0029 is NOT edited.
--
-- WHAT ARCHIVING STILL DOES NOT DO, and that is deliberate
--   It sets students.archived_at and nothing else on the row. Points,
--   semester_points, lifetime_points, badges, attendance, the auth user and the
--   claim token all survive untouched. That is what makes a returning student
--   possible, and it is why restore_student_into can be a two-column update
--   rather than a rebuild.
--
-- ── ONE-TIME SETUP ───────────────────────────────────────────────────────────
--   ⚠ BEFORE PASTING, run BLOCK 2 of supabase/queries/applied_state.sql and
--     compare its output with the list in section 6 below. Section 6 drops and
--     recreates audit_log_action_check, and a drop-and-recreate that omits a
--     value silently NARROWS the constraint — which has already happened twice
--     in this project. If BLOCK 2 shows a value section 6 does not list, add it
--     before running this file.
--
--   Otherwise: nothing. Paste and run. Idempotent — safe to run twice.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The farewell message
--
--    One nullable column on semesters. Deliberately NOT a table and NOT an
--    RPC: `semesters` is already `select … to authenticated` (0027), so an
--    archived student — who is still an ordinary authenticated student as far
--    as auth is concerned — can read their own send-off with no new grant, no
--    new function and no extra round trip.
--
--    400 characters because it is read once, full-screen, on a phone, and
--    because a message long enough to scroll is a message nobody finishes.
-- ----------------------------------------------------------------------------
alter table public.semesters
  add column if not exists farewell_message text;

alter table public.semesters
  drop constraint if exists semesters_farewell_message_check;
alter table public.semesters
  add constraint semesters_farewell_message_check
  check (
    farewell_message is null
    or char_length(btrim(farewell_message)) between 1 and 400
  );

comment on column public.semesters.farewell_message is
  'Shown full-screen to a student archived out of this semester, on every '
  'sign-in. Null = show the semester name and their recap only.';


-- ----------------------------------------------------------------------------
-- 2. Who would be archived
--
--    Instructor-only, and read BEFORE the destructive call so the confirm
--    dialog can say "47 students across 3 sections" and list them. A count the
--    instructor cannot check is a count they learn to tap past.
--
--    ⚠ The OUT columns are read through a subquery alias (`t`), not referenced
--      bare. A RETURNS TABLE column becomes a variable in plpgsql scope, so a
--      bare `full_name` in the body would shadow students.full_name and quietly
--      return the wrong thing (the 0035 lesson, which cost that file a comment
--      about `item_count` and `v_id`).
--
--    A student with a NULL section_id belongs to no semester and is therefore
--    not in anyone's close list. That is correct rather than an oversight: the
--    instructor archives them from the roster by hand, where they can see who
--    it is.
-- ----------------------------------------------------------------------------
drop function if exists public.get_semester_close_preview(uuid);
create function public.get_semester_close_preview(p_semester_id uuid)
returns table (
  student_id   uuid,
  full_name    text,
  section_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read a semester close preview.';
  end if;

  return query
  select t.sid, t.fname, t.sname
    from (
      select s.id          as sid,
             s.full_name   as fname,
             sec.name      as sname
        from public.students s
        join public.sections sec on sec.id = s.section_id
       where sec.semester_id = p_semester_id
         and s.archived_at is null
    ) t
   order by t.sname asc, t.fname asc;
end;
$$;

grant execute on function public.get_semester_close_preview(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 3. Archive everyone in a semester
--
--    The bulk shape archive_students (0035) already established, widened from
--    "these ids" to "this semester": one audit row each, ONE snapshot refresh
--    at the end. Archiving 208 students through the single-student RPC would
--    rebuild the whole leaderboard snapshot 208 times.
--
--    The audit row carries the FULL pre-archive student JSON, and that is the
--    only record of how they finished: leaderboard_snapshot holds the current
--    board and nothing else, so the moment this runs their rank is gone from it
--    (the sweep in refresh_leaderboard_snapshot removes them). Their standing
--    can still be RECOMPUTED by get_semester_leaderboard, which reads
--    point_events and deliberately includes archived students — but the row
--    itself only exists here.
--
--    Idempotent by construction: a second run finds nobody un-archived and
--    returns 0 without touching the snapshot.
-- ----------------------------------------------------------------------------
drop function if exists public.archive_semester_students(uuid);
create function public.archive_semester_students(p_semester_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_count   integer := 0;
  -- v_id, never `id`: a loop variable named `id` collides with the column
  -- inside `where students.id = …` and plpgsql resolves it to the variable.
  v_id      uuid;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can close a semester.';
  end if;

  if p_semester_id is null then
    return 0;
  end if;

  if not exists (select 1 from public.semesters where id = p_semester_id) then
    raise exception 'That semester no longer exists.';
  end if;

  for v_id in
    select s.id
      from public.students s
      join public.sections sec on sec.id = s.section_id
     where sec.semester_id = p_semester_id
       and s.archived_at is null
  loop
    -- Re-read under a lock: the list above was taken without one, and an
    -- instructor archiving a single student from another tab mid-loop must not
    -- produce a second audit row for the same archive.
    select * into v_student from public.students where students.id = v_id for update;
    if not found or v_student.archived_at is not null then
      continue;
    end if;

    update public.students set archived_at = now() where students.id = v_id;

    insert into public.audit_log
                (actor, action, table_name, row_id, student_id, summary, row_data)
         values (auth.uid(), 'semester_archive', 'students', v_id, v_id,
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

grant execute on function public.archive_semester_students(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 4. Restore an archived student INTO a section
--
--    ⚠ THIS IS THE HALF 0023 WAS MISSING, and the gap was invisible.
--      restore_student only clears archived_at, which leaves the student in the
--      section they had when they left — a section belonging to a FINISHED
--      semester. scan_attendance's active-semester guard (0035) then refuses
--      them with "That class belongs to a semester that has ended.", so a
--      restored student looked restored and could not attend a class. Nothing
--      errored at restore time; the failure surfaced later, to the student.
--
--    One transaction, so a student is never un-archived into nowhere, and ONE
--    audit row carrying both sections — the two facts a later question ("why is
--    this person in 2B?") actually needs.
--
--    The target section is NOT required to belong to the active semester. The
--    rollover wizard commits sections for a semester that is not active yet
--    (that is what makes it resumable), and the instructor places returning
--    students while building it. Requiring `is_active` here would refuse the
--    normal order of work.
-- ----------------------------------------------------------------------------
drop function if exists public.restore_student_into(uuid, uuid);
create function public.restore_student_into(
  p_student_id     uuid,
  p_target_section uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_from    uuid;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can restore students.';
  end if;

  if not exists (select 1 from public.sections where id = p_target_section) then
    raise exception 'That section no longer exists.';
  end if;

  select * into v_student from public.students where id = p_student_id for update;
  if not found then
    raise exception 'That student no longer exists.';
  end if;

  v_from := v_student.section_id;

  -- Idempotent: already active AND already in the target section is a no-op,
  -- so a double tap writes no second audit row.
  if v_student.archived_at is null and v_from is not distinct from p_target_section then
    return;
  end if;

  update public.students
     set archived_at = null,
         section_id  = p_target_section
   where id = p_student_id;

  insert into public.audit_log
              (actor, action, table_name, row_id, student_id, summary, row_data)
       values (auth.uid(), 'restore', 'students', p_student_id, p_student_id,
               v_student.full_name,
               jsonb_build_object(
                 'from_section', v_from,
                 'to_section',   p_target_section,
                 'student',      to_jsonb(v_student)
               ));

  perform public.refresh_leaderboard_snapshot();
end;
$$;

grant execute on function public.restore_student_into(uuid, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 5. Ownership move: request_point_redemption 0029 → 0060
--
--    Same signature, plain `create or replace`. The body below is 0029's
--    VERBATIM, with exactly one addition: the archived guard, placed
--    immediately after the lock so it sits with the other identity checks.
--
--    Why it matters: this was the only student-callable write with no archived
--    check. Every other one — scan_attendance, submit_offline_scan,
--    request_absence_excuse, scan_event_attendance, the Lounge author gate, the
--    peer-eval submit path — already refuses. So an archived student with
--    leftover semester_points could still file spend requests, which landed in
--    the instructor's Requests inbox looking exactly like a live student's.
--
--    The message is word-for-word the one the five existing guards use, so a
--    student who hits it twice in different places reads the same sentence.
--
--    The overspend argument from 0019/0029 carries over unchanged:
--    semester_points is greatest(0, sum), so it is always ≥ the raw sum and
--    validating against it can never authorise more than the student holds.
--    Lock order (student row first) is untouched, so this still cannot deadlock
--    against decide_point_redemption.
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

  -- 0060: the one new line. Same wording as every other archived guard.
  if v_student.archived_at is not null then
    raise exception 'This account has been archived — talk to your instructor.';
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

grant execute on function public.request_point_redemption(int, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 6. audit_log_action_check — widen to include 'semester_archive'
--
--    ⚠ Re-lists every prior value. Dropping and recreating this constraint
--      while omitting one silently NARROWS it, and the next migration that
--      writes the omitted action dies on a check violation — which is exactly
--      how 0043's first break-glass read would have failed, caught only because
--      the file had not been pasted yet.
--
--    The list below is 0059's fifteen plus the new one — AND the two values 0062
--    adds ('grade_boost', 'grade_visibility'). Those two are listed here on
--    purpose, although nothing in THIS file writes them: 0062 is the file that
--    writes them, and if 0062 is pasted BEFORE this one, a list that stopped at
--    sixteen would silently NARROW the constraint back, and every grade-boost
--    approval, reversal and "open grades" switch would then die on a check
--    violation. Listing all eighteen makes the paste order irrelevant. An
--    allowed value nobody writes yet costs nothing.
--
--    If BLOCK 2 of applied_state.sql showed a value that is not here, STOP and
--    add it. After pasting either file, BLOCK 7 must return ZERO rows.
-- ----------------------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'delete', 'archive', 'restore', 'hard_delete', 'broadcast',
    'promote', 'semester_activate',
    'space_flag', 'space_section', 'space_timeout',
    'space_break_glass', 'space_moderate',
    'peer_group', 'peer_eval',
    'edit_name',
    'semester_archive',
    'grade_boost', 'grade_visibility'
  ));


-- ============================================================================
-- Verify (run the whole file twice — it is idempotent):
--
--   -- 1. The column and its CHECK
--   select farewell_message from public.semesters limit 1;              -- null
--   update public.semesters set farewell_message = repeat('x', 401)
--    where is_active;                                                   -- ERROR
--   update public.semesters set farewell_message = 'See you around.'
--    where is_active;                                                   -- ok
--
--   -- 2. The preview reads, and a student cannot
--   select count(*) from public.get_semester_close_preview(
--     (select id from public.semesters where is_active));
--   --   as the instructor: a number
--   --   as a student:      ERROR 'Only the instructor can read a semester
--   --                      close preview.'
--
--   -- 3. Archiving is idempotent. DO THIS ON A SCRATCH SEMESTER FIRST.
--   --    Create "TEST CLOSE", give it a section, promote 2 students in, then:
--   select public.archive_semester_students('<test sem id>');   -- 2
--   select public.archive_semester_students('<test sem id>');   -- 0
--   --   and they must be GONE from the board:
--   select count(*) from public.leaderboard_snapshot ls
--     join public.students s on s.id = ls.student_id
--    where s.archived_at is not null;                           -- 0
--   --   while their points are UNTOUCHED:
--   select semester_points, lifetime_points from public.students
--    where id = '<one of them>';                                -- unchanged
--
--   -- 4. Restore puts them somewhere they can actually attend
--   select public.restore_student_into('<student id>', '<active sem section>');
--   select archived_at, section_id from public.students where id = '<student id>';
--   --   archived_at null, section_id = the section passed in
--   select public.restore_student_into('<student id>', '<same section>');
--   --   no-op, and NO second audit row:
--   select count(*) from public.audit_log
--    where student_id = '<student id>' and action = 'restore';  -- 1
--
--   -- 5. The archived guard on spending
--   --    As an ARCHIVED student:
--   select public.request_point_redemption(1, 'quiz');
--   --   ERROR 'This account has been archived — talk to your instructor.'
--   --   As a live student with points: returns a uuid, exactly as before.
--
--   -- 6. The audit constraint accepts the new action and still accepts the old
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'audit_log_action_check';
--   --   must list 16 values, 'semester_archive' among them.
--
--   Then clean up the test semester.
-- ============================================================================
