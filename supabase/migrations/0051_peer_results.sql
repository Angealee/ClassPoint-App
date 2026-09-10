-- ============================================================================
-- ClassPoint · 0051 · Peer results, release and backup
-- Run after 0050. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   Phase 3, the last. Aggregation, the instructor's results board, releasing
--   each student their own anonymised feedback, hiding a cruel comment, and
--   folding all eight peer tables into the nightly backup.
--
--   NO NEW TABLES. Everything here reads 0050's rows or sets one timestamp.
--   Still nothing touches `point_events`.
--
-- ── AGGREGATION LIVES IN SQL, AND THAT IS NOT A STYLE PREFERENCE ────────────
--   A 40-student section running a section-wide evaluation with 4 criteria
--   produces 40 × 39 × 4 = 6,240 rating rows. PostgREST caps any response at
--   1000 rows and truncates SILENTLY — the 0031 lesson, which cost this project
--   a term of quietly wrong attendance tallies. A client-side aggregation here
--   would report averages that are wrong and look fine.
--
-- ── THE PERCENT FORMULA, AND WHY MIN-MAX ───────────────────────────────────
--   Per criterion: pct = (avg − min) / (max − min) × 100, where min and max are
--   the FIRST and LAST values of that criterion's own scale (ascending is
--   guaranteed by `cp_peer_scale_clean`).
--
--   Min-max, NOT avg / max. On a 1-to-5 scale a straight 1 is the worst rating
--   available and must read 0%, not 20%. On a 0/1 scale the two are the same;
--   on every other scale they are not.
--
--   The headline overall is the mean of those percentages. The raw mean of the
--   per-criterion averages is shown underneath, labelled raw, and computed from
--   UNROUNDED values with a single round at the end — peer2peer averaged
--   already-rounded numbers and compounded the error.
--
--   `cp_peer_scores()` is the ONE place that formula exists in SQL, and both
--   result RPCs read it. `src/lib/peer-scale.ts` mirrors it and is pinned by a
--   test; change one, change the other, same commit.
--
-- ── THE THREE-RATER FLOOR (the instructor's call, 2026-09-10) ──────────────
--   Below 3 raters a student's COMMENTS are withheld and their numbers are not.
--   In a pair, one comment is one person's voice and "anonymous" is a fiction;
--   an average is still hard to attribute to a sentence. Enforced HERE, in
--   `get_my_peer_results`, not in the client — the client never sees the rows
--   it would have to decide not to draw.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The scoring core — ONE definition of the formula
--
--    Revoked from every API role: it is a building block, not an endpoint, and
--    it applies no visibility rules of its own. Both RPCs below add those.
-- ----------------------------------------------------------------------------
drop function if exists public.cp_peer_scores(uuid, uuid);
create function public.cp_peer_scores(p_eval uuid, p_ratee uuid default null)
returns table (
  ratee       uuid,
  criterion   uuid,
  label       text,
  sort_order  integer,
  scale_min   numeric,
  scale_max   numeric,
  raw_avg     numeric,
  pct         numeric,
  ratings     integer
)
language sql
stable
security definer
set search_path = public
as $$
  with crit as (
    select
      c.id,
      c.label      as c_label,
      c.sort_order as c_order,
      -- First and last option. cp_peer_scale_clean guarantees the array is
      -- ascending and holds at least two distinct values, so these are the
      -- real bounds rather than whichever two happened to be typed first.
      (c.scale -> 0 ->> 'value')::numeric                              as lo,
      (c.scale -> (jsonb_array_length(c.scale) - 1) ->> 'value')::numeric as hi
    from public.peer_criteria c
    where c.evaluation_id = p_eval
  ),
  per as (
    select r.ratee_id, r.criterion_id, avg(r.score::numeric) as avg_score, count(*)::integer as n
      from public.peer_ratings r
     where r.evaluation_id = p_eval
       and (p_ratee is null or r.ratee_id = p_ratee)
     group by r.ratee_id, r.criterion_id
  )
  select
    p.ratee_id,
    c.id,
    c.c_label,
    c.c_order,
    c.lo,
    c.hi,
    p.avg_score,
    -- The guard can only fire on data that predates the ascending rule. Zero
    -- is the honest answer for a scale with no range: every rating on it is
    -- simultaneously the best and the worst available.
    case when c.hi > c.lo then (p.avg_score - c.lo) / (c.hi - c.lo) * 100 else 0 end,
    p.n
  from per p
  join crit c on c.id = p.criterion_id;
$$;

revoke execute on function public.cp_peer_scores(uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. The instructor's results board
--
--    EVERY active student in the targeted sections, including anyone nobody
--    rated — they come back with rater_count 0 and null averages. Dropping them
--    would answer "how did people score" while hiding "who did nobody rate",
--    and the second question is the one with something to act on.
--
--    Comments carry REAL NAMES here. The instructor always sees who said what;
--    that is the other half of the promise made to the student being rated.
-- ----------------------------------------------------------------------------
drop function if exists public.get_peer_results(uuid, uuid);
create function public.get_peer_results(p_eval uuid, p_section uuid default null)
returns table (
  student_id   uuid,
  display_name text,
  full_name    text,
  avatar_url   text,
  section_name text,
  group_name   text,
  rater_count  integer,
  overall_pct  numeric,
  overall_raw  numeric,
  same_scale   boolean,
  criteria     jsonb,
  comments     jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Whether averaging the per-criterion RAW means says anything: it does not
  -- when one criterion is 1-to-5 and the next is 0/1. The percentages are
  -- always comparable; the raw figure is only comparable within one scale, and
  -- the screen says so when this is false.
  v_same boolean;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read peer results.';
  end if;

  select count(*) <= 1 into v_same
    from (
      select distinct
        (c.scale -> 0 ->> 'value')::numeric,
        (c.scale -> (jsonb_array_length(c.scale) - 1) ->> 'value')::numeric
      from public.peer_criteria c
     where c.evaluation_id = p_eval
    ) d;

  return query
  with scores as (
    select * from public.cp_peer_scores(p_eval, null)
  ),
  agg as (
    select
      s.ratee,
      round(avg(s.pct), 1)     as o_pct,
      round(avg(s.raw_avg), 2) as o_raw,
      jsonb_agg(jsonb_build_object(
        'id',       s.criterion,
        'label',    s.label,
        'avg',      round(s.raw_avg, 2),
        'pct',      round(s.pct, 1),
        'scaleMin', s.scale_min,
        'scaleMax', s.scale_max,
        'ratings',  s.ratings
      ) order by s.sort_order) as crit_json
    from scores s
    group by s.ratee
  ),
  raters as (
    select r.ratee_id, count(distinct r.evaluator_id)::integer as n
      from public.peer_ratings r
     where r.evaluation_id = p_eval
     group by r.ratee_id
  )
  select
    stu.id,
    stu.display_name,
    stu.full_name,
    stu.avatar_url,
    sec.name,
    g.name,
    coalesce(rt.n, 0),
    a.o_pct,
    a.o_raw,
    v_same,
    coalesce(a.crit_json, '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'submissionId',  pc.submission_id,
               'body',          pc.body,
               'evaluatorId',   pc.evaluator_id,
               'evaluatorName', ev.display_name,
               'hiddenAt',      pc.hidden_at,
               'createdAt',     pc.created_at
             ) order by pc.created_at)
        from public.peer_comments pc
        join public.students ev on ev.id = pc.evaluator_id
       where pc.evaluation_id = p_eval and pc.ratee_id = stu.id
    ), '[]'::jsonb)
  from public.peer_evaluation_sections t
  join public.students stu
    on stu.section_id = t.section_id and stu.archived_at is null
  join public.sections sec on sec.id = stu.section_id
  left join public.peer_group_members m
         on m.student_id = stu.id and m.section_id = stu.section_id
  left join public.peer_groups g on g.id = m.group_id and g.archived_at is null
  left join agg    a  on a.ratee     = stu.id
  left join raters rt on rt.ratee_id = stu.id
 where t.evaluation_id = p_eval
   and (p_section is null or t.section_id = p_section)
 -- Lowest first. This board is read to find who needs a conversation, and
 -- alphabetical order buries that on page two. Unrated students sort last
 -- rather than first: they are a data gap, not a low score.
 order by a.o_pct asc nulls last, stu.full_name;
end;
$$;

grant execute on function public.get_peer_results(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. What a student gets back
--
--    Comments arrive as BARE STRINGS. Not "anonymous" objects with an id
--    stripped out — there is no evaluator field to forget to remove, because
--    the shape has no room for one. Hidden comments never leave the database.
--
--    Returns jsonb for the same reason `get_peer_evaluation` does: the payload
--    is nested and a RETURNS TABLE would be a cartesian product to un-pick.
-- ----------------------------------------------------------------------------
drop function if exists public.get_my_peer_results(uuid);
create function public.get_my_peer_results(p_eval uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Below this, comments are withheld. Named rather than inlined because the
  -- number is a promise, not a tuning knob.
  c_min_raters constant integer := 3;
  v_me      uuid := public.cp_my_student_id();
  v_eval    public.peer_evaluations;
  v_raters  integer;
  v_same    boolean;
  v_out     jsonb;
begin
  if public.cp_peer_eval_state() <> 'open' then
    raise exception 'Peer evaluation is paused right now.';
  end if;
  if v_me is null then
    raise exception 'Only a student can read their own results.';
  end if;

  select * into v_eval from public.peer_evaluations where id = p_eval;
  if v_eval.id is null or not public.cp_peer_eval_targets_me(p_eval) then
    raise exception 'That evaluation is not open to you.';
  end if;
  if v_eval.results_released_at is null then
    raise exception 'Those results have not been released yet.';
  end if;

  select count(distinct r.evaluator_id)::integer into v_raters
    from public.peer_ratings r
   where r.evaluation_id = p_eval and r.ratee_id = v_me;

  select count(*) <= 1 into v_same
    from (
      select distinct
        (c.scale -> 0 ->> 'value')::numeric,
        (c.scale -> (jsonb_array_length(c.scale) - 1) ->> 'value')::numeric
      from public.peer_criteria c
     where c.evaluation_id = p_eval
    ) d;

  select jsonb_build_object(
    'id',          v_eval.id,
    'title',       v_eval.title,
    'subjectCode', (select sub.code from public.subjects sub where sub.id = v_eval.subject_id),
    'subjectName', (select sub.name from public.subjects sub where sub.id = v_eval.subject_id),
    'releasedAt',  v_eval.results_released_at,
    'raterCount',  v_raters,
    'sameScale',   v_same,
    'overallPct',  (select round(avg(s.pct), 1)     from public.cp_peer_scores(p_eval, v_me) s),
    'overallRaw',  (select round(avg(s.raw_avg), 2) from public.cp_peer_scores(p_eval, v_me) s),
    'criteria',    coalesce((
                     select jsonb_agg(jsonb_build_object(
                              'id',       s.criterion,
                              'label',    s.label,
                              'avg',      round(s.raw_avg, 2),
                              'pct',      round(s.pct, 1),
                              'scaleMin', s.scale_min,
                              'scaleMax', s.scale_max
                              -- No `ratings` count. On a small team it is one
                              -- more number to difference against the others.
                            ) order by s.sort_order)
                       from public.cp_peer_scores(p_eval, v_me) s
                   ), '[]'::jsonb),
    'commentsWithheld', (v_raters < c_min_raters),
    'minRaters',        c_min_raters,
    'comments',    case
                     when v_raters < c_min_raters then '[]'::jsonb
                     else coalesce((
                       select jsonb_agg(pc.body order by pc.created_at)
                         from public.peer_comments pc
                        where pc.evaluation_id = p_eval
                          and pc.ratee_id = v_me
                          and pc.hidden_at is null
                     ), '[]'::jsonb)
                   end
  ) into v_out;

  return v_out;
end;
$$;

grant execute on function public.get_my_peer_results(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Hiding a comment
--
--    Sets a timestamp; the row is never destroyed. The instructor can still
--    read it, which is the point — "what did they actually say" is the question
--    you ask when the student comes to talk about it.
--
--    Allowed AFTER release too. Catching it late is the ordinary case, and the
--    alternative is a screen that refuses at exactly the moment it matters.
-- ----------------------------------------------------------------------------
drop function if exists public.set_peer_comment_hidden(uuid, uuid, boolean);
create function public.set_peer_comment_hidden(
  p_submission uuid,
  p_ratee      uuid,
  p_hidden     boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eval uuid;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can hide a comment.';
  end if;

  update public.peer_comments
     set hidden_at = case when p_hidden then now() else null end
   where submission_id = p_submission and ratee_id = p_ratee
  returning evaluation_id into v_eval;

  if v_eval is null then
    raise exception 'That comment does not exist.';
  end if;

  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
  values (auth.uid(), 'peer_eval', 'peer_comments', null,
          case when p_hidden then 'Hid a peer comment' else 'Restored a peer comment' end,
          jsonb_build_object(
            'evaluation_id', v_eval,
            'submission_id', p_submission,
            'ratee_id',      p_ratee,
            'hidden',        p_hidden
          ));
end;
$$;

grant execute on function public.set_peer_comment_hidden(uuid, uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Release
--
--    CLOSED FIRST, ALWAYS. Releasing while submissions are still arriving would
--    show a student a figure that then moves, and the second version is the one
--    they will assume was doctored.
--
--    Idempotent: returns 0 when it was already released, so a retried tap
--    cannot push a second notification at a whole class.
--
--    Only students who HAVE something to read are notified. Someone nobody
--    rated gets no push toward a screen that can only tell them so.
-- ----------------------------------------------------------------------------
drop function if exists public.release_peer_results(uuid);
create function public.release_peer_results(p_eval uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eval   public.peer_evaluations;
  v_ids    uuid[];
  v_total  integer;
  v_chunk  uuid[];
  v_i      integer;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can release results.';
  end if;

  select * into v_eval from public.peer_evaluations where id = p_eval for update;
  if v_eval.id is null then
    raise exception 'That evaluation does not exist.';
  end if;
  if v_eval.status <> 'closed' then
    raise exception 'Close the evaluation before releasing its results.';
  end if;
  if v_eval.results_released_at is not null then
    return 0;
  end if;

  update public.peer_evaluations
     set results_released_at = now()
   where id = p_eval;

  with targets as (
    select distinct r.ratee_id as id
      from public.peer_ratings r
      join public.students s on s.id = r.ratee_id and s.archived_at is null
     where r.evaluation_id = p_eval
  ), inserted as (
    insert into public.notifications (student_id, type, title, body, url)
    select t.id, 'peer_eval_results',
           -- Neutral and factual (the instructor's call). This can carry
           -- criticism, so a cheerful push is the wrong doorbell for it.
           'Peer feedback ready',
           format('%s — your results are now available.', v_eval.title),
           format('/app/peer/%s/results', p_eval)
      from targets t
    returning id
  )
  select array_agg(id) into v_ids from inserted;

  v_total := coalesce(array_length(v_ids, 1), 0);

  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
  values (auth.uid(), 'peer_eval', 'peer_evaluations', p_eval,
          format('Released results for "%s" to %s student(s)', v_eval.title, v_total),
          jsonb_build_object('title', v_eval.title, 'notified', v_total));

  -- Chunked at 50 — cp_push_dispatch puts every id in one HTTP body.
  v_i := 1;
  while v_i <= v_total loop
    v_chunk := v_ids[v_i : v_i + 49];
    perform public.cp_push_dispatch(v_chunk);
    v_i := v_i + 50;
  end loop;

  return v_total;
end;
$$;

grant execute on function public.release_peer_results(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Ownership move: cp_nightly_backup 0032 → 0051
--
--    Same signature, so a plain `create or replace` rebinds it; only the
--    `tables` array changed, gaining all EIGHT peer tables (0049's two and
--    0050's six). The backup mirror self-creates on first run through the
--    existing exception handler.
--
--    ⚠ 0032 MUST NOT BE EDITED. Two migrations owning one function is the trap
--    this file's whole header discipline exists to avoid.
--
--    Peer evaluation data is academic and irreplaceable. The Student Space
--    social tables were deliberately left OUT of backup; this is not that — a
--    lost peer evaluation cannot be re-run, because the answers depended on a
--    project that is over.
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
    'peer_submissions', 'peer_ratings', 'peer_comments'
  ];
begin
  foreach t in array tables loop
    begin
      -- Idempotent per day: re-running replaces today's snapshot.
      execute format('delete from backup.%I where snapshot_date = current_date', t);
      execute format('insert into backup.%I select current_date, s.* from public.%I s', t, t);
    exception when others then
      -- Schema drift (or a brand-new table): rebuild the mirror and retry once.
      -- Old snapshots for this one table are sacrificed for a working backup
      -- going forward — the other tables' history is untouched.
      execute format('drop table if exists backup.%I', t);
      execute format('create table backup.%I (snapshot_date date not null, like public.%I)', t, t);
      execute format('create index on backup.%I (snapshot_date)', t);
      execute format('insert into backup.%I select current_date, s.* from public.%I s', t, t);
    end;
  end loop;

  -- Retention: 14 daily snapshots; audit trail kept a full year.
  foreach t in array tables loop
    execute format('delete from backup.%I where snapshot_date < current_date - 14', t);
  end loop;
  delete from public.audit_log where at < now() - interval '365 days';
end;
$$;

revoke execute on function public.cp_nightly_backup() from public, anon, authenticated;

-- ============================================================================
-- VERIFY
--
--   Setup: a CLOSED evaluation from 0050 with at least three students who
--   submitted, and one criterion on a 1-to-5 scale.
--
--   1. THE FORMULA. Give one student straight 1s from everyone on the 1-to-5
--      criterion, then:
--        select * from public.get_peer_results('<eval>');
--      Their pct for that criterion is 0, NOT 20. Straight 5s give 100.
--      A student averaging 3 gives 50. Check it against the JS:
--        percentOf([{value:1,…},{value:5,…}], 3) === 50   (peer-scale.test.ts)
--
--   2. A student nobody rated still appears, with rater_count 0, null averages
--      and an empty criteria array — and sorts LAST, not first.
--
--   3. Comments carry real evaluator names for the instructor:
--        select comments from public.get_peer_results('<eval>');
--
--   4. THE THREE-RATER FLOOR, and it is the one that would fail silently.
--      Release the results:
--        select public.release_peer_results('<eval>');
--      As a student rated by only TWO people:
--        select public.get_my_peer_results('<eval>');
--      `commentsWithheld` is true and `comments` is []. Their `criteria` and
--      `overallPct` are still populated. As a student rated by three or more,
--      `commentsWithheld` is false and the comments are BARE STRINGS with no
--      evaluator field anywhere in the payload.
--
--   5. RELEASE IS IDEMPOTENT:
--        select public.release_peer_results('<eval>');   -- returns 0
--      and no second batch of notifications:
--        select count(*) from public.notifications where type = 'peer_eval_results';
--
--   6. Releasing an OPEN evaluation raises 'Close the evaluation before
--      releasing its results.'
--
--   7. HIDING:
--        select public.set_peer_comment_hidden('<submission>', '<ratee>', true);
--      That comment vanishes from `get_my_peer_results` for the ratee, still
--      appears in `get_peer_results` for the instructor with `hiddenAt` set,
--      and one audit row is written. Pass false to restore it.
--
--   8. STILL SEALED. As any student:
--        select * from public.peer_ratings;    -- 0 rows
--        select * from public.peer_comments;   -- 0 rows
--      Released results changed nothing about who can read the raw rows.
--
--   9. Results before release raise, even for a targeted student:
--      (test this BEFORE step 4 on a second evaluation)
--        select public.get_my_peer_results('<unreleased eval>');
--        -- 'Those results have not been released yet.'
--
--  10. BACKUP:
--        select public.cp_nightly_backup();
--        select table_name from information_schema.tables
--         where table_schema = 'backup' and table_name like 'peer%';
--      All eight appear. Run it twice — one snapshot per day, not two.
--
--  11. Re-run this whole file. Nothing errors, nothing duplicates.
-- ============================================================================
