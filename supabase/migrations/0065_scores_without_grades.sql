-- ============================================================================
-- 0065 · Scores and points stay available when the grade switch is OFF
--
-- WHAT THIS CHANGES (instructor, 2026-11-11)
--   Until now "Student grades" off meant a student saw "Grades aren't open yet" and
--   nothing else — not even their own quiz scores, and request_grade_boost refused.
--   Now the switch hides only the GRADE:
--
--     OFF  a student still sees every column and their score on it ("23 / 40"),
--          and can use points on any of them exactly as when it is on. They do NOT
--          see the term figure, the part scores, or how it is worked out.
--     ON   as before.
--
--   Nothing about a student's marks is secret from them — they are the student's
--   own — so the switch no longer gates the screen. It gates the computed grade.
--
-- HIDING IS REAL, NOT JUST CSS
--   While the figures are hidden get_my_grades withholds the WEIGHTS ('policies')
--   and the ATTENDANCE counts, the two inputs the client needs besides the marks to
--   compute a grade. An unopened grade therefore cannot be reconstructed from the
--   payload, and the 'figures' key tells the screen which state it is in.
--
-- OWNERSHIP MOVES (bodies extracted from 0064 and patched, then diffed)
--   get_my_grades         0064 → 0065   'figures' key; policies / attendance withheld
--                                       while hidden; only an ARCHIVED account is
--                                       'enabled': false now.
--   request_grade_boost   0064 → 0065   the "Grades are not open yet" gate is removed.
--   Same signatures, plain create or replace. 0064 must not be edited.
--
-- Notifications are unchanged: turning the switch on still pushes "Your grades are
-- open", which is now exactly true — the GRADE is what opens.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   Must go AFTER 0064. Safe to re-run — paste it twice. Paste it BEFORE deploying
--   the client that reads 'figures'; until then the client treats a missing
--   'figures' as "figures shown when enabled", so nothing breaks, it just keeps the
--   old all-or-nothing behaviour.
-- ============================================================================

create or replace function public.request_grade_boost(p_item_id uuid, p_points integer)
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

  -- 0065: NO "grades are open" gate. The switch hides the grade FIGURES from a
  -- student; their scores, and using points on them, are always available.

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

create or replace function public.get_my_grades()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_figures boolean;
begin
  select * into v_student from public.students where user_id = auth.uid();
  if not found then
    raise exception 'Only students can see grades.';
  end if;

  -- 0065: only an ARCHIVED account gets nothing. Otherwise the student always sees
  -- their own marks and can use points on them; the switch decides only whether the
  -- GRADE FIGURES are shown.
  if v_student.archived_at is not null then
    return jsonb_build_object('enabled', false, 'figures', false, 'subjects', '[]'::jsonb);
  end if;

  v_figures := public.cp_student_grades_flag();

  return jsonb_build_object(
    'enabled', true,
    'figures', v_figures,
    'subjects', coalesce((
      select jsonb_agg(q.sj order by q.sj ->> 'code')
        from (
          select jsonb_build_object(
                   'subjectId', sub.id,
                   'code',      sub.code,
                   'name',      sub.name,
                   'policies', case when v_figures then (
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
                   ) else '[]'::jsonb end,
                   'attendance', case when v_figures then (
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
                   ) else '{}'::jsonb end,
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

-- The flag's own description said it gated the whole screen.
update public.app_flags
   set note = 'Shows students their GRADE figures. Off = they still see their scores and can use points, but not the term grade or the part scores.'
 where key = 'student_grades';

-- ============================================================================
-- Verify (run the whole file twice — every statement is idempotent):
--
--   1. With the switch OFF, as a student:
--        select public.set_student_grades_enabled(false);          -- instructor
--        select public.get_my_grades();
--        -- "enabled": true, "figures": false, every subject has "policies": [] and
--        -- "attendance": {} but its "items" carry the student's own scores.
--
--   2. Using points works while OFF (it used to raise "Grades are not open yet."):
--        select public.request_grade_boost('<item with a mark below its max>', 1);
--
--   3. With the switch ON, "figures": true and "policies" has three rows per subject.
--
--   4. Exactly one of each function:
--        select proname, count(*) from pg_proc
--         where proname in ('get_my_grades','request_grade_boost') group by proname;   -- 1, 1
--
--   5. The request function really lost the gate:
--        select pg_get_functiondef('public.request_grade_boost(uuid, integer)'::regprocedure)
--                 like '%Grades are not open yet%';                                    -- f
-- ============================================================================
