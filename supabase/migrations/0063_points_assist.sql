-- ============================================================================
-- 0063 · Points assist — automatic by part, an Absent mark, and Recitation from
--        attendance
--
-- WHAT THIS CHANGES (instructor, 2026-11-09)
--   1. "Boost" becomes "points assist" everywhere a person reads it: the push
--      titles, the ledger lines, the request note and the error messages. The
--      identifiers (request_grade_boost, grade_boosts, the 'grade_boost' audit
--      action) keep their names on purpose — renaming a function or a constraint
--      value breaks every client already holding the old name, for no reader's gain.
--   2. AUTOMATIC BY PART. The instructor sets a cost and a number of marks once per
--      part (Performance Tasks / Quizzes / Exam) for a subject, and every column of
--      that part is open to a student the moment THEIR mark is in. A column can still
--      follow the part's terms, carry its own, or be switched off.
--        grade_assist_defaults        the per-part terms
--        grade_items.points_cost/_bonus   (0062) now mean "this column's OWN terms"
--        grade_items.assist_off           this column is not offered at all
--        cp_assist_terms(item)            the ONE answer to "what are the terms"
--   3. AN ABSENT MARK. A cell can read A: typed by hand (grade_absences), or derived
--      from attendance when the column is tied to a class date (grade_items.session_id)
--      — a student recorded absent OR excused in that class is absent on that column.
--      Absent blocks a points assist whether or not a mark was also typed, so a typed 0
--      for an absentee can not be assisted. cp_grade_absent(item, student) is the ONE
--      definition, used by the request, the approval and the student's screen.
--   4. RECITATION IS ATTENDANCE. The Recitation part is the term's attendance rate, as
--      is (97% = 97, no 60 floor), subject-scoped and counted in Manila time exactly as
--      get_term_attendance (0034) does. Recitation columns are retired from the grade
--      (the rows stay in grade_items, hidden). cp_term_attendance(section, subject,
--      term) returns only COUNTS — showed / counted — and grading.ts turns them into
--      the figure. The rate rule is the one students already see (lib/attendance.ts):
--      late counts as present; excused and irregular leave the denominator.
--
-- ⚠ STILL NO WEIGHTING ARITHMETIC IN SQL.
--   An Absent mark is arithmetically a BLANK (out of "so far", a zero in the official
--   grade), so nothing in grading.ts's sums changes for it. Recitation arrives as two
--   counts in the same recit_* slots get_section_grade_sums always had; the rate itself
--   is computed by grading.ts, the only definition.
--
-- OWNERSHIP MOVES (bodies EXTRACTED from their owners and patched, then diffed — every
-- difference is wording, the new terms/absent checks, or the recitation source)
--   request_grade_boost       0062 → 0063   terms via cp_assist_terms; absent refused
--   decide_point_redemption   0062 → 0063   wording; absent re-checked at approval
--   reverse_grade_boost       0062 → 0063   wording only
--   get_my_grades             0062 → 0063   effective terms, `absent`, attendance counts;
--                                           recitation columns left out
--   get_section_grade_sums    0057 → 0063   recitation slots now hold attendance counts
--   cp_nightly_backup         0062 → 0063   + grade_assist_defaults, grade_absences
--   0057 and 0062 must not be edited.
--
-- audit_log_action_check is NOT touched: nothing here writes a new audit action.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   Must go AFTER 0062 (and so after 0057/0058). Safe to re-run — paste it twice.
--   Until it is applied the client degrades: the Absent mark and the per-part terms
--   are missing and Recitation reads as it did before; nothing breaks.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The per-part terms
--
--    Per SUBJECT and per part, not per term: "a quiz costs 5 for 3 marks" is a
--    standing policy, and a per-term table would make the instructor say it three
--    times. Recitation is not a part here — it is computed from attendance, so
--    there is no mark to add to.
-- ----------------------------------------------------------------------------
create table if not exists public.grade_assist_defaults (
  subject_id   uuid not null references public.subjects(id) on delete cascade,
  component    text not null check (component in ('performance_task', 'quiz', 'exam')),
  points_cost  integer      not null check (points_cost between 1 and 50),
  points_bonus numeric(6,2) not null check (points_bonus > 0),
  updated_at   timestamptz  not null default now(),
  primary key (subject_id, component)
);

alter table public.grade_assist_defaults enable row level security;

drop policy if exists grade_assist_defaults_all on public.grade_assist_defaults;
create policy grade_assist_defaults_all on public.grade_assist_defaults
  for all to authenticated using (public.is_instructor()) with check (public.is_instructor());

grant select, insert, update, delete on public.grade_assist_defaults to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Two columns on a score column
--
--    assist_off   this column is not offered even though its part is
--    session_id   the class this column was held in; tied to attendance so an
--                 absentee is marked Absent without anyone typing it twice
--
--    points_cost / points_bonus (0062) keep their both-or-neither CHECK and now
--    mean "this column's OWN terms", overriding the part's.
-- ----------------------------------------------------------------------------
alter table public.grade_items
  add column if not exists assist_off boolean not null default false,
  add column if not exists session_id uuid references public.class_sessions(id) on delete set null;

create index if not exists grade_items_session_idx
  on public.grade_items (session_id) where session_id is not null;

-- Keep the 365-day mirror in step: same columns, same ORDER as public (the
-- nightly copy is `select current_date, s.*`, which is positional). A no-op until
-- the first nightly run has created the mirror.
alter table if exists backup.grade_items
  add column if not exists assist_off boolean,
  add column if not exists session_id uuid;

-- ----------------------------------------------------------------------------
-- 3. The Absent mark, typed by hand
--
--    A row here means "the instructor marked this student absent on this column".
--    The derived half (a class date + an attendance record) needs no rows at all.
--
--    A cell is EITHER a mark OR an absent mark, never both: typing a number removes
--    the absent row and typing A removes the mark. That is two triggers rather than
--    a client convention, so no code path (the grid, the importer, an approved
--    assist) can leave a cell saying both.
-- ----------------------------------------------------------------------------
create table if not exists public.grade_absences (
  item_id    uuid not null references public.grade_items(id) on delete cascade,
  student_id uuid not null references public.students(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, student_id)
);

create index if not exists grade_absences_student_idx on public.grade_absences (student_id);

alter table public.grade_absences enable row level security;

drop policy if exists grade_absences_all on public.grade_absences;
create policy grade_absences_all on public.grade_absences
  for all to authenticated using (public.is_instructor()) with check (public.is_instructor());

grant select, insert, update, delete on public.grade_absences to authenticated;

create or replace function public.cp_grade_cell_exclusive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_TABLE_NAME = 'grade_scores' then
    delete from public.grade_absences
     where item_id = NEW.item_id and student_id = NEW.student_id;
  else
    delete from public.grade_scores
     where item_id = NEW.item_id and student_id = NEW.student_id;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_grade_scores_exclusive on public.grade_scores;
create trigger trg_grade_scores_exclusive
  after insert or update on public.grade_scores
  for each row execute function public.cp_grade_cell_exclusive();

drop trigger if exists trg_grade_absences_exclusive on public.grade_absences;
create trigger trg_grade_absences_exclusive
  after insert or update on public.grade_absences
  for each row execute function public.cp_grade_cell_exclusive();

-- ----------------------------------------------------------------------------
-- 4. The shared definitions
--
--    All revoked from the API roles: every caller is a security definer function
--    (the cp_peer_in_audience precedent), so a student can not ask about another
--    student's attendance or absences through them.
-- ----------------------------------------------------------------------------

-- WHAT ARE THE TERMS FOR THIS COLUMN?  The one answer.
--   off              → nothing
--   its own terms    → those
--   otherwise        → the subject's terms for its part (or nothing)
create or replace function public.cp_assist_terms(p_item_id uuid)
returns table (cost integer, bonus numeric)
language sql
stable
security definer
set search_path = public
as $$
  select case when gi.assist_off or gi.component = 'recitation' then null
              when gi.points_cost is not null then gi.points_cost
              else d.points_cost end,
         case when gi.assist_off or gi.component = 'recitation' then null
              when gi.points_cost is not null then gi.points_bonus
              else d.points_bonus end
    from public.grade_items gi
    left join public.grade_assist_defaults d
           on d.subject_id = gi.subject_id and d.component = gi.component
   where gi.id = p_item_id;
$$;

revoke execute on function public.cp_assist_terms(uuid) from public, anon, authenticated;

-- IS THIS STUDENT ABSENT ON THIS COLUMN?  The one definition.
--   · the instructor marked them (grade_absences), OR
--   · the column is tied to a class and their record for it reads absent or
--     EXCUSED. Excused counts: the instructor's call — an excused absence is still
--     a class missed, and the column was sat without them.
create or replace function public.cp_grade_absent(p_item_id uuid, p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.grade_absences ga
            where ga.item_id = p_item_id and ga.student_id = p_student_id
         )
      or exists (
           select 1
             from public.grade_items gi
             join public.attendance_records ar on ar.session_id = gi.session_id
            where gi.id = p_item_id
              and ar.student_id = p_student_id
              and ar.status in ('absent', 'excused')
         );
$$;

revoke execute on function public.cp_grade_absent(uuid, uuid) from public, anon, authenticated;

-- ATTENDANCE COUNTS for one section, subject and term — COUNTS, never a rate.
--   showed  = present + late
--   counted = present + late + absent      (excused / irregular are NEUTRAL)
-- the rule lib/attendance.ts mirrors and get_term_attendance (0034) states. Scoped
-- to the SUBJECT (attendance is per subject) and compared in MANILA time, because
-- started_at is timestamptz and the term bounds are plain dates. A semester with no
-- dates for that term yields nothing, not an error: a grade screen must not fall over
-- because a calendar is half set up.
create or replace function public.cp_term_attendance(
  p_section_id uuid,
  p_subject_id uuid,
  p_term       text
)
returns table (student_id uuid, showed integer, counted integer)
language sql
stable
security definer
set search_path = public
as $$
  select ar.student_id,
         (count(*) filter (where ar.status in ('present', 'late')))::integer,
         (count(*) filter (where ar.status in ('present', 'late', 'absent')))::integer
    from public.sections sec
    join public.semester_terms st
           on st.semester_id = sec.semester_id and st.term = p_term
    join public.class_sessions cs
           on cs.section_id = sec.id
          and cs.subject_id = p_subject_id
          and (cs.started_at at time zone 'Asia/Manila')::date between st.starts_on and st.ends_on
    join public.attendance_records ar on ar.session_id = cs.id
   where sec.id = p_section_id
   group by ar.student_id;
$$;

revoke execute on function public.cp_term_attendance(uuid, uuid, text) from public, anon, authenticated;

-- The instructor's read of the same counts, for the grade grid.
drop function if exists public.get_grade_attendance(uuid, uuid, text);
create function public.get_grade_attendance(
  p_section_id uuid,
  p_subject_id uuid,
  p_term       text
)
returns table (student_id uuid, showed integer, counted integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read grades.';
  end if;

  return query
  select a.student_id, a.showed, a.counted
    from public.cp_term_attendance(p_section_id, p_subject_id, p_term) a;
end;
$$;

grant execute on function public.get_grade_attendance(uuid, uuid, text) to authenticated;

-- Every Absent mark in a scope, one jsonb array (a section-term can hold ~800
-- cells, past PostgREST's silent 1000-row cap if it were a table). `source` says
-- where it came from: 'manual' (typed) wins over 'auto' (from attendance).
drop function if exists public.get_grade_absences(uuid, uuid, text);
create function public.get_grade_absences(
  p_section_id uuid,
  p_subject_id uuid,
  p_term       text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read grades.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'itemId',    x.item_id,
             'studentId', x.student_id,
             'source',    x.source))
      from (
        select distinct on (u.item_id, u.student_id)
               u.item_id, u.student_id, u.source
          from (
            select ga.item_id, ga.student_id, 'manual'::text as source
              from public.grade_absences ga
              join public.grade_items gi on gi.id = ga.item_id
             where gi.section_id = p_section_id
               and gi.subject_id = p_subject_id
               and gi.archived_at is null
               and (p_term is null or gi.term = p_term)
            union all
            select gi.id, ar.student_id, 'auto'::text
              from public.grade_items gi
              join public.attendance_records ar on ar.session_id = gi.session_id
             where gi.section_id = p_section_id
               and gi.subject_id = p_subject_id
               and gi.archived_at is null
               and (p_term is null or gi.term = p_term)
               and ar.status in ('absent', 'excused')
          ) u
         order by u.item_id, u.student_id, u.source desc
      ) x
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_grade_absences(uuid, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Ownership moves
-- ----------------------------------------------------------------------------

-- 5a. A student asks. Terms come from cp_assist_terms; an absent student is refused
--     BEFORE the "mark isn't in yet" check, because "you were absent" is the truer
--     reason and the one that tells them not to wait.
create or replace function public.request_grade_boost(p_item_id uuid)
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
  v_cost           integer;
  v_bonus          numeric;
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
  -- 0063: the terms are the column's own, else its part's, else none.
  select t.cost, t.bonus into v_cost, v_bonus
    from public.cp_assist_terms(v_item.id) t;
  if v_cost is null then
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

  -- 0063: absent (marked, or recorded absent / excused in the class this column
  -- was held in) is refused FIRST — "you were absent" is the truer reason, and it
  -- tells them not to wait for a mark that is not coming.
  if public.cp_grade_absent(v_item.id, v_student.id) then
    raise exception 'You were marked absent for %, so points can’t be used on it.',
      v_item.name;
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
    raise exception 'You’ve already used points on % — a column can only be assisted once.',
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
  if v_cost > v_available then
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
       values (v_student.id, v_cost, v_kind,
               left('Assist · ' || v_item.name, 120),
               v_item.id, v_bonus)
    returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.request_grade_boost(uuid) to authenticated;

-- 5b. The instructor decides. Wording moved to "points assist"; and the absent
--     rule is re-checked NOW, because the instructor may tie the column to a class
--     between the request and the decision.
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

      -- 0063: absent is re-checked NOW — the column may have been tied to a
      -- class (or the student marked absent) since they asked.
      if public.cp_grade_absent(v_item.id, v_req.student_id) then
        raise exception 'They are marked absent for %. Decline this request.', v_item.name;
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

      v_ledger := 'Used · Points assist · ' || v_item.name
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
      v_title := 'Points assist approved — ' || v_item.name;
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

-- 5c. The instructor undoes one. Wording only.
create or replace function public.reverse_grade_boost(p_item_id uuid, p_student_id uuid)
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
    raise exception 'Only the instructor can reverse a points assist.';
  end if;

  select * into v_boost
    from public.grade_boosts
   where item_id = p_item_id and student_id = p_student_id;
  if not found then
    raise exception 'There is no points assist on that mark — it may already have been reversed.';
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
    raise exception 'There is no points assist on that mark — it may already have been reversed.';
  end if;

  if v_req.point_event_id is null then
    raise exception 'The original charge is no longer in the ledger, so the points cannot be returned automatically.';
  end if;
  select * into v_debit from public.point_events where id = v_req.point_event_id;
  if not found then
    raise exception 'The original charge is no longer in the ledger, so the points cannot be returned automatically.';
  end if;
  if v_debit.semester_id is distinct from public.cp_active_semester_id() then
    raise exception 'That points assist was paid for in a past semester, so its points can’t be returned to this one.';
  end if;

  select * into v_item from public.grade_items where id = p_item_id;

  insert into public.point_events (student_id, points, category, note)
       values (p_student_id, v_boost.points_spent, 'redeem',
               'Refund · Points assist reversed · ' || coalesce(v_item.name, 'a column'))
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
      'Points assist reversed — ' || coalesce(v_item.name, 'a column'),
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

-- 5d. A student's own grades. Effective terms, the Absent flag, and the term's
--     attendance counts (so the client can compute Recitation with grading.ts).
--     Recitation columns are left out: the part is computed now.
create or replace function public.get_my_grades()
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
                   'attendance', (
                     -- 0063: this student's counts per term; grading.ts turns them
                     -- into the Recitation figure.
                     select coalesce(jsonb_object_agg(
                              tt.term,
                              jsonb_build_object('showed',  coalesce(a.showed, 0),
                                                 'counted', coalesce(a.counted, 0))), '{}'::jsonb)
                       from (values ('prelim'), ('midterm'), ('finals')) as tt(term)
                       left join lateral public.cp_term_attendance(
                              v_student.section_id, sub.id, tt.term) a
                              on a.student_id = v_student.id
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
                              'pointsCost', (select t.cost from public.cp_assist_terms(gi.id) t),
                              'pointsBonus', (select t.bonus from public.cp_assist_terms(gi.id) t),
                              'absent',     public.cp_grade_absent(gi.id, v_student.id),
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
                        and gi.component <> 'recitation'
                   )
                 ) as sj
            from public.subjects sub
           where exists (
             select 1 from public.grade_items g2
              where g2.section_id = v_student.section_id
                and g2.subject_id = sub.id
                and g2.archived_at is null
                and g2.component <> 'recitation'
           )
        ) q
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_my_grades() to authenticated;

-- 5e. The aggregate. The recit_* slots now carry ATTENDANCE counts:
--       recit_score  = showed        recit_max = recit_marked = counted
--     so every reader of the sums (Overall, both exports, both print routes, the
--     weights impact preview) gets the new Recitation with no change of its own.
create or replace function public.get_section_grade_sums(
  p_section_id uuid,
  p_subject_id uuid,
  p_term       text default null
)
returns table (
  student_id   uuid,
  full_name    text,
  term         text,
  pt_score     numeric, pt_max     numeric, pt_marked     numeric,
  quiz_score   numeric, quiz_max   numeric, quiz_marked   numeric,
  recit_score  numeric, recit_max  numeric, recit_marked  numeric,
  exam_score   numeric, exam_max   numeric, exam_marked   numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read grades.';
  end if;

  return query
  with roster as (
    -- Active students in the section, PLUS anyone who already has a score
    -- against this section's items. The second half is not decoration: items
    -- are keyed to a section, so a student moved mid-semester would otherwise
    -- vanish from the grid that holds the marks they actually earned, with
    -- nothing on screen saying so. Same rule getSectionRegister follows.
    select s.id, s.full_name
      from public.students s
     where s.section_id = p_section_id
       and s.archived_at is null
    union
    select s.id, s.full_name
      from public.students s
     where exists (
       select 1
         from public.grade_scores gs
         join public.grade_items  gi on gi.id = gs.item_id
        where gs.student_id = s.id
          and gi.section_id = p_section_id
          and gi.subject_id = p_subject_id
     )
  ),
  wanted_terms as (
    select t.term::text as term
      from (values ('prelim'), ('midterm'), ('finals')) as t(term)
     where p_term is null or t.term::text = p_term
  ),
  cells as (
    select gi.term, gi.component, r.id as sid, gi.max_score, gs.score
      from roster r
      cross join public.grade_items gi
      left join public.grade_scores gs
             on gs.item_id = gi.id and gs.student_id = r.id
     where gi.section_id  = p_section_id
       and gi.subject_id  = p_subject_id
       and gi.archived_at is null
       and (p_term is null or gi.term = p_term)
  )
  select r.id,
         r.full_name,
         wt.term::text,
         coalesce(sum(c.score)     filter (where c.component = 'performance_task'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'performance_task'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'performance_task'
                                             and c.score is not null), 0),
         coalesce(sum(c.score)     filter (where c.component = 'quiz'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'quiz'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'quiz'
                                             and c.score is not null), 0),
         -- 0063: Recitation is attendance — showed / counted / counted.
         coalesce(max(att.showed), 0)::numeric,
         coalesce(max(att.counted), 0)::numeric,
         coalesce(max(att.counted), 0)::numeric,
         coalesce(sum(c.score)     filter (where c.component = 'exam'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'exam'), 0),
         coalesce(sum(c.max_score) filter (where c.component = 'exam'
                                             and c.score is not null), 0)
    from roster r
    cross join wanted_terms wt
    left join cells c on c.sid = r.id and c.term = wt.term
    left join lateral public.cp_term_attendance(p_section_id, p_subject_id, wt.term) att
           on att.student_id = r.id
   group by r.id, r.full_name, wt.term
   order by r.full_name, wt.term;
end;
$$;

grant execute on function public.get_section_grade_sums(uuid, uuid, text) to authenticated;

-- 5f. Backup.
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
    'grade_policies', 'grade_items', 'grade_scores', 'grade_boosts',
    'grade_assist_defaults', 'grade_absences'
  ];
  -- The tables whose history is the ONLY history (see 0057 (b) and (c)).
  kept   constant text[] := array['grade_policies', 'grade_items', 'grade_scores', 'grade_boosts',
                                  'grade_assist_defaults', 'grade_absences'];
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
--   1. The new objects exist, one of each function:
--        select proname, count(*) from pg_proc
--         where proname in ('cp_assist_terms','cp_grade_absent','cp_term_attendance',
--                           'get_grade_attendance','get_grade_absences',
--                           'request_grade_boost','decide_point_redemption',
--                           'reverse_grade_boost','get_my_grades',
--                           'get_section_grade_sums','cp_grade_cell_exclusive')
--         group by proname;                                   -- all 1
--
--   2. The terms resolve: a column's own terms beat the part's, off beats both.
--        insert into public.grade_assist_defaults (subject_id, component, points_cost, points_bonus)
--             values ('<subject>', 'quiz', 5, 3)
--        on conflict (subject_id, component) do update set points_cost = 5, points_bonus = 3;
--        select * from public.cp_assist_terms('<a quiz item>');          -- 5 | 3
--        update public.grade_items set assist_off = true where id = '<a quiz item>';
--        select * from public.cp_assist_terms('<a quiz item>');          -- null | null
--        update public.grade_items set assist_off = false where id = '<a quiz item>';
--
--   3. A cell is a mark OR an Absent mark, never both:
--        insert into public.grade_absences (item_id, student_id) values ('<item>', '<s>');
--        insert into public.grade_scores (item_id, student_id, score) values ('<item>', '<s>', 12)
--          on conflict (item_id, student_id) do update set score = 12;
--        select count(*) from public.grade_absences where item_id = '<item>' and student_id = '<s>';  -- 0
--
--   4. Absent comes from attendance too, and EXCUSED counts:
--        update public.grade_items set session_id = '<a class session>' where id = '<item>';
--        select public.cp_grade_absent('<item>', '<a student recorded absent or excused there>');  -- t
--        select public.cp_grade_absent('<item>', '<a student recorded present there>');            -- f
--
--   5. Recitation counts match the attendance rate you can see on a student's screen:
--        select * from public.cp_term_attendance('<section>', '<subject>', 'prelim')
--         where student_id = '<s>';          -- showed / counted
--      and the aggregate carries them:
--        select recit_score, recit_max, recit_marked
--          from public.get_section_grade_sums('<section>', '<subject>', 'prelim')
--         where student_id = '<s>';          -- showed | counted | counted
--
--   6. An absent student is refused (as that student):
--        select public.request_grade_boost('<item they were absent for>');
--        -- ERROR:  You were marked absent for …, so points can’t be used on it.
--
--   7. The wording moved: nothing a person reads still says "boost".
--        select pg_get_functiondef('public.decide_point_redemption'::regproc) ~* 'Grade boost|Boost approved';  -- f
--
--   8. The backup covers the new tables, and the mirror was widened not parked:
--        select pg_get_functiondef('public.cp_nightly_backup'::regproc) like '%grade_absences%';   -- t
--        select public.cp_nightly_backup();
--        select table_name from information_schema.tables
--         where table_schema = 'backup' and table_name like 'grade_items%';
--        -- grade_items only — NO grade_items_pre_YYYYMMDD
-- ============================================================================
