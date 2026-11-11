-- ============================================================================
-- 0064 · Points assist is AUTOMATIC: the student picks how many points,
--        1 point = 1 mark, never past the column's maximum
--
-- WHAT THIS CHANGES (instructor, 2026-11-11)
--   0062/0063 made the instructor SET the trade — a cost and a number of marks,
--   per part or per column — before a student could use points on anything. That
--   is gone. Every quiz, performance task, activity and exam is open to a student
--   the moment THEIR mark is in, with no setup:
--
--     · 1 point buys 1 mark.
--     · The STUDENT chooses how many points, from 1 up to the marks still missing
--       to reach the column's maximum (rounded up to a whole point, and never more
--       than 50 — the ceiling request_point_redemption already enforces).
--     · The gain is capped at the maximum, so a mark can never pass it: a 17/20 may
--       use at most 3 points; a 17.5/20 may use 3 and gains 2.5.
--     · Still once per column, still approved by hand, still reversible, still
--       refused for an absent student.
--
-- WHAT STAYS
--   grade_items.assist_off is the ONLY instructor control left — "points can't be
--   used on this column". The grade_assist_defaults table and grade_items
--   .points_cost / .points_bonus are RETIRED: nothing reads them, they are not
--   dropped (their data is the history of what was once set, and the nightly backup
--   still mirrors them), and no client writes them.
--
-- OWNERSHIP MOVES (bodies extracted from 0063 and patched, then diffed)
--   request_grade_boost   0063 → 0064   SIGNATURE CHANGES: (uuid) → (uuid, integer).
--                                       Dropped first — a create or replace with a new
--                                       parameter list makes an OVERLOAD and PostgREST
--                                       then rejects every call as ambiguous (0028).
--   get_my_grades         0063 → 0064   `offered` replaces pointsCost / pointsBonus.
--   decide_point_redemption is NOT touched: it already applies the bonus the student
--   agreed to (point_redemptions.grade_bonus), capped at the maximum at the moment of
--   approval, which is exactly what automatic terms need.
--   cp_assist_terms is dropped — there are no terms to resolve any more.
--   0063 must not be edited.
--
-- ⚠ CLIENT ORDER. The client now calls request_grade_boost(item, points) and reads
--   `offered` from get_my_grades. Paste this BEFORE deploying that build, or every
--   request fails and every column reads "not offered".
--
-- audit_log_action_check is NOT touched.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   Must go AFTER 0063. Safe to re-run — paste it twice.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A student asks — and chooses how many points
-- ----------------------------------------------------------------------------
drop function if exists public.request_grade_boost(uuid);
drop function if exists public.request_grade_boost(uuid, integer);
create function public.request_grade_boost(p_item_id uuid, p_points integer)
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
  v_gap            numeric;
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
  -- 0064: EVERY column is open unless the instructor switched it off. Recitation
  -- is attendance, so there is no mark to add to.
  if v_item.assist_off or v_item.component = 'recitation' then
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

  -- 0064: the STUDENT chooses how many points. 1 point = 1 mark, so they may use
  -- at most the marks still missing to the maximum — rounded UP to a whole point
  -- (points are whole numbers; 17.5/20 may use 3 and gains 2.5) and never more
  -- than 50, the ceiling request_point_redemption already enforces. The gain is
  -- capped at the gap, so a mark can never pass the column's maximum.
  v_gap := v_item.max_score - v_score;
  if p_points is null or p_points < 1 then
    raise exception 'Choose how many points to use.';
  end if;
  if p_points > least(50, ceil(v_gap)::int) then
    raise exception 'You can use at most % % on % — that already reaches full marks.',
      least(50, ceil(v_gap)::int),
      case when least(50, ceil(v_gap)::int) = 1 then 'point' else 'points' end,
      v_item.name;
  end if;
  v_cost  := p_points;
  v_bonus := least(p_points::numeric, v_gap);

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

grant execute on function public.request_grade_boost(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. A student's own grades — `offered` instead of the terms
-- ----------------------------------------------------------------------------
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
                              'offered',    not gi.assist_off,
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

-- ----------------------------------------------------------------------------
-- 3. The terms are gone
-- ----------------------------------------------------------------------------
drop function if exists public.cp_assist_terms(uuid);

comment on table public.grade_assist_defaults is
  'RETIRED in 0064 — points assist is automatic (1 point = 1 mark, student chooses). Kept for history; nothing reads or writes it.';
comment on column public.grade_items.points_cost is
  'RETIRED in 0064 — see grade_assist_defaults. Nothing reads or writes it.';
comment on column public.grade_items.points_bonus is
  'RETIRED in 0064 — see grade_assist_defaults. Nothing reads or writes it.';

-- ============================================================================
-- Verify (run the whole file twice — every statement is idempotent):
--
--   1. Exactly ONE request_grade_boost, and it takes (uuid, integer):
--        select pg_get_function_identity_arguments(oid) from pg_proc
--         where proname = 'request_grade_boost';       -- p_item_id uuid, p_points integer
--
--   2. cp_assist_terms is gone:
--        select count(*) from pg_proc where proname = 'cp_assist_terms';     -- 0
--
--   3. As a student with a mark of 17 on a /20 column, no setup needed:
--        select public.request_grade_boost('<item>', 3);       -- ok: reaches 20
--        -- and from a second column (17/20):
--        select public.request_grade_boost('<item>', 4);
--        -- ERROR:  You can use at most 3 points on … — that already reaches full marks.
--        select public.request_grade_boost('<item>', 0);
--        -- ERROR:  Choose how many points to use.
--
--   4. The request carries what the student chose, capped:
--        select points, grade_bonus from public.point_redemptions
--         where grade_item_id = '<item>' order by created_at desc limit 1;   -- 3 | 3
--        -- a 17.5/20 column asked for 3 points: 3 | 2.5
--
--   5. Approve it (instructor): the mark rises by grade_bonus, never past the max,
--      and semester_points drops by `points`.
--
--   6. A column switched off is refused:
--        update public.grade_items set assist_off = true where id = '<item>';
--        select public.request_grade_boost('<item>', 1);
--        -- ERROR:  Points can’t be used on that column.
--
--   7. An absent student is still refused (0063's rule is unchanged).
--
--   8. get_my_grades carries `offered`, not the old terms:
--        select public.get_my_grades() -> 'subjects' -> 0 -> 'items' -> 0;
--        -- has "offered": true, and NO "pointsCost" / "pointsBonus"
-- ============================================================================
