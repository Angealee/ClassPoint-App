-- ============================================================================
-- ClassPoint · 0052 · Target an evaluation at specific groups
-- Run after 0051. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   A "Within groups" evaluation used to mean every group in the chosen
--   sections. The instructor could not aim one at Team Alpha alone. This adds
--   `peer_evaluation_groups`: when an evaluation has rows there, ONLY those
--   groups take part.
--
-- ── NO ROWS MEANS ALL GROUPS, AND THAT IS WHAT KEEPS THIS SAFE ──────────────
--   Every evaluation created before this file has no rows in the new table, so
--   it keeps meaning exactly what it meant: every group in its sections, with
--   unplaced students shown as not applicable. No backfill, nothing rewritten.
--
--   The composer follows the same rule (the instructor's call, 2026-09-14):
--   groups appear pre-ticked, and when every group is left ticked it sends NO
--   list. So ignoring the new control produces today's behaviour exactly,
--   including a group created after the evaluation opens.
--
--   The test is "does this evaluation have ANY rows", never "any rows for a
--   live group". If every picked group is later archived the evaluation must
--   reach nobody — silently widening it back to the whole section would send
--   it to students the instructor deliberately left out.
--
-- ── ONE ANSWER TO "IS THIS STUDENT PART OF IT" ──────────────────────────────
--   `cp_peer_in_audience(eval, student)` is new, and everything that decides
--   who is in an evaluation now asks it:
--     • `cp_peer_set`             — no audience, no peers, so submit refuses
--     • `cp_peer_eval_targets_me` — backs the RLS policies, so a student in an
--                                   unpicked group never sees the evaluation
--                                   at all (the instructor's call)
--     • `get_peer_completion`, `get_peer_results` — the instructor's views
--                                   leave those students off rather than
--                                   burying the real audience in "Not
--                                   applicable" rows
--   Narrowing therefore happens in one function, not in five places that could
--   disagree about the same student.
--
--   A student who SUBMITTED or WAS RATED stays visible to their own evaluation
--   even if they are moved to another team afterwards. Their words are already
--   in it; history must not vanish because of a regroup.
--
-- ── OWNERSHIP MOVES ─────────────────────────────────────────────────────────
--   cp_peer_eval_targets_me   0050 → 0052   same signature, create or replace
--   cp_peer_set               0050 → 0052   same signature, create or replace
--   get_peer_completion       0050 → 0052   same return type, create or replace
--   list_peer_evaluations     0050 → 0052   return type GROWS (group_names), drop-first
--   create_peer_evaluation    0050 → 0052   SIGNATURE CHANGES (+p_groups), drop-first
--   update_peer_evaluation    0050 → 0052   SIGNATURE CHANGES (+p_groups), drop-first
--   get_peer_results          0051 → 0052   same return type, create or replace
--   cp_nightly_backup         0051 → 0052   same signature, gains the new table
--
--   ⚠ 0050 AND 0051 MUST NOT BE EDITED. They are applied; a changed applied
--   migration is exactly how 0042's rename broke the room panel.
--
--   The two signature changes drop the OLD exact signature before creating the
--   new one. A `create or replace` with a different parameter list creates an
--   OVERLOAD, and PostgREST then rejects every call as ambiguous (the 0028
--   lesson). `p_groups` is the LAST parameter with a default, so a cached client
--   bundle that does not send it still resolves to the new function.
--
-- ── A 0050 BUG FIXED ON THE WAY THROUGH ─────────────────────────────────────
--   `cp_peer_set`'s group branch matched membership without checking the
--   section. `peer_group_members` allows one row per student PER SECTION, so a
--   student promoted at rollover keeps last semester's row — and would have
--   been handed last semester's teammates as peers. Both sides of the join now
--   require the student's current section.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The table
--
--    Instructor-select only, no write policies, the 0049 shape. Students learn
--    nothing from it directly; they simply stop seeing evaluations aimed at
--    other teams.
-- ----------------------------------------------------------------------------
create table if not exists public.peer_evaluation_groups (
  evaluation_id uuid not null references public.peer_evaluations(id) on delete cascade,
  -- Cascade only fires on a section delete: groups are archived, never deleted.
  -- An archived group keeps its row here on purpose — see the header.
  group_id      uuid not null references public.peer_groups(id)      on delete cascade,
  primary key (evaluation_id, group_id)
);

create index if not exists peer_evaluation_groups_group_idx
  on public.peer_evaluation_groups (group_id);

alter table public.peer_evaluation_groups enable row level security;

drop policy if exists peer_evaluation_groups_select on public.peer_evaluation_groups;
create policy peer_evaluation_groups_select on public.peer_evaluation_groups
  for select to authenticated using (public.is_instructor());

grant select on public.peer_evaluation_groups to authenticated;

-- ----------------------------------------------------------------------------
-- 2. The audience — ONE definition
--
--    In the audience when the student is active, their section is targeted,
--    and either the evaluation is section-wide, or it names no groups (all
--    groups), or their current group is one it names.
--
--    Revoked from the API roles. Every caller is a security-definer function,
--    and a student has no business asking whether a particular classmate is on
--    a targeted team.
-- ----------------------------------------------------------------------------
create or replace function public.cp_peer_in_audience(p_eval uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.students s
      join public.peer_evaluation_sections t
        on t.section_id = s.section_id
       and t.evaluation_id = p_eval
      join public.peer_evaluations e
        on e.id = p_eval
     where s.id = p_student
       and s.archived_at is null
       and (
         e.scope = 'section'
         -- No rows = all groups. The pre-0052 meaning, kept for every
         -- evaluation that existed before this file and for any evaluation
         -- opened with every group left ticked.
         or not exists (
           select 1 from public.peer_evaluation_groups pg
            where pg.evaluation_id = p_eval
         )
         or exists (
           select 1
             from public.peer_group_members m
             join public.peer_evaluation_groups pg
               on pg.group_id = m.group_id
              and pg.evaluation_id = p_eval
            where m.student_id = s.id
              and m.section_id = s.section_id
         )
       )
  );
$$;

revoke execute on function public.cp_peer_in_audience(uuid, uuid)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Ownership move: cp_peer_eval_targets_me 0050 → 0052
--
--    This is what the RLS policies on `peer_evaluations`, its sections and its
--    criteria call, and what `get_peer_evaluation` and `get_my_peer_results`
--    gate on. Narrowing it here is what makes an evaluation aimed at other
--    teams invisible to a student rather than merely unanswerable.
--
--    The two extra branches keep a student's OWN history reachable after a
--    regroup: someone who submitted, or who was rated, stays able to see the
--    evaluation and read released results about themselves.
-- ----------------------------------------------------------------------------
create or replace function public.cp_peer_eval_targets_me(p_eval uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cp_peer_in_audience(p_eval, public.cp_my_student_id())
      or exists (
           select 1 from public.peer_submissions sm
            where sm.evaluation_id = p_eval
              and sm.evaluator_id = public.cp_my_student_id()
         )
      or exists (
           select 1 from public.peer_ratings r
            where r.evaluation_id = p_eval
              and r.ratee_id = public.cp_my_student_id()
         );
$$;

grant execute on function public.cp_peer_eval_targets_me(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Ownership move: cp_peer_set 0050 → 0052
--
--    Still the ONE definition of who your peers are. The audience check at the
--    top is the whole of the narrowing; everything below it is 0050's logic
--    plus the section fix described in the header.
--
--    OUT column stays `peer_id`, not `student_id`, for 0050's reason: a RETURNS
--    TABLE column is a variable in scope and would shadow the member column.
-- ----------------------------------------------------------------------------
create or replace function public.cp_peer_set(p_eval uuid, p_student uuid)
returns table (peer_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scope   text;
  v_section uuid;
begin
  -- Outside the audience: zero peers. Returning empty rather than raising is
  -- what lets callers tell "not part of this one" apart from a fault.
  if not public.cp_peer_in_audience(p_eval, p_student) then
    return;
  end if;

  select e.scope into v_scope from public.peer_evaluations e where e.id = p_eval;
  select s.section_id into v_section from public.students s where s.id = p_student;

  if v_scope = 'section' then
    return query
      select s.id
        from public.students s
       where s.section_id = v_section
         and s.archived_at is null
         and s.id <> p_student;
  else
    return query
      select m2.student_id
        from public.peer_group_members m1
        join public.peer_group_members m2
          on m2.group_id = m1.group_id
         and m2.student_id <> p_student
        join public.students s
          on s.id = m2.student_id
         and s.archived_at is null
         -- A teammate promoted away still holds a membership row in the old
         -- section's group; they are not this student's peer any more.
         and s.section_id = v_section
       where m1.student_id = p_student
         -- The 0050 bug: without this a promoted student matched last
         -- semester's membership row too.
         and m1.section_id = v_section;
  end if;
end;
$$;

grant execute on function public.cp_peer_set(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Ownership move: create_peer_evaluation 0050 → 0052 (signature grows)
--
--    `p_groups` null or empty = all groups, the pre-0052 meaning. Non-empty
--    narrows to exactly those groups, and requires a within-groups evaluation
--    whose chosen sections contain every group named.
--
--    The groups are written BEFORE the notification query, because that query
--    asks `cp_peer_set` who has peers — and that answer depends on them. Written
--    after, a narrowed evaluation would push the whole section.
-- ----------------------------------------------------------------------------
drop function if exists public.create_peer_evaluation(uuid, text, text, text, uuid[], jsonb, timestamptz);
drop function if exists public.create_peer_evaluation(uuid, text, text, text, uuid[], jsonb, timestamptz, uuid[]);
create function public.create_peer_evaluation(
  p_subject      uuid,
  p_title        text,
  p_instructions text,
  p_scope        text,
  p_sections     uuid[],
  p_criteria     jsonb,
  p_closes_at    timestamptz default null,
  p_groups       uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_title    text := btrim(coalesce(p_title, ''));
  v_sections uuid[] := coalesce(p_sections, '{}'::uuid[]);
  v_groups   uuid[] := coalesce(p_groups, '{}'::uuid[]);
  v_crit     jsonb := coalesce(p_criteria, '[]'::jsonb);
  v_el       jsonb;
  v_i        integer := 0;
  v_ids      uuid[];
  v_chunk    uuid[];
  v_total    integer;
  v_n        integer;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can create an evaluation.';
  end if;

  if length(v_title) = 0 or length(v_title) > 80 then
    raise exception 'Give the evaluation a title of 80 characters or fewer.';
  end if;
  if p_scope not in ('section', 'group') then
    raise exception 'Scope must be section or group.';
  end if;
  if array_length(v_sections, 1) is null then
    raise exception 'Pick at least one section.';
  end if;
  if jsonb_typeof(v_crit) <> 'array' or jsonb_array_length(v_crit) = 0 then
    raise exception 'Add at least one criterion.';
  end if;
  if jsonb_array_length(v_crit) > 10 then
    raise exception 'An evaluation has at most 10 criteria.';
  end if;
  if not exists (select 1 from public.subjects where id = p_subject) then
    raise exception 'That subject does not exist.';
  end if;

  -- Every targeted section must actually take this subject. Without it an
  -- evaluation can be filed under a subject its students never sit.
  if exists (
    select 1 from unnest(v_sections) as t(section_id)
     where not exists (
       select 1 from public.section_subjects ss
        where ss.section_id = t.section_id and ss.subject_id = p_subject
     )
  ) then
    raise exception 'Every section you pick must be taking that subject.';
  end if;

  -- Picked groups only make sense within groups, and each must be a live group
  -- in one of the chosen sections. Without the section check an evaluation for
  -- BSIT 2A could name a team from 2B, whose members would then be in the
  -- audience of a section that is not theirs — and see nothing, while the
  -- instructor waited on them.
  if array_length(v_groups, 1) is not null then
    if p_scope <> 'group' then
      raise exception 'Groups can only be picked for a within-groups evaluation.';
    end if;
    if exists (
      select 1 from unnest(v_groups) as x(group_id)
       where not exists (
         select 1 from public.peer_groups g
          where g.id = x.group_id
            and g.archived_at is null
            and g.section_id = any (v_sections)
       )
    ) then
      raise exception 'Every group you pick must be a current group in one of the chosen sections.';
    end if;
  end if;

  insert into public.peer_evaluations (subject_id, title, instructions, scope, closes_at)
       values (p_subject, v_title, nullif(btrim(coalesce(p_instructions, '')), ''),
               p_scope, p_closes_at)
    returning id into v_id;

  insert into public.peer_evaluation_sections (evaluation_id, section_id)
  select v_id, t.section_id from unnest(v_sections) as t(section_id)
  on conflict do nothing;

  -- Before the notification query, which depends on it. See the section note.
  insert into public.peer_evaluation_groups (evaluation_id, group_id)
  select v_id, x.group_id from unnest(v_groups) as x(group_id)
  on conflict do nothing;

  for v_el in select value from jsonb_array_elements(v_crit) loop
    v_i := v_i + 1;
    insert into public.peer_criteria (evaluation_id, label, scale, sort_order)
         values (v_id,
                 btrim(coalesce(v_el ->> 'label', '')),
                 public.cp_peer_scale_clean(v_el -> 'scale'),
                 v_i);
  end loop;

  -- ── Notify (decision 15: Open and Released, nothing else) ──────────────
  -- Only students who ACTUALLY have peers. In a group-scoped evaluation an
  -- unplaced student would otherwise be pushed toward a form that can only
  -- tell them they are not on a team — and in a narrowed one, a student on
  -- an unpicked team would be pushed toward an evaluation they cannot see.
  with targets as (
    select s.id
      from public.students s
      join public.peer_evaluation_sections t on t.section_id = s.section_id
     where t.evaluation_id = v_id
       and s.archived_at is null
       and (select count(*) from public.cp_peer_set(v_id, s.id)) > 0
  ), inserted as (
    insert into public.notifications (student_id, type, title, body, url)
    select t.id, 'peer_eval_open',
           'Peer evaluation open',
           format('%s — rate your teammates before it closes.', v_title),
           format('/app/peer/%s', v_id)
      from targets t
    returning id
  )
  select array_agg(id) into v_ids from inserted;

  v_total := coalesce(array_length(v_ids, 1), 0);

  -- Audit BEFORE dispatch, so the record survives a push failure. pg_net is
  -- fire-and-forget anyway.
  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
  values (auth.uid(), 'peer_eval', 'peer_evaluations', v_id,
          format('Created peer evaluation "%s" for %s student(s)', v_title, v_total),
          jsonb_build_object(
            'title', v_title, 'scope', p_scope, 'subject_id', p_subject,
            'sections', to_jsonb(v_sections), 'groups', to_jsonb(v_groups),
            'closes_at', p_closes_at, 'notified', v_total
          ));

  -- Chunked at 50: cp_push_dispatch puts every id in ONE HTTP body and was
  -- written for one-or-two-id calls (the 0034 lesson).
  v_n := 1;
  while v_n <= v_total loop
    v_chunk := v_ids[v_n : v_n + 49];
    perform public.cp_push_dispatch(v_chunk);
    v_n := v_n + 50;
  end loop;

  return v_id;
end;
$$;

grant execute on function public.create_peer_evaluation(uuid, text, text, text, uuid[], jsonb, timestamptz, uuid[])
  to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Ownership move: update_peer_evaluation 0050 → 0052 (signature grows)
--
--    `p_groups` null leaves the groups alone; an EMPTY array resets to all
--    groups; a non-empty array replaces the list. Null and empty mean different
--    things here, so no companion flag is needed the way `p_set_closes_at` was.
--
--    Groups lock on the first submission along with sections and criteria —
--    changing who is in the audience changes who a submitted rating was among.
--
--    When sections change, any picked group whose section is no longer
--    targeted is pruned, so the list can never name a team outside the
--    evaluation's own sections.
-- ----------------------------------------------------------------------------
drop function if exists public.update_peer_evaluation(uuid, text, text, uuid[], jsonb, timestamptz, boolean);
drop function if exists public.update_peer_evaluation(uuid, text, text, uuid[], jsonb, timestamptz, boolean, uuid[]);
create function public.update_peer_evaluation(
  p_eval          uuid,
  p_title         text default null,
  p_instructions  text default null,
  p_sections      uuid[] default null,
  p_criteria      jsonb default null,
  p_closes_at     timestamptz default null,
  p_set_closes_at boolean default false,
  p_groups        uuid[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eval   public.peer_evaluations;
  v_locked boolean;
  v_el     jsonb;
  v_i      integer := 0;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can edit an evaluation.';
  end if;

  select * into v_eval from public.peer_evaluations where id = p_eval;
  if v_eval.id is null then
    raise exception 'That evaluation does not exist.';
  end if;

  v_locked := exists (select 1 from public.peer_submissions where evaluation_id = p_eval);

  if v_locked and (p_sections is not null or p_criteria is not null or p_groups is not null) then
    raise exception
      'Someone has already submitted, so the questions and who they apply to are locked. '
      'The title, instructions and deadline can still change.';
  end if;

  update public.peer_evaluations
     set title        = coalesce(nullif(btrim(coalesce(p_title, '')), ''), title),
         instructions = case
                          when p_instructions is null then instructions
                          else nullif(btrim(p_instructions), '')
                        end,
         -- An explicit flag, because null is a MEANING here (no deadline) and
         -- cannot also mean "leave it alone".
         closes_at    = case when p_set_closes_at then p_closes_at else closes_at end
   where id = p_eval;

  if p_sections is not null then
    if array_length(p_sections, 1) is null then
      raise exception 'Pick at least one section.';
    end if;
    delete from public.peer_evaluation_sections
     where evaluation_id = p_eval and not (section_id = any (p_sections));
    insert into public.peer_evaluation_sections (evaluation_id, section_id)
    select p_eval, t.section_id from unnest(p_sections) as t(section_id)
    on conflict do nothing;

    -- A picked group whose section just left the evaluation cannot stay named.
    delete from public.peer_evaluation_groups pg
     where pg.evaluation_id = p_eval
       and not exists (
         select 1
           from public.peer_groups g
           join public.peer_evaluation_sections t
             on t.section_id = g.section_id
            and t.evaluation_id = p_eval
          where g.id = pg.group_id
       );
  end if;

  if p_groups is not null then
    if array_length(p_groups, 1) is not null then
      if v_eval.scope <> 'group' then
        raise exception 'Groups can only be picked for a within-groups evaluation.';
      end if;
      -- Checked against the sections as they stand NOW, after any change above.
      if exists (
        select 1 from unnest(p_groups) as x(group_id)
         where not exists (
           select 1
             from public.peer_groups g
             join public.peer_evaluation_sections t
               on t.section_id = g.section_id
              and t.evaluation_id = p_eval
            where g.id = x.group_id
              and g.archived_at is null
         )
      ) then
        raise exception 'Every group you pick must be a current group in one of the chosen sections.';
      end if;
    end if;

    delete from public.peer_evaluation_groups where evaluation_id = p_eval;
    insert into public.peer_evaluation_groups (evaluation_id, group_id)
    select p_eval, x.group_id from unnest(p_groups) as x(group_id)
    on conflict do nothing;
  end if;

  if p_criteria is not null then
    if jsonb_typeof(p_criteria) <> 'array' or jsonb_array_length(p_criteria) = 0 then
      raise exception 'Add at least one criterion.';
    end if;
    -- Safe to replace wholesale ONLY because we are past the lock check: with
    -- no submissions there is nothing referencing these rows.
    delete from public.peer_criteria where evaluation_id = p_eval;
    for v_el in select value from jsonb_array_elements(p_criteria) loop
      v_i := v_i + 1;
      insert into public.peer_criteria (evaluation_id, label, scale, sort_order)
           values (p_eval,
                   btrim(coalesce(v_el ->> 'label', '')),
                   public.cp_peer_scale_clean(v_el -> 'scale'),
                   v_i);
    end loop;
  end if;
end;
$$;

grant execute on function public.update_peer_evaluation(uuid, text, text, uuid[], jsonb, timestamptz, boolean, uuid[])
  to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Ownership move: list_peer_evaluations 0050 → 0052 (return type grows)
--
--    Gains `group_names`, empty for an all-groups or section-wide evaluation.
--    Without it two evaluations for the same section — one for everybody, one
--    for a single team — read identically on the console.
-- ----------------------------------------------------------------------------
drop function if exists public.list_peer_evaluations(uuid);
create function public.list_peer_evaluations(p_semester uuid default null)
returns table (
  id                  uuid,
  title               text,
  subject_code        text,
  subject_name        text,
  scope               text,
  status              text,
  closes_at           timestamptz,
  closed_at           timestamptz,
  results_released_at timestamptz,
  section_names       text[],
  group_names         text[],
  criteria_count      integer,
  submitted_count     integer,
  expected_count      integer,
  created_at          timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can list evaluations.';
  end if;

  return query
  select
    e.id, e.title, sub.code, sub.name, e.scope, e.status,
    e.closes_at, e.closed_at, e.results_released_at,
    coalesce((
      select array_agg(sec.name order by sec.name)
        from public.peer_evaluation_sections t
        join public.sections sec on sec.id = t.section_id
       where t.evaluation_id = e.id
    ), '{}'::text[]),
    coalesce((
      select array_agg(g.name order by g.name)
        from public.peer_evaluation_groups pg
        join public.peer_groups g on g.id = pg.group_id
       where pg.evaluation_id = e.id
    ), '{}'::text[]),
    (select count(*)::integer from public.peer_criteria c where c.evaluation_id = e.id),
    (select count(*)::integer from public.peer_submissions s where s.evaluation_id = e.id),
    -- Expected = everyone who actually has someone to rate. cp_peer_set already
    -- answers for the audience, so a narrowed evaluation counts only its teams.
    (select count(*)::integer
       from public.students s
       join public.peer_evaluation_sections t on t.section_id = s.section_id
      where t.evaluation_id = e.id
        and s.archived_at is null
        and (select count(*) from public.cp_peer_set(e.id, s.id)) > 0),
    e.created_at
  from public.peer_evaluations e
  join public.subjects sub on sub.id = e.subject_id
 where e.semester_id = coalesce(p_semester, public.cp_active_semester_id())
 order by e.created_at desc;
end;
$$;

grant execute on function public.list_peer_evaluations(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Ownership move: get_peer_completion 0050 → 0052
--
--    Leaves off students outside the audience. In an all-groups evaluation
--    that changes nothing (every student in its sections is in the audience,
--    and unplaced ones still show as not applicable). In a narrowed one it
--    stops a five-person team being listed among thirty-five irrelevant rows.
--
--    Anyone who already SUBMITTED stays, even if regrouped out since — their
--    submission is counted in the header figure, and a row that vanished while
--    the count did not would make the two disagree.
-- ----------------------------------------------------------------------------
create or replace function public.get_peer_completion(p_eval uuid)
returns table (
  student_id   uuid,
  display_name text,
  full_name    text,
  avatar_url   text,
  section_name text,
  group_name   text,
  peer_count   integer,
  submitted_at timestamptz,
  applicable   boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read completion.';
  end if;

  return query
  select
    s.id, s.display_name, s.full_name, s.avatar_url,
    sec.name,
    g.name,
    p.n::integer,
    sm.submitted_at,
    (p.n > 0)
  from public.peer_evaluation_sections t
  join public.students s
    on s.section_id = t.section_id and s.archived_at is null
  join public.sections sec on sec.id = s.section_id
  cross join lateral (
    select count(*) as n from public.cp_peer_set(p_eval, s.id)
  ) p
  left join public.peer_group_members m
         on m.student_id = s.id and m.section_id = s.section_id
  left join public.peer_groups g on g.id = m.group_id and g.archived_at is null
  left join public.peer_submissions sm
         on sm.evaluation_id = p_eval and sm.evaluator_id = s.id
 where t.evaluation_id = p_eval
   and (public.cp_peer_in_audience(p_eval, s.id) or sm.submitted_at is not null)
 order by
   -- Outstanding first: this list exists to be chased, so ordering it by name
   -- puts the answer on page two.
   (p.n > 0 and sm.submitted_at is null) desc,
   sec.name, s.full_name;
end;
$$;

grant execute on function public.get_peer_completion(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. Ownership move: get_peer_results 0051 → 0052
--
--    Same body as 0051 with one added condition: a student appears when they
--    are in the audience OR somebody rated them. The second half keeps a rated
--    student on the board after a regroup, because their scores are real.
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
   and (public.cp_peer_in_audience(p_eval, stu.id) or coalesce(rt.n, 0) > 0)
 -- Lowest first. This board is read to find who needs a conversation, and
 -- alphabetical order buries that on page two. Unrated students sort last
 -- rather than first: they are a data gap, not a low score.
 order by a.o_pct asc nulls last, stu.full_name;
end;
$$;

grant execute on function public.get_peer_results(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Ownership move: cp_nightly_backup 0051 → 0052
--
--     Same signature; the `tables` array gains `peer_evaluation_groups`. Which
--     teams an evaluation was aimed at is part of what its results mean, so it
--     is backed up with the rest. The mirror self-creates on first run.
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
    'peer_evaluation_groups'
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
-- VERIFY (as the instructor unless a step says otherwise)
--
--   Setup: a section with three groups, Alpha (3 members), Beta (3), Gamma (3),
--   plus one unplaced student.
--
--   1. NOTHING EXISTING CHANGED. Before creating anything new:
--        select id, expected_count, group_names from public.list_peer_evaluations();
--      Every evaluation from before this file shows the same expected_count it
--      did, and an empty group_names.
--
--   2. Create a narrowed evaluation:
--        select public.create_peer_evaluation(
--          '<subject>', 'Alpha only', null, 'group', array['<section>']::uuid[],
--          '[{"label":"Effort","scale":[{"value":1,"label":"Low"},
--                                       {"value":5,"label":"High"}]}]'::jsonb,
--          null, array['<alpha>']::uuid[]);
--      list_peer_evaluations shows expected_count 3 and group_names {Alpha}.
--      Notifications went to Alpha's three members and nobody else:
--        select student_id from public.notifications
--         where type = 'peer_eval_open' and url like '%<new id>%';
--
--   3. THE ONE THAT MATTERS. As a student on BETA:
--        select * from public.get_my_peer_evaluations();   -- no "Alpha only" row
--        select * from public.peer_evaluations where id = '<new id>';  -- 0 rows
--        select public.get_peer_evaluation('<new id>');     -- raises, not open to you
--      As the UNPLACED student: same three results. As an ALPHA member: the row
--      is there and `peers` holds the other two.
--
--   4. Refusals:
--        -- a group from another section            → 'must be a current group…'
--        -- groups with scope 'section'             → 'only be picked for a within-groups…'
--        -- an archived group                       → 'must be a current group…'
--
--   5. All-groups is unchanged: create one with p_groups null. expected_count
--      counts all three teams (9), and the unplaced student sees it with
--      "not placed in a group", exactly as before.
--
--   6. select * from public.get_peer_completion('<alpha only id>');
--      Three rows, Alpha's members. No Beta, no Gamma, no unplaced student.
--
--   7. REGROUP AFTER SUBMITTING. Have an Alpha member submit, then move them to
--      Beta with set_peer_group_members. They still appear in completion (they
--      submitted), still see the evaluation in their list, and can still read
--      released results about themselves.
--
--   8. THE 0050 FIX. A student promoted to a new section who still has a
--      membership row in their old section's group gets ONLY their new team as
--      peers in a new evaluation — never last semester's teammates.
--
--   9. No overloads left behind:
--        select oid::regprocedure from pg_proc
--         where proname in ('create_peer_evaluation', 'update_peer_evaluation');
--      Exactly ONE row each, both ending in `uuid[]`.
--
--  10. Re-run this whole file. Nothing errors, nothing duplicates.
-- ============================================================================
