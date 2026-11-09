-- ============================================================================
-- 0062 · Student grades + spending points on a grade column ("boosts")
--
-- WHAT THIS ADDS
--   1. A student-facing read of their OWN marks:   get_my_grades()
--   2. A kill switch for it, seeded OFF:           app_flags.student_grades
--   3. Boosts — a student spends points to add marks to ONE column the
--      instructor has flagged as eligible:
--        grade_items.points_cost / points_bonus   (the instructor's terms)
--        point_redemptions.grade_item_id / grade_bonus   (the request)
--        grade_boosts                              (the receipt)
--        request_grade_boost()                     (student asks)
--        decide_point_redemption()                 (instructor approves — moved)
--        reverse_grade_boost()                     (instructor undoes one)
--   4. save_subject_policy() — saving a subject's weights atomically (section 7b).
--      Unrelated to boosts; it rides here because 0062 was unapplied when the
--      partial-save bug was found.
--
-- DECISIONS (instructor, 2026-11-09)
--   · A student can ask only AFTER their mark is entered, and not when it is
--     already full. Approving before marking would let the bonus be wiped the
--     moment the real mark was typed over it.
--   · The bonus is CAPPED at the column's max. The student pays the full cost
--     and the screen shows the real gain first.
--   · Once per column. A rejected or reversed request frees it again.
--   · Reversible: removes the bonus marks, returns the points, deletes the
--     receipt, frees the column.
--   · Student grades start HIDDEN. Nothing is exposed by pasting this file.
--
-- ⚠ THERE IS STILL NO WEIGHTING ARITHMETIC IN THIS FILE.
--   The boost raises the ordinary grade_scores.score, so grading.ts, the
--   aggregate RPC, both exports and both print routes are untouched — and 0057's
--   rule ("src/lib/grading.ts is the only definition") holds. get_my_grades
--   returns each student's own marks and the policy weights; the "so far" figure
--   a student sees is computed client-side by the same grading.ts functions the
--   instructor's sheet uses. If you are about to add a weight expression below,
--   stop.
--
-- A REFUND IS A POSITIVE `redeem` ROW — AND THAT IS WHY NOTHING ELSE MOVES
--   The spend board (0038) sums -points over category = 'redeem', so a refund
--   row nets out of "spent" with no change to refresh_leaderboard_snapshot.
--   cp_notify_point_event skips 'redeem' already, so a refund does not trigger
--   a second, generic "you earned points" push. listRecentAwards excludes
--   'redeem', so the instructor cannot delete a refund and desync it from its
--   redemption. The cost is one loosened CHECK: a redeem row is a debit,
--   EXCEPT the refund of a reversed boost (+1..+50). That exception is written
--   into point_events_points_check below and into src/lib/types.ts.
--
-- OWNERSHIP MOVES
--   decide_point_redemption  0029 → 0062. Same signature. The body is 0029's
--     with the grade-boost branch added; every difference is marked "0062".
--     The non-grade path is byte-identical in behaviour.
--   cp_nightly_backup        0057 → 0062. Body carried forward; `grade_boosts`
--     joins the array AND the 365-day `kept` list (grades write no audit rows
--     for edits, so the mirror is the only history).
--   0029 and 0057 must not be edited.
--
-- BACKUP MIRRORS ARE WIDENED HERE, NOT LEFT TO THE DRIFT HANDLER
--   This file adds columns to grade_items and point_redemptions. The nightly
--   job's drift handler would park (grade_items) or DROP (point_redemptions) the
--   old mirror. The two ALTERs below add the same columns, in the same order, to
--   the existing mirrors instead — `select current_date, s.*` is positional, and
--   both tables gain their columns at the end — so no snapshot is lost.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   1. Run supabase/queries/applied_state.sql BLOCK 2 FIRST and compare the live
--      audit_log_action_check against the list in section 8. This constraint has
--      been silently narrowed twice by a drop-and-recreate.
--   2. Must go AFTER 0057 and 0058 (it writes grade_items / grade_scores).
--   3. Student grades are OFF. Turn them on from Ops → Student grades when you
--      have checked the marks. Nothing a student can see changes until you do.
--   Safe to re-run — paste it twice to prove it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The kill switch (seeded OFF)
--
--    ON CONFLICT DO NOTHING is load-bearing: a re-paste must never flip a flag
--    the instructor has already turned on back to off.
-- ----------------------------------------------------------------------------
insert into public.app_flags (key, enabled, note)
     values ('student_grades', false,
             'Master switch for the student Grades screen. Off = students see '
             'that grades are not open yet, and boost requests are refused.')
on conflict (key) do nothing;

create or replace function public.cp_student_grades_flag()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select enabled from public.app_flags where key = 'student_grades'), false);
$$;

grant execute on function public.cp_student_grades_flag() to authenticated;

-- Audited, like set_space_flag: "when did students get to see grades" is a
-- question you will be asked, and the flag row only remembers the latest answer.
--
-- OPENING NOTIFIES, ONCE. Flipping the switch used to tell no one, so students
-- found out by chance. On the OFF → ON transition this queues one notification
-- for every active student in an active-semester section that has at least one
-- live grade column — a section with no columns has nothing to show, and a push
-- to a screen that says "nothing set up yet" is noise. The transition test is
-- load-bearing: turning it on when it is already on (a double tap, a retried
-- request) must not push the whole class a second time.
--
-- Same shape as send_broadcast (0034): one bulk INSERT rather than N
-- cp_queue_notification calls, the audit row written BEFORE dispatch so the
-- record survives a push failure, and dispatch chunked at 50 because
-- cp_push_dispatch puts every id in a single HTTP body.
--
-- Returns jsonb { enabled, notified } so the screen can report what actually
-- happened rather than what it predicted.
drop function if exists public.set_student_grades_enabled(boolean);
create function public.set_student_grades_enabled(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was   boolean;
  v_ids   uuid[];
  v_chunk uuid[];
  v_total integer := 0;
  i       integer;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can change that.';
  end if;

  -- Read BEFORE the write: this is what makes "already on" detectable.
  v_was := public.cp_student_grades_flag();

  insert into public.app_flags (key, enabled, updated_at, updated_by)
       values ('student_grades', p_enabled, now(), auth.uid())
  on conflict (key) do update
     set enabled    = excluded.enabled,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by;

  if p_enabled and not v_was then
    with targets as (
      select s.id
        from public.students s
        join public.sections sec on sec.id = s.section_id
       where s.archived_at is null
         and sec.semester_id = public.cp_active_semester_id()
         and exists (
           select 1 from public.grade_items gi
            where gi.section_id = s.section_id and gi.archived_at is null
         )
    ), inserted as (
      insert into public.notifications (student_id, type, title, body, url)
      select t.id, 'grades_open', 'Your grades are open',
             'See your marks and where you stand so far.', '/app/grades'
        from targets t
      returning id
    )
    select array_agg(id) into v_ids from inserted;

    v_total := coalesce(array_length(v_ids, 1), 0);
  end if;

  -- Audit BEFORE dispatch, as send_broadcast does.
  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
       values (auth.uid(), 'grade_visibility', 'app_flags', null,
               case when p_enabled
                    then format('Student grades OPENED (%s notified)', v_total)
                    else 'Student grades HIDDEN' end,
               jsonb_build_object('key', 'student_grades', 'enabled', p_enabled,
                                  'was', v_was, 'notified', v_total));

  i := 1;
  while i <= v_total loop
    v_chunk := v_ids[i : i + 49];
    perform public.cp_push_dispatch(v_chunk);
    i := i + 50;
  end loop;

  return jsonb_build_object('enabled', p_enabled, 'notified', v_total);
end;
$$;

grant execute on function public.set_student_grades_enabled(boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Eligibility — the instructor's terms, on the column
--
--    Both or neither: a column is either offered for a trade or it is not, never
--    half-configured. points_cost is capped at 50 because request_point_redemption
--    already refuses more than 50 and a pricier column could be shown but never
--    requested.
-- ----------------------------------------------------------------------------
alter table public.grade_items
  add column if not exists points_cost  integer,
  add column if not exists points_bonus numeric(6,2);

alter table public.grade_items drop constraint if exists grade_items_boost_pair_check;
alter table public.grade_items add constraint grade_items_boost_pair_check
  check ((points_cost is null) = (points_bonus is null));

alter table public.grade_items drop constraint if exists grade_items_boost_range_check;
alter table public.grade_items add constraint grade_items_boost_range_check
  check (
    (points_cost  is null or points_cost  between 1 and 50)
    and (points_bonus is null or points_bonus > 0)
  );

-- Keep the 365-day mirror in step. Same columns, same order as public (see the
-- header). A no-op until the first nightly run has created the mirror.
alter table if exists backup.grade_items
  add column if not exists points_cost  integer,
  add column if not exists points_bonus numeric(6,2);

-- ----------------------------------------------------------------------------
-- 3. The request — a redemption that points at a column
--
--    grade_bonus is a SNAPSHOT of the bonus at request time. The student
--    confirmed "5 points for +10 marks"; if the instructor later edits the
--    column to +2, approval must still honour what was agreed. points is
--    already a snapshot of the cost.
--
--    'reversed' is a new status. 'cancelled' means a student withdrew a PENDING
--    request, and calling an approved, spent boost "Cancelled" would mislead.
-- ----------------------------------------------------------------------------
alter table public.point_redemptions
  add column if not exists grade_item_id uuid references public.grade_items(id) on delete set null,
  add column if not exists grade_bonus   numeric(6,2);

alter table if exists backup.point_redemptions
  add column if not exists grade_item_id uuid,
  add column if not exists grade_bonus   numeric(6,2);

-- Widen the status CHECK. Found by definition, not by name: it was declared
-- inline in 0019, and if its auto-generated name ever differed the plain DROP
-- below would miss it and the OLD narrower rule would keep rejecting 'reversed'
-- — silently, until the first reversal.
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.point_redemptions'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%status%'
       and pg_get_constraintdef(oid) like '%cancelled%'
  loop
    execute format('alter table public.point_redemptions drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.point_redemptions drop constraint if exists point_redemptions_status_check;
alter table public.point_redemptions add constraint point_redemptions_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled', 'reversed'));

-- ONCE PER COLUMN. Partial, so a rejected / cancelled / reversed request frees
-- the column again while a pending or approved one holds it.
create unique index if not exists point_redemptions_one_boost_idx
  on public.point_redemptions (student_id, grade_item_id)
  where grade_item_id is not null and status in ('pending', 'approved');

-- A redemption is a debit — EXCEPT the refund of a reversed boost.
--
-- Same constraint name as 0019 (the 0007/0011 precedent). The redeem branch
-- now allows +1..+50 as well; 50 is the most a request can ever have cost.
-- The non-redeem branch is 0019's, unchanged.
alter table public.point_events drop constraint if exists point_events_points_check;
alter table public.point_events add constraint point_events_points_check
  check (
    (category = 'redeem' and points between -500 and 50 and points <> 0)
    or (category <> 'redeem' and points between -100 and 100 and points <> 0)
  );

-- ----------------------------------------------------------------------------
-- 4. The receipt
--
--    The boost raises the ordinary grade_scores.score, so nothing downstream
--    needs to know it happened. This row is what draws the indicator and what
--    lets the instructor see — and undo — the original mark.
--
--    score_after is stored so a reversal can tell whether the mark is STILL the
--    one the boost wrote. If the instructor has retyped the cell since, the
--    reversal returns the points but leaves their edit alone.
--
--    Instructor-select only, like every other grades table. A student reads
--    their own receipt through get_my_grades(), never directly.
-- ----------------------------------------------------------------------------
create table if not exists public.grade_boosts (
  item_id       uuid not null references public.grade_items(id)        on delete cascade,
  student_id    uuid not null references public.students(id)           on delete cascade,
  redemption_id uuid not null references public.point_redemptions(id)  on delete cascade,
  score_before  numeric(6,2) not null check (score_before >= 0),
  score_after   numeric(6,2) not null check (score_after  >= 0),
  -- The REAL gain after the cap, which can be less than the column's bonus.
  marks_granted numeric(6,2) not null check (marks_granted > 0),
  points_spent  integer      not null check (points_spent between 1 and 50),
  applied_at    timestamptz  not null default now(),
  primary key (item_id, student_id)
);

create unique index if not exists grade_boosts_redemption_idx
  on public.grade_boosts (redemption_id);
create index if not exists grade_boosts_student_idx
  on public.grade_boosts (student_id);

alter table public.grade_boosts enable row level security;

drop policy if exists grade_boosts_select on public.grade_boosts;
create policy grade_boosts_select on public.grade_boosts
  for select to authenticated using (public.is_instructor());

-- Select only. Every write goes through the definer functions below.
grant select on public.grade_boosts to authenticated;

-- ----------------------------------------------------------------------------
-- 5. A student asks
--
--    The student comes from auth.uid() and cannot be passed in (the
--    submit_peer_evaluation lesson). Lock order is student row first, exactly as
--    request_point_redemption and decide_point_redemption, so none of the three
--    can deadlock against another.
-- ----------------------------------------------------------------------------
drop function if exists public.request_grade_boost(uuid);
create function public.request_grade_boost(p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student        public.students%rowtype;
  v_item           public.grade_items%rowtype;
  v_score          numeric;
  v_pending_count  int;
  v_pending_points int;
  v_available      int;
  v_kind           text;
  v_id             uuid;
begin
  -- Lock first, validate second: everything below reads a balance.
  select * into v_student from public.students where user_id = auth.uid() for update;
  if not found then
    raise exception 'Only students can request to use points.';
  end if;

  if v_student.archived_at is not null then
    raise exception 'This account has been archived — talk to your instructor.';
  end if;

  if not public.cp_student_grades_flag() then
    raise exception 'Grades are not open yet.';
  end if;

  select * into v_item from public.grade_items where id = p_item_id;
  if not found or v_item.archived_at is not null then
    raise exception 'That column is no longer available.';
  end if;
  if v_item.points_cost is null then
    raise exception 'Points can’t be used on that column.';
  end if;
  if v_item.section_id is distinct from v_student.section_id then
    raise exception 'That column belongs to another class.';
  end if;
  if not exists (
    select 1 from public.sections sec
     where sec.id = v_item.section_id
       and sec.semester_id = public.cp_active_semester_id()
  ) then
    raise exception 'That column belongs to a semester that has ended.';
  end if;

  -- Only once the mark is in, and only while there is room to gain.
  select gs.score into v_score
    from public.grade_scores gs
   where gs.item_id = v_item.id and gs.student_id = v_student.id;
  if not found then
    raise exception 'Your mark for % isn’t in yet — you can use points on it once it is.',
      v_item.name;
  end if;
  if v_score >= v_item.max_score then
    raise exception 'You already have full marks on %.', v_item.name;
  end if;

  -- Once per column.
  if exists (
    select 1 from public.point_redemptions r
     where r.student_id = v_student.id and r.grade_item_id = v_item.id and r.status = 'pending'
  ) then
    raise exception 'You already have a request waiting for %.', v_item.name;
  end if;
  if exists (
    select 1 from public.point_redemptions r
     where r.student_id = v_student.id and r.grade_item_id = v_item.id and r.status = 'approved'
  ) then
    raise exception 'You’ve already used points on % — a column can only be boosted once.',
      v_item.name;
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
  if v_item.points_cost > v_available then
    raise exception 'Not enough points — you have % available after your pending requests.',
      greatest(v_available, 0);
  end if;

  -- The existing kinds already cover every component; no CHECK needs widening.
  v_kind := case v_item.component
              when 'quiz' then 'quiz'
              when 'exam' then 'exam'
              else 'activity'
            end;

  insert into public.point_redemptions
              (student_id, points, kind, note, grade_item_id, grade_bonus)
       values (v_student.id, v_item.points_cost, v_kind,
               left('Boost · ' || v_item.name, 120),
               v_item.id, v_item.points_bonus)
    returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.request_grade_boost(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. The instructor decides — decide_point_redemption, 0029 → 0062
--
--    0029's body with ONE addition: a branch for a request that points at a
--    grade column. Every changed line is marked "0062". The non-grade path
--    (v_req.grade_item_id is null) does exactly what it did before, including
--    the ledger note and the notification URL.
--
--    The deduction is unchanged — a negative 'redeem' point_events row — so the
--    level drop, the rank drop and the spend board all work as they already do.
--
--    The grade_scores write runs under the INSTRUCTOR's JWT, so is_instructor()
--    is true and 0057's RLS is satisfied. This is not the 0056 situation (a
--    student-initiated write tripping cp_guard_student_update), and needs no GUC.
-- ----------------------------------------------------------------------------
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
  -- 0062: the grade-boost branch
  v_item    public.grade_items%rowtype;
  v_score   numeric;
  v_new     numeric;
  v_gain    numeric;
  v_ledger  text;
  v_url     text := '/app/points';
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

  -- 0062: a request that points at a column sends the student to Grades.
  if v_req.grade_item_id is not null then
    v_url := '/app/grades';
  end if;

  if p_approve then
    -- Re-validate: their balance may have dropped since they asked.
    if v_req.points > v_student.semester_points then
      raise exception 'They only have % points now — not enough for this request.',
        v_student.semester_points;
    end if;

    if v_req.grade_item_id is not null then
      -- 0062: everything about the column is re-checked NOW, not trusted from
      -- the moment of the request — marks and columns change in between.
      select * into v_item from public.grade_items where id = v_req.grade_item_id;
      if not found then
        raise exception 'That column no longer exists. Decline this request.';
      end if;
      if v_item.archived_at is not null then
        raise exception '% has been retired. Decline this request.', v_item.name;
      end if;
      if v_student.section_id is distinct from v_item.section_id then
        raise exception 'They have moved class since asking. Decline this request.';
      end if;
      if v_req.grade_bonus is null then
        raise exception 'This request has no bonus recorded. Decline it.';
      end if;

      select gs.score into v_score
        from public.grade_scores gs
       where gs.item_id = v_item.id and gs.student_id = v_req.student_id
         for update;
      if not found then
        raise exception 'Their mark for % was cleared. Enter it again, or decline this request.',
          v_item.name;
      end if;

      -- The bonus the student AGREED TO, capped at the column's maximum.
      v_new  := least(v_item.max_score, v_score + v_req.grade_bonus);
      v_gain := v_new - v_score;
      if v_gain <= 0 then
        raise exception 'They already have full marks on %. Decline this request.', v_item.name;
      end if;

      v_ledger := 'Used · Grade boost · ' || v_item.name
                  || ' (+' || trim_scale(v_gain)::text || ' marks)';
    else
      v_ledger := 'Used · ' || v_label || coalesce(' · ' || v_req.note, '');
    end if;

    insert into public.point_events (student_id, points, category, note)
         values (v_req.student_id, -v_req.points, 'redeem', v_ledger)
      returning id into v_event;

    if v_req.grade_item_id is not null then
      -- 0062: write the mark, keep the receipt, leave one audit row.
      update public.grade_scores
         set score = v_new
       where item_id = v_item.id and student_id = v_req.student_id;

      insert into public.grade_boosts
                  (item_id, student_id, redemption_id,
                   score_before, score_after, marks_granted, points_spent)
           values (v_item.id, v_req.student_id, v_req.id,
                   v_score, v_new, v_gain, v_req.points);

      insert into public.audit_log
                  (actor, action, table_name, row_id, student_id, summary, row_data)
           values (auth.uid(), 'grade_boost', 'grade_scores', v_item.id, v_req.student_id,
                   v_student.full_name || ' · ' || v_item.name || ' · +' || trim_scale(v_gain)::text,
                   jsonb_build_object(
                     'event',         'apply',
                     'item_id',       v_item.id,
                     'redemption_id', v_req.id,
                     'score_before',  v_score,
                     'score_after',   v_new,
                     'marks_granted', v_gain,
                     'points_spent',  v_req.points
                   ));
    end if;
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
    if v_req.grade_item_id is not null then
      v_title := 'Boost approved — ' || v_item.name;
      v_body  := coalesce(
                   v_note,
                   'Your mark went from ' || trim_scale(v_score)::text || ' to '
                     || trim_scale(v_new)::text || '. ' || v_req.points || ' points used.');
    else
      v_title := 'Request approved — ' || v_req.points || ' points used';
      v_body  := coalesce(v_note, 'Applied to your ' || lower(v_label) || '. Worth it.');
    end if;
  else
    v_title := 'Request declined';
    v_body  := coalesce(v_note, 'Your ' || v_req.points || ' points are still yours.');
  end if;

  perform public.cp_push_dispatch(array[
    public.cp_queue_notification(v_req.student_id, 'redemption', v_title, v_body, v_url)
  ]);
end;
$$;

grant execute on function public.decide_point_redemption(uuid, boolean, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. The instructor undoes one
--
--    Returns the points, removes the receipt, frees the column — and puts the
--    mark back ONLY if it is still exactly what the boost wrote. A mark the
--    instructor has retyped since is left alone: the points still return, and
--    the result says so, because guessing which of two numbers they meant would
--    be inventing a grade.
--
--    Refused when the original charge belongs to a PAST semester: the refund row
--    would be stamped into the active one and hand last semester's spend to this
--    semester's pool.
--
--    Lock order is decide_point_redemption's: redemption, then student.
-- ----------------------------------------------------------------------------
drop function if exists public.reverse_grade_boost(uuid, uuid);
create function public.reverse_grade_boost(p_item_id uuid, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_boost    public.grade_boosts%rowtype;
  v_req      public.point_redemptions%rowtype;
  v_student  public.students%rowtype;
  v_item     public.grade_items%rowtype;
  v_debit    public.point_events%rowtype;
  v_score    numeric;
  v_restored boolean := false;
  v_event    uuid;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can reverse a boost.';
  end if;

  select * into v_boost
    from public.grade_boosts
   where item_id = p_item_id and student_id = p_student_id;
  if not found then
    raise exception 'There is no boost on that mark — it may already have been reversed.';
  end if;

  select * into v_req from public.point_redemptions where id = v_boost.redemption_id for update;
  select * into v_student from public.students where id = p_student_id for update;
  if not found then
    raise exception 'That student no longer exists.';
  end if;

  -- Re-read under the locks: a second tap lands here and finds nothing.
  select * into v_boost
    from public.grade_boosts
   where item_id = p_item_id and student_id = p_student_id
     for update;
  if not found then
    raise exception 'There is no boost on that mark — it may already have been reversed.';
  end if;

  if v_req.point_event_id is null then
    raise exception 'The original charge is no longer in the ledger, so the points cannot be returned automatically.';
  end if;
  select * into v_debit from public.point_events where id = v_req.point_event_id;
  if not found then
    raise exception 'The original charge is no longer in the ledger, so the points cannot be returned automatically.';
  end if;
  if v_debit.semester_id is distinct from public.cp_active_semester_id() then
    raise exception 'That boost was paid for in a past semester, so its points can’t be returned to this one.';
  end if;

  select * into v_item from public.grade_items where id = p_item_id;

  insert into public.point_events (student_id, points, category, note)
       values (p_student_id, v_boost.points_spent, 'redeem',
               'Refund · Grade boost reversed · ' || coalesce(v_item.name, 'a column'))
    returning id into v_event;

  select gs.score into v_score
    from public.grade_scores gs
   where gs.item_id = p_item_id and gs.student_id = p_student_id
     for update;
  if found and v_score = v_boost.score_after then
    update public.grade_scores
       set score = v_boost.score_before
     where item_id = p_item_id and student_id = p_student_id;
    v_restored := true;
  end if;

  delete from public.grade_boosts
   where item_id = p_item_id and student_id = p_student_id;

  update public.point_redemptions
     set status = 'reversed'
   where id = v_req.id;

  insert into public.audit_log
              (actor, action, table_name, row_id, student_id, summary, row_data)
       values (auth.uid(), 'grade_boost', 'grade_scores', p_item_id, p_student_id,
               v_student.full_name || ' · ' || coalesce(v_item.name, 'a column') || ' · reversed',
               jsonb_build_object(
                 'event',           'reverse',
                 'item_id',         p_item_id,
                 'redemption_id',   v_req.id,
                 'score_before',    v_boost.score_before,
                 'score_after',     v_boost.score_after,
                 'marks_granted',   v_boost.marks_granted,
                 'points_refunded', v_boost.points_spent,
                 'mark_restored',   v_restored,
                 'score_now',       case when v_restored then v_boost.score_before else v_score end
               ));

  perform public.cp_push_dispatch(array[
    public.cp_queue_notification(
      p_student_id, 'redemption',
      'Boost reversed — ' || coalesce(v_item.name, 'a column'),
      v_boost.points_spent || ' points are back in your balance.',
      '/app/grades')
  ]);

  return jsonb_build_object(
    'mark_restored',   v_restored,
    'points_refunded', v_boost.points_spent,
    'score_now',       case when v_restored then v_boost.score_before else v_score end
  );
end;
$$;

grant execute on function public.reverse_grade_boost(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7b. Saving a subject's weights — atomically
--
--     Not about boosts: it rides in this file because 0062 was unapplied when the
--     problem was found, so it costs one fewer paste than a file of its own.
--
--     THE BUG. The weights screen saved three rows in a client-side loop with no
--     transaction. A failure after the first or second left the three terms'
--     final_weight NOT adding up to 1 — and grading.ts reports that state as
--     EVERY grade for the subject disappearing (finalGrade is null rather than
--     guessing). One dropped connection at the wrong moment, and nothing showed
--     a number until someone noticed and re-saved.
--
--     THE FIX is one function: all the rows or none of them. It also REFUSES a
--     set whose final_weights do not sum to exactly 1, which is the cross-row
--     rule 0057 could not make a CHECK (a deferred trigger would reject the
--     FIRST row of any row-by-row seed). Here it can live, because this is the
--     one place the three rows are written together.
--
--     ⚠ That is a guard on WRITES, not a weighting expression: nothing here
--       computes a grade, and grading.ts is still the only definition of how a
--       grade is made. The sum is exact — the columns are numeric(5,4), so
--       0.3 + 0.3 + 0.4 is 1 with no float tolerance to disagree with
--       grading.ts's `sumsToOne`. The client keeps its own check so the Save
--       button can explain itself before anything is sent.
--
--     The per-row CHECKs (the Class Standing split, the term split) still fire
--     inside this transaction, so a bad row rolls the whole save back.
-- ----------------------------------------------------------------------------
drop function if exists public.save_subject_policy(uuid, jsonb);
create function public.save_subject_policy(p_subject_id uuid, p_policies jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   jsonb;
  v_total numeric;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can change grade weights.';
  end if;

  if p_policies is null
     or jsonb_typeof(p_policies) <> 'array'
     or jsonb_array_length(p_policies) = 0 then
    raise exception 'There are no weights to save.';
  end if;

  for v_row in select e.value from jsonb_array_elements(p_policies) as e(value)
  loop
    update public.grade_policies
       set pt_weight      = (v_row ->> 'pt_weight')::numeric,
           quiz_weight    = (v_row ->> 'quiz_weight')::numeric,
           recit_weight   = (v_row ->> 'recit_weight')::numeric,
           cs_weight      = (v_row ->> 'cs_weight')::numeric,
           exam_weight    = (v_row ->> 'exam_weight')::numeric,
           final_weight   = (v_row ->> 'final_weight')::numeric,
           transmute_base = (v_row ->> 'transmute_base')::numeric,
           transmute_span = (v_row ->> 'transmute_span')::numeric,
           updated_at     = now()
     where subject_id = p_subject_id
       and term = v_row ->> 'term';

    if not found then
      raise exception 'This subject has no weights row for %.',
        coalesce(v_row ->> 'term', '(a missing term)');
    end if;
  end loop;

  -- Read AFTER the writes: this is what the subject will actually hold.
  select sum(final_weight) into v_total
    from public.grade_policies
   where subject_id = p_subject_id;

  if v_total is distinct from 1 then
    raise exception 'Prelim, Midterm and Finals must add up to 100%%. Nothing was saved.';
  end if;
end;
$$;

grant execute on function public.save_subject_policy(uuid, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. audit_log_action_check — widen with 'grade_boost' and 'grade_visibility'
--
--    0060 ALSO lists all eighteen of these (see its §6), so 0060 and 0062 can be
--    pasted in EITHER order. Before that was true, 0060 pasted after 0062 would
--    have silently dropped the two values below. After pasting either file,
--    applied_state.sql BLOCK 7 must return ZERO rows.
--
--    ⚠ Re-lists every prior value (0060's sixteen). Dropping and recreating this
--      constraint while omitting one silently NARROWS it, and the next migration
--      that writes the omitted action dies on a check violation. If BLOCK 2 of
--      applied_state.sql showed a value that is not here, STOP and add it.
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

-- ----------------------------------------------------------------------------
-- 9. A student's own grades — the only door
--
--    0057 said it plainly: "If a student view is ever built it gets its own
--    aggregating RPC." This is it. It returns the calling student's own marks
--    and nobody else's, and NEVER an official figure — only the raw marks and the
--    weights, from which the client derives the "so far" number with grading.ts.
--
--    Hidden (flag off) and archived both return { enabled: false } rather than
--    raising, so the screen can say "not open yet" instead of showing an error.
--
--    Only subjects with at least one live column in the student's CURRENT
--    section appear. A boosted column carries its receipt; a column with a
--    request waiting carries pending = true.
--
--    jsonb numbers are real JSON numbers — the PostgREST numeric-as-string trap
--    (peer 0051) applies to numeric COLUMNS, not to values built into jsonb.
-- ----------------------------------------------------------------------------
drop function if exists public.get_my_grades();
create function public.get_my_grades()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
begin
  select * into v_student from public.students where user_id = auth.uid();
  if not found then
    raise exception 'Only students can see grades.';
  end if;

  if v_student.archived_at is not null or not public.cp_student_grades_flag() then
    return jsonb_build_object('enabled', false, 'subjects', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'enabled', true,
    'subjects', coalesce((
      select jsonb_agg(q.sj order by q.sj ->> 'code')
        from (
          select jsonb_build_object(
                   'subjectId', sub.id,
                   'code',      sub.code,
                   'name',      sub.name,
                   'policies', (
                     select coalesce(jsonb_agg(jsonb_build_object(
                              'term',          gp.term,
                              'ptWeight',      gp.pt_weight,
                              'quizWeight',    gp.quiz_weight,
                              'recitWeight',   gp.recit_weight,
                              'csWeight',      gp.cs_weight,
                              'examWeight',    gp.exam_weight,
                              'finalWeight',   gp.final_weight,
                              'transmuteBase', gp.transmute_base,
                              'transmuteSpan', gp.transmute_span
                            ) order by gp.term), '[]'::jsonb)
                       from public.grade_policies gp
                      where gp.subject_id = sub.id
                   ),
                   'items', (
                     select coalesce(jsonb_agg(jsonb_build_object(
                              'id',         gi.id,
                              'term',       gi.term,
                              'component',  gi.component,
                              'name',       gi.name,
                              'maxScore',   gi.max_score,
                              'position',   gi.position,
                              'score',      gs.score,
                              'pointsCost', gi.points_cost,
                              'pointsBonus', gi.points_bonus,
                              'boost', case
                                         when gb.item_id is null then null
                                         else jsonb_build_object(
                                                'marks',  gb.marks_granted,
                                                'points', gb.points_spent,
                                                'before', gb.score_before)
                                       end,
                              'pending', exists (
                                select 1 from public.point_redemptions r
                                 where r.student_id = v_student.id
                                   and r.grade_item_id = gi.id
                                   and r.status = 'pending')
                            ) order by gi.term, gi.component, gi.position, gi.created_at),
                            '[]'::jsonb)
                       from public.grade_items gi
                       left join public.grade_scores gs
                              on gs.item_id = gi.id and gs.student_id = v_student.id
                       left join public.grade_boosts gb
                              on gb.item_id = gi.id and gb.student_id = v_student.id
                      where gi.section_id  = v_student.section_id
                        and gi.subject_id  = sub.id
                        and gi.archived_at is null
                   )
                 ) as sj
            from public.subjects sub
           where exists (
             select 1 from public.grade_items g2
              where g2.section_id = v_student.section_id
                and g2.subject_id = sub.id
                and g2.archived_at is null
           )
        ) q
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_my_grades() to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Ownership move: cp_nightly_backup 0057 → 0062
--
--     Body carried forward verbatim. ONE change: `grade_boosts` joins the array
--     and the 365-day `kept` list — a boost is the only record of what a mark
--     was before points changed it.
-- ----------------------------------------------------------------------------
create or replace function public.cp_nightly_backup()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t      text;
  tables constant text[] := array[
    'students', 'point_events', 'attendance_records', 'class_sessions',
    'sections', 'point_redemptions', 'student_achievements', 'student_secrets',
    'semesters', 'semester_terms', 'subjects', 'section_subjects',
    'reward_catalog_items',
    'peer_groups', 'peer_group_members',
    'peer_evaluations', 'peer_evaluation_sections', 'peer_criteria',
    'peer_submissions', 'peer_ratings', 'peer_comments',
    'peer_evaluation_groups',
    'event_sessions', 'event_attendance',
    'grade_policies', 'grade_items', 'grade_scores', 'grade_boosts'
  ];
  -- The tables whose history is the ONLY history (see 0057 (b) and (c)).
  kept   constant text[] := array['grade_policies', 'grade_items', 'grade_scores', 'grade_boosts'];
begin
  foreach t in array tables loop
    begin
      -- Idempotent per day: re-running replaces today's snapshot.
      execute format('delete from backup.%I where snapshot_date = current_date', t);
      execute format('insert into backup.%I select current_date, s.* from public.%I s', t, t);
    exception when others then
      -- Schema drift (or a brand-new table): rebuild the mirror and retry once.
      if t = any (kept) then
        -- Park the old mirror under a dated name rather than destroying it.
        -- Recoverable by hand; costs disk, which is the cheap half of the trade.
        execute format(
          'alter table if exists backup.%I rename to %I',
          t, t || '_pre_' || to_char(current_date, 'YYYYMMDD'));
      else
        -- Old snapshots for this one table are sacrificed for a working backup
        -- going forward — the other tables' history is untouched.
        execute format('drop table if exists backup.%I', t);
      end if;
      execute format('create table backup.%I (snapshot_date date not null, like public.%I)', t, t);
      execute format('create index on backup.%I (snapshot_date)', t);
      execute format('insert into backup.%I select current_date, s.* from public.%I s', t, t);
    end;
  end loop;

  -- Retention: 14 daily snapshots, a full year for grades and the audit trail.
  foreach t in array tables loop
    if t = any (kept) then
      execute format('delete from backup.%I where snapshot_date < current_date - 365', t);
    else
      execute format('delete from backup.%I where snapshot_date < current_date - 14', t);
    end if;
  end loop;
  delete from public.audit_log where at < now() - interval '365 days';
end;
$$;

revoke execute on function public.cp_nightly_backup() from public, anon, authenticated;

-- ============================================================================
-- Verify (run the whole file twice — every statement is idempotent):
--
--   1. The flag exists and is OFF on a fresh install (and a re-paste did NOT
--      flip a flag you had turned on):
--        select key, enabled from public.app_flags where key = 'student_grades';
--
--   2. THE ONE THAT MATTERS — a student sees nothing while it is off:
--        -- signed in as a student:
--        select public.get_my_grades();      -- {"enabled": false, "subjects": []}
--        select public.request_grade_boost('<any item>');
--        -- ERROR:  Grades are not open yet.
--
--   3. Turn it on, then as a student:
--        select public.set_student_grades_enabled(true);        -- instructor
--        -- {"enabled": true, "notified": N}   N = active students whose section
--        -- has at least one live grade column. Run it AGAIN: notified must be 0
--        -- (it is already on, so nobody is pushed twice).
--        select public.get_my_grades();   -- your OWN marks only, no one else's
--        select title, url from public.notifications
--         where type = 'grades_open' order by created_at desc limit 3;
--
--   4. Eligibility is both-or-neither:
--        update public.grade_items set points_cost = 5 where id = '<item>';
--        -- ERROR: grade_items_boost_pair_check
--        update public.grade_items set points_cost = 5, points_bonus = 10 where id = '<item>';
--
--   5. A request needs a mark, and room to gain:
--        -- as a student with NO mark on the item:
--        select public.request_grade_boost('<item>');
--        -- ERROR:  Your mark for … isn't in yet — …
--        -- as a student with full marks:
--        -- ERROR:  You already have full marks on …
--
--   6. Once per column:
--        select public.request_grade_boost('<item>');   -- ok
--        select public.request_grade_boost('<item>');   -- ERROR: already have a request waiting
--
--   7. Approve (instructor). The mark rises, capped at max; the receipt exists;
--      semester_points dropped by the cost; ONE audit row:
--        select public.decide_point_redemption('<request>', true, null);
--        select score from public.grade_scores where item_id='<item>' and student_id='<s>';
--        select * from public.grade_boosts where item_id = '<item>';
--        select semester_points from public.students where id = '<s>';
--
--   8. A student cannot read the receipt table directly:
--        -- as a student:
--        select * from public.grade_boosts;                       -- 0 rows
--
--   9. Reverse (instructor). The mark returns to score_before, the points come
--      back, the receipt is gone, the column can be requested again:
--        select public.reverse_grade_boost('<item>', '<student>');
--        -- {"mark_restored": true, "points_refunded": 5, "score_now": 12}
--        select -sum(points) as spent from public.point_events
--         where student_id = '<s>' and category = 'redeem'
--           and semester_id = public.cp_active_semester_id();       -- nets to 0
--        select public.reverse_grade_boost('<item>', '<student>');
--        -- ERROR:  There is no boost on that mark — it may already have been reversed.
--
--  10. A retyped mark is left alone on reversal:
--        -- approve a boost, then change the cell by hand, then reverse:
--        -- {"mark_restored": false, ...} and the typed mark is untouched.
--
--  11. The status and points CHECKs accept what they now must:
--        select pg_get_constraintdef(oid) from pg_constraint
--         where conname in ('point_redemptions_status_check', 'point_events_points_check');
--
--  12. The audit constraint still holds every earlier value:
--        select pg_get_constraintdef(oid) from pg_constraint
--         where conname = 'audit_log_action_check';        -- 18 values
--
--  13. The backup covers the new table, and the mirrors were widened, not parked:
--        select pg_get_functiondef('public.cp_nightly_backup'::regproc)
--          like '%grade_boosts%';                            -- t
--        select public.cp_nightly_backup();
--        select table_name from information_schema.tables
--         where table_schema = 'backup' and table_name like 'grade_items%';
--        -- grade_items only — NO grade_items_pre_YYYYMMDD
--
--  14. Exactly ONE of each function (no accidental overload):
--        select proname, count(*) from pg_proc
--         where proname in ('request_grade_boost','reverse_grade_boost',
--                           'get_my_grades','set_student_grades_enabled',
--                           'cp_student_grades_flag','decide_point_redemption',
--                           'save_subject_policy')
--         group by proname;                                  -- all 1
--
--  15. A weights save is all-or-nothing, and cannot leave the three shares off 100%:
--        -- as the instructor, with the three term rows summing to 1:
--        select public.save_subject_policy('<subject>', '[
--          {"term":"prelim","pt_weight":0.5,"quiz_weight":0.25,"recit_weight":0.25,
--           "cs_weight":0.6,"exam_weight":0.4,"final_weight":0.5,
--           "transmute_base":0.6,"transmute_span":0.4}]'::jsonb);
--        -- ERROR:  Prelim, Midterm and Finals must add up to 100%. Nothing was saved.
--        select term, final_weight from public.grade_policies
--         where subject_id = '<subject>';              -- unchanged: the whole call rolled back
-- ============================================================================
