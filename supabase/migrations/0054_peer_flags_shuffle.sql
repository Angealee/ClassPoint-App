-- ============================================================================
-- ClassPoint · 0054 · Flagged comments and whole-section group shuffles
-- Run after 0053. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   Two server pieces behind a batch of peer-evaluation improvements whose
--   other parts are client-only:
--
--   1. A peer comment containing a banned word is SAVED, FLAGGED and HIDDEN from
--      the student until the instructor reviews it (the instructor's call,
--      2026-09-14). One tap on the results board restores a fair one.
--
--   2. `apply_peer_group_plan` saves an entire shuffle in ONE transaction. The
--      client draws the random groups so the instructor can preview and
--      reshuffle; this function writes exactly what was previewed.
--
-- ── FLAGGED, NOT REFUSED ────────────────────────────────────────────────────
--   The Lounge refuses a banned word at post time. A peer comment is different:
--   the list includes Filipino words like "bobo" and "tanga", which a blunt but
--   honest comment could use, and refusing would teach students to soften
--   feedback the instructor needs to read. So the comment is kept, and the
--   decision about whether the student sees it moves to the instructor.
--
--   `flagged` is separate from `hidden_at` on purpose. Hiding is what the
--   instructor controls; flagged is a permanent record that the filter tripped.
--   A restored comment stays flagged, so "this was flagged and I let it through"
--   remains visible on the board.
--
--   The submitting student is NOT told. Telling them would be a filter-probing
--   tool: rephrase until the warning disappears.
--
-- ── ONE DEFINITION OF THE MATCH ─────────────────────────────────────────────
--   `cp_contains_banned_word(text)` is new and uses the exact rule 0020 and 0042
--   inline: lowercase, whole-word regex against `leaderboard_banned_words`. Those
--   two inline copies predate it and live in applied migrations, so they are
--   left alone; anything new asks this function.
--
-- ── OWNERSHIP MOVES ─────────────────────────────────────────────────────────
--   submit_peer_evaluation   0050 → 0054   same signature; comment insert grows
--   get_peer_results         0052 → 0054   same return type; comments carry `flagged`
--
--   Both bodies were copied forward PROGRAMMATICALLY from their owners and then
--   diffed, not retyped — a 190-line copy-forward is exactly where a
--   transcription error lives. 0050 and 0052 were not edited.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The column
-- ----------------------------------------------------------------------------
alter table public.peer_comments
  add column if not exists flagged boolean not null default false;

comment on column public.peer_comments.flagged is
  'True when the banned-word filter matched at submit (0054). Permanent: a comment '
  'the instructor restored stays flagged. Visibility is hidden_at, not this.';

-- ----------------------------------------------------------------------------
-- 2. The match
--
--    Stable, not immutable: it reads a table the instructor can edit without a
--    migration. Revoked from the API roles — every caller is a definer, and a
--    student should not be able to test words against the list.
-- ----------------------------------------------------------------------------
create or replace function public.cp_contains_banned_word(p_text text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_text is not null and exists (
    select 1 from public.leaderboard_banned_words w
     where lower(p_text) ~ ('\m' || w.word || '\M')
  );
$$;

revoke execute on function public.cp_contains_banned_word(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Ownership move: submit_peer_evaluation 0050 → 0054
--
--    Body carried forward from 0050 verbatim except the comment insert, which
--    now sets `flagged` and `hidden_at` from the filter.
-- ----------------------------------------------------------------------------
drop function if exists public.submit_peer_evaluation(uuid, jsonb, jsonb);
create function public.submit_peer_evaluation(
  p_eval     uuid,
  p_ratings  jsonb,
  p_comments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := public.cp_my_student_id();
  v_eval     public.peer_evaluations;
  v_section  uuid;
  v_group    uuid;
  v_peers    uuid[];
  v_crit     uuid[];
  v_ratings  jsonb := coalesce(p_ratings,  '[]'::jsonb);
  v_comments jsonb := coalesce(p_comments, '[]'::jsonb);
  v_sub      uuid;
begin
  if public.cp_peer_eval_state() <> 'open' then
    raise exception 'Peer evaluation is paused right now.';
  end if;
  if v_me is null then
    raise exception 'Only a student can submit an evaluation.';
  end if;
  if jsonb_typeof(v_ratings) <> 'array' or jsonb_typeof(v_comments) <> 'array' then
    raise exception 'Malformed submission.';
  end if;

  select * into v_eval from public.peer_evaluations where id = p_eval;
  if v_eval.id is null then
    raise exception 'That evaluation does not exist.';
  end if;
  if v_eval.status <> 'open' then
    raise exception 'That evaluation has closed.';
  end if;
  -- The deadline is ENFORCED, not merely displayed. peer2peer showed it in the
  -- UI and never checked it on write.
  if v_eval.closes_at is not null and now() >= v_eval.closes_at then
    raise exception 'That evaluation has closed.';
  end if;

  select s.section_id into v_section
    from public.students s
   where s.id = v_me and s.archived_at is null;

  if v_section is null or not exists (
    select 1 from public.peer_evaluation_sections t
     where t.evaluation_id = p_eval and t.section_id = v_section
  ) then
    raise exception 'That evaluation is not open to you.';
  end if;

  if exists (
    select 1 from public.peer_submissions
     where evaluation_id = p_eval and evaluator_id = v_me
  ) then
    -- Checked before the expensive work AND enforced by the unique constraint
    -- below, because a stale tab can race this.
    raise exception 'You have already submitted this evaluation. It cannot be changed.';
  end if;

  select array_agg(ps.peer_id) into v_peers from public.cp_peer_set(p_eval, v_me) ps;
  if v_peers is null or array_length(v_peers, 1) = 0 then
    raise exception 'You have no peers to evaluate in this one.';
  end if;

  select array_agg(c.id) into v_crit
    from public.peer_criteria c where c.evaluation_id = p_eval;
  if v_crit is null then
    raise exception 'That evaluation has no criteria yet.';
  end if;

  -- ── The ratee set must EXACTLY equal the peer set ──────────────────────
  -- Both directions. One direction alone lets either a missing peer or a
  -- stranger through, and each is a different kind of wrong.
  if exists (
    select 1 from jsonb_to_recordset(v_ratings) as r(ratee_id uuid)
     where r.ratee_id is null or not (r.ratee_id = any (v_peers))
  ) then
    raise exception 'That submission rates someone who is not one of your peers.';
  end if;
  if exists (
    select 1 from unnest(v_peers) as p(id)
     where not exists (
       select 1 from jsonb_to_recordset(v_ratings) as r(ratee_id uuid)
        where r.ratee_id = p.id
     )
  ) then
    raise exception 'Rate every peer before submitting.';
  end if;

  -- ── Every criterion covered for every ratee, exactly once ──────────────
  if exists (
    select 1
      from unnest(v_peers) as p(id)
      cross join unnest(v_crit) as c(id)
     where not exists (
       select 1 from jsonb_to_recordset(v_ratings) as r(ratee_id uuid, criterion_id uuid)
        where r.ratee_id = p.id and r.criterion_id = c.id
     )
  ) then
    raise exception 'Answer every question for every peer before submitting.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_ratings) as r(ratee_id uuid, criterion_id uuid)
     where r.criterion_id is null or not (r.criterion_id = any (v_crit))
     -- A criterion from ANOTHER evaluation: peer2peer never checked this, so a
     -- crafted request could file scores against a criterion it did not own.
  ) then
    raise exception 'That submission answers a question from a different evaluation.';
  end if;
  if exists (
    select r.ratee_id, r.criterion_id
      from jsonb_to_recordset(v_ratings) as r(ratee_id uuid, criterion_id uuid)
     group by r.ratee_id, r.criterion_id
    having count(*) > 1
  ) then
    raise exception 'That submission answers the same question twice.';
  end if;

  -- ── Every score must be a value in THAT criterion's own scale ──────────
  -- Not a range check: on a scale of 1/3/5 the number 2 is out of bounds even
  -- though it lies between the ends.
  if exists (
    select 1
      from jsonb_to_recordset(v_ratings) as r(criterion_id uuid, score integer)
      join public.peer_criteria c on c.id = r.criterion_id
     where r.score is null
        or not exists (
          select 1 from jsonb_array_elements(c.scale) opt
           where (opt ->> 'value')::integer = r.score
        )
  ) then
    raise exception 'That submission uses a rating that is not on the scale.';
  end if;

  -- ── Comments: one per peer, about a peer, within length ────────────────
  if exists (
    select 1 from jsonb_to_recordset(v_comments) as c(ratee_id uuid, body text)
     where c.ratee_id is null or not (c.ratee_id = any (v_peers))
  ) then
    raise exception 'That submission comments on someone who is not one of your peers.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_comments) as c(ratee_id uuid, body text)
     where length(btrim(coalesce(c.body, ''))) > 400
  ) then
    raise exception 'A comment is at most 400 characters.';
  end if;
  if exists (
    select c.ratee_id
      from jsonb_to_recordset(v_comments) as c(ratee_id uuid)
     group by c.ratee_id having count(*) > 1
  ) then
    raise exception 'That submission leaves two comments for one peer.';
  end if;

  -- The group is SNAPSHOT here, so regrouping later never rewrites history.
  select m.group_id into v_group
    from public.peer_group_members m
   where m.student_id = v_me and m.section_id = v_section;

  begin
    insert into public.peer_submissions (evaluation_id, evaluator_id, section_id, group_id)
         values (p_eval, v_me, v_section, v_group)
      returning id into v_sub;
  exception when unique_violation then
    -- The race the early check above cannot close.
    raise exception 'You have already submitted this evaluation. It cannot be changed.';
  end;

  insert into public.peer_ratings
         (submission_id, evaluation_id, evaluator_id, ratee_id, criterion_id, score)
  select v_sub, p_eval, v_me, r.ratee_id, r.criterion_id, r.score
    from jsonb_to_recordset(v_ratings) as r(ratee_id uuid, criterion_id uuid, score integer);

  -- Empty comments are simply not stored. A blank row would make "did they
  -- leave feedback" unanswerable without inspecting the string.
  --
  -- 0054: a comment containing a banned word is SAVED, flagged, and hidden from
  -- the student until the instructor reviews it. The student is not told —
  -- telling them would turn this into a tool for probing the word list.
  insert into public.peer_comments
         (submission_id, ratee_id, evaluator_id, evaluation_id, body, flagged, hidden_at)
  select v_sub, c.ratee_id, v_me, p_eval, btrim(c.body),
         f.hit,
         case when f.hit then now() end
    from jsonb_to_recordset(v_comments) as c(ratee_id uuid, body text)
    cross join lateral (select public.cp_contains_banned_word(c.body) as hit) f
   where length(btrim(coalesce(c.body, ''))) > 0;

  return v_sub;
end;
$$;

grant execute on function public.submit_peer_evaluation(uuid, jsonb, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Ownership move: get_peer_results 0052 → 0054
--
--    Body carried forward from 0052 verbatim except that each comment now
--    carries `flagged`, and flagged comments sort first for their student.
-- ----------------------------------------------------------------------------
create or replace function public.get_peer_results(p_eval uuid, p_section uuid default null)
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
               'flagged',       pc.flagged,
               'createdAt',     pc.created_at
             -- Flagged first within each student, so the ones waiting on a
             -- decision are at the top of the card that holds them.
             ) order by pc.flagged desc, pc.created_at)
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
   and (public.cp_peer_in_audience(p_eval, stu.id) or coalesce(rt.n, 0) > 0)
 -- Lowest first. This board is read to find who needs a conversation, and
 -- alphabetical order buries that on page two. Unrated students sort last
 -- rather than first: they are a data gap, not a low score.
 order by a.o_pct asc nulls last, stu.full_name;
end;
$$;

grant execute on function public.get_peer_results(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Backfill the flag on comments that already exist
--
--    Only rows with `flagged = false` are touched, which is what makes a re-run
--    safe: a comment the instructor has since RESTORED is already flagged and is
--    never re-hidden by pasting this file again.
--
--    Hidden only where results are NOT yet released. A released comment has
--    already been read, so hiding it now would make something a student saw
--    vanish; it is flagged for the instructor instead, who can still hide it.
--
--    A re-run weeks later applies the list as it stands THEN, so a word added to
--    the list since will flag (and, before release, hide) matching comments.
-- ----------------------------------------------------------------------------
update public.peer_comments pc
   set flagged   = true,
       hidden_at = case
                     when pc.hidden_at is null and e.results_released_at is null then now()
                     else pc.hidden_at
                   end
  from public.peer_evaluations e
 where e.id = pc.evaluation_id
   and pc.flagged = false
   and public.cp_contains_banned_word(pc.body);

-- ----------------------------------------------------------------------------
-- 6. Save a whole group shuffle, atomically
--
--    `p_groups` : [{"name": text, "studentIds": [uuid, …]}, …]
--
--    WHY THE CLIENT SHUFFLES AND THIS FUNCTION ONLY WRITES. The instructor
--    previews the random groups and may reshuffle several times before saving.
--    A server-side shuffle would save a DIFFERENT random draw from the one on
--    screen. So the draw happens in `src/lib/peer-shuffle.ts` (tested), and this
--    function validates it and writes it exactly.
--
--    WHY ONE FUNCTION AND NOT create_peer_group × N. Ten groups is ten creates
--    and ten membership saves; a dropped connection at the sixth leaves a
--    section half-regrouped with nothing on screen saying so. Here any failure
--    rolls back everything, including the archiving in replace mode, so every
--    refusal can truthfully say nothing was changed.
--
--    `p_replace` false (the default in the sheet): only students on no team may
--    appear, and existing teams are untouched. True: every live group in the
--    section is archived first — their memberships go into one audit row — and
--    the whole roster may be placed. Past evaluations keep the teams they used:
--    submissions snapshot `group_id`, and archived groups keep their rows.
-- ----------------------------------------------------------------------------
drop function if exists public.apply_peer_group_plan(uuid, boolean, jsonb);
create function public.apply_peer_group_plan(p_section uuid, p_replace boolean, p_groups jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan     jsonb := coalesce(p_groups, '[]'::jsonb);
  v_el       jsonb;
  v_name     text;
  v_all      uuid[] := '{}'::uuid[];
  v_gid      uuid;
  v_order    integer;
  v_archived jsonb := '[]'::jsonb;
  v_made     integer := 0;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can build groups.';
  end if;

  if not exists (select 1 from public.sections where id = p_section) then
    raise exception 'That section does not exist.';
  end if;

  if jsonb_typeof(v_plan) <> 'array' or jsonb_array_length(v_plan) = 0 then
    raise exception 'There are no groups to create.';
  end if;
  if jsonb_array_length(v_plan) > 100 then
    raise exception 'That is more groups than one section can hold.';
  end if;

  -- Shape, names and sizes, collecting every student id as we go.
  for v_el in select value from jsonb_array_elements(v_plan) loop
    if jsonb_typeof(v_el) <> 'object' or jsonb_typeof(v_el -> 'studentIds') <> 'array' then
      raise exception 'Malformed group plan.';
    end if;

    v_name := btrim(coalesce(v_el ->> 'name', ''));
    if length(v_name) = 0 or length(v_name) > 40 then
      raise exception 'Every group needs a name of 40 characters or fewer.';
    end if;

    -- A group of one has nobody to rate. The sheet cannot produce it; this
    -- stops anything else from.
    if jsonb_array_length(v_el -> 'studentIds') < 2 then
      raise exception 'Every group needs at least two students.';
    end if;

    select v_all || array_agg(t.sid::uuid)
      into v_all
      from jsonb_array_elements_text(v_el -> 'studentIds') as t(sid);
  end loop;

  if exists (
    select lower(btrim(e ->> 'name'))
      from jsonb_array_elements(v_plan) as e
     group by 1
    having count(*) > 1
  ) then
    raise exception 'Two groups in that plan share a name. Nothing was changed.';
  end if;

  if (select count(*) from unnest(v_all)) <> (select count(distinct u) from unnest(v_all) as u) then
    raise exception 'A student appears in more than one group. Nothing was changed.';
  end if;

  if exists (
    select 1 from unnest(v_all) as t(sid)
     where not exists (
       select 1 from public.students s
        where s.id = t.sid
          and s.section_id = p_section
          and s.archived_at is null
     )
  ) then
    raise exception 'Only active students of this section can be placed. Nothing was changed.';
  end if;

  if p_replace then
    -- Record what is about to be retired, then retire it. Same effect as
    -- archive_peer_group on each, in one audit row rather than ten.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id',      g.id,
             'name',    g.name,
             'members', coalesce((
                          select jsonb_agg(m.student_id)
                            from public.peer_group_members m
                           where m.group_id = g.id
                        ), '[]'::jsonb)
           ) order by g.sort_order), '[]'::jsonb)
      into v_archived
      from public.peer_groups g
     where g.section_id = p_section
       and g.archived_at is null;

    delete from public.peer_group_members m
     using public.peer_groups g
     where m.group_id = g.id
       and g.section_id = p_section
       and g.archived_at is null;

    update public.peer_groups
       set archived_at = now()
     where section_id = p_section
       and archived_at is null;
  else
    -- Checked for a readable refusal. The unique (section_id, student_id)
    -- constraint would stop it anyway, with an index name for a message.
    if exists (
      select 1
        from public.peer_group_members m
       where m.section_id = p_section
         and m.student_id = any (v_all)
    ) then
      raise exception
        'Some of those students were placed on a team since you shuffled. Shuffle again. Nothing was changed.';
    end if;
  end if;

  select coalesce(max(g.sort_order), 0) into v_order
    from public.peer_groups g
   where g.section_id = p_section;

  for v_el in select value from jsonb_array_elements(v_plan) loop
    v_order := v_order + 1;
    v_name := btrim(v_el ->> 'name');

    begin
      insert into public.peer_groups (section_id, name, sort_order)
           values (p_section, v_name, v_order)
        returning id into v_gid;
    exception when unique_violation then
      -- Raising here rolls back the whole function, archiving included, so the
      -- sentence is true.
      raise exception 'This section already has a group called "%". Nothing was changed.', v_name;
    end;

    -- `section_id` is overwritten by 0049's trigger from the group regardless.
    insert into public.peer_group_members (group_id, student_id, section_id)
    select v_gid, t.sid::uuid, p_section
      from jsonb_array_elements_text(v_el -> 'studentIds') as t(sid);

    v_made := v_made + 1;
  end loop;

  if p_replace then
    insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
    values (auth.uid(), 'peer_group', 'peer_groups', null,
            format('Reshuffled groups: archived %s, created %s',
                   jsonb_array_length(v_archived), v_made),
            jsonb_build_object(
              'section_id', p_section,
              'archived',   v_archived,
              'created',    v_plan
            ));
  end if;

  return v_made;
end;
$$;

grant execute on function public.apply_peer_group_plan(uuid, boolean, jsonb) to authenticated;

-- ============================================================================
-- VERIFY (as the instructor unless a step says otherwise)
--
--   1. THE FILTER. As a student, submit an evaluation with one comment that
--      contains a listed word and one that does not. Then, as the instructor:
--        select body, flagged, hidden_at from public.peer_comments
--         where evaluation_id = '<eval>';
--      The listed one: flagged true, hidden_at set. The other: false, null.
--      Word boundaries hold: a comment containing "class" is NOT flagged by "ass".
--
--   2. Close and release it. As the rated student:
--        select public.get_my_peer_results('<eval>');
--      The flagged comment is absent. Restore it:
--        select public.set_peer_comment_hidden('<submission>', '<ratee>', false);
--      It now appears, and peer_comments.flagged is STILL true.
--
--   3. get_peer_results carries the flag, flagged comments first per student:
--        select comments from public.get_peer_results('<eval>');
--
--   4. BACKFILL IS RE-RUN SAFE. With the comment from step 2 restored, paste
--      this whole file again. hidden_at on that comment stays null.
--
--   5. A SHUFFLE, unassigned only. On a section where some students are on no
--      team:
--        select public.apply_peer_group_plan('<section>', false,
--          '[{"name":"Group 3","studentIds":["<s1>","<s2>","<s3>"]}]'::jsonb);
--      Returns 1. Existing groups untouched.
--
--   6. The refusals, each leaving the section exactly as it was:
--        -- a student already on a team, with p_replace false
--        -- the same student in two groups of the plan
--        -- a group of one
--        -- a student from another section
--        -- a name that matches a live group ("Group 3" again)
--
--   7. REPLACE. select public.apply_peer_group_plan('<section>', true, '<plan>');
--      Every previous live group is archived, one 'peer_group' audit row lists
--      them with their members, and the new groups hold exactly the plan.
--      An evaluation that used the old groups still shows them on its results.
--
--   8. As a STUDENT: apply_peer_group_plan raises, and
--        select public.cp_contains_banned_word('x');   -- permission denied
--
--   9. Re-run this whole file. Nothing errors.
-- ============================================================================
