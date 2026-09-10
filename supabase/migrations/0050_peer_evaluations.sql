-- ============================================================================
-- ClassPoint · 0050 · Peer evaluations and submission
-- Run after 0049. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   Phase 2 of Peer Evaluation. The instructor defines an evaluation for one
--   subject, scoped to whole sections or to 0049's groups, with criteria that
--   each carry their own rating scale. Students rate every peer on every
--   criterion and may leave one optional comment per peer.
--
--   RESULTS ARE NOT READABLE HERE. 0051 adds the aggregation, the release and
--   the export. Until then the instructor sees WHO has submitted, never what
--   anyone said — which is deliberate ordering, not an unfinished edge: it
--   means the sealing rules below are exercised for a whole phase before any
--   screen is allowed to open them.
--
--   NOTHING IN THIS FILE TOUCHES `point_events`. Points are never turned into a
--   grade, and this feature stays out of the ledger structurally.
--
-- ── SUBMISSION IS FINAL (the instructor's call, 2026-09-10) ─────────────────
--   `unique (evaluation_id, evaluator_id)` and a plain INSERT. There is no
--   upsert and no `updated_at`, so "submitted" means settled and the completion
--   view has one meaning.
--
--   This is the OPPOSITE of what 0045 decided for event answers, and the
--   difference is deliberate: an event answer is a race where an edit costs
--   nobody anything, while a peer evaluation is a judgement about a classmate
--   that the instructor will read. The cost is that a misclick is permanent, so
--   the form must state that before it sends — see `submit_peer_evaluation`'s
--   error wording, which the client shows verbatim.
--
-- ── EVERY RULE peer2peer LEFT TO THE CLIENT LIVES IN `submit_peer_evaluation` ─
--   The reference app validated none of this on the server: it trusted an
--   `evaluatorId` from the request body, never range-checked a score, never
--   checked a criterion belonged to the evaluation, prevented self-rating with
--   a client-side filter, and showed a deadline it never enforced.
--
--   Here the evaluator comes from `cp_my_student_id()` and can never be passed
--   in; the deadline is checked; the ratee set must EXACTLY equal the caller's
--   derived peer set (both directions, so neither a missing peer nor a stranger
--   gets through); every criterion must be covered for every ratee; and every
--   score must be a value that actually appears in that criterion's own scale.
--
-- ── SEALED, AND SEALED IN RLS ───────────────────────────────────────────────
--   `peer_ratings` and `peer_comments` are INSTRUCTOR-SELECT ONLY. A student
--   never reads a raw rating row, not even one addressed to them: with the peer
--   list in hand, cross-referencing rows would reconstruct who said what.
--   0051's released results reach students through an aggregating RPC and
--   nothing else. Same discipline as 0045 — sealing enforced in RLS, never in
--   the client.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. `app_flags.peer_eval` is seeded ENABLED below; flip it to false to
--   take the whole feature off the student's navigation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The kill switch
--
--    One row in 0041's flag table, the same lever `student_space` uses. There
--    is NO beta roster: eligibility is simply whether a student's section is
--    targeted by an evaluation, so a student with nothing assigned gets an
--    empty state rather than a locked screen.
-- ----------------------------------------------------------------------------
insert into public.app_flags (key, enabled, note)
     values ('peer_eval', true,
             'Master switch for Peer Evaluation. Off = the nav item disappears '
             'and every peer RPC refuses.')
on conflict (key) do nothing;

create or replace function public.cp_peer_eval_flag()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select enabled from public.app_flags where key = 'peer_eval'), false);
$$;

grant execute on function public.cp_peer_eval_flag() to authenticated;

/**
 * 'open' or 'paused'. Decided ONCE, here, so the client only renders the
 * answer — the rule `space-gate.ts` documents for Student Space, for the same
 * reason: a second client-side definition of who may take part is a second
 * thing that can drift.
 */
create or replace function public.cp_peer_eval_state()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when public.cp_peer_eval_flag() then 'open' else 'paused' end;
$$;

grant execute on function public.cp_peer_eval_state() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Scale validation
--
--    The element shape cannot be a CHECK: verifying that values are distinct
--    and ascending needs to walk the array, and a CHECK cannot contain a
--    subquery. So the table CHECK covers what it can (it is an array, of 2 to
--    10 elements) and this function covers the rest. It is the ONLY writer's
--    gate — `create_peer_evaluation` and `update_peer_evaluation` both run
--    every scale through it. Same split `cp_lounge_clean()` uses.
--
--    Returns the NORMALISED scale (values as integers, labels trimmed), so the
--    stored jsonb is canonical no matter how the composer spelled it.
-- ----------------------------------------------------------------------------
create or replace function public.cp_peer_scale_clean(p_scale jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_out  jsonb;
  v_prev integer;
  v_val  integer;
  v_lab  text;
  v_el   jsonb;
begin
  if p_scale is null or jsonb_typeof(p_scale) <> 'array' then
    raise exception 'A rating scale must be a list of options.';
  end if;
  if jsonb_array_length(p_scale) < 2 or jsonb_array_length(p_scale) > 10 then
    raise exception 'A rating scale needs between 2 and 10 options.';
  end if;

  v_out := '[]'::jsonb;
  v_prev := null;

  for v_el in select value from jsonb_array_elements(p_scale) loop
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'Every scale option needs a value and a label.';
    end if;
    if jsonb_typeof(v_el -> 'value') <> 'number' then
      raise exception 'Every scale option needs a numeric value.';
    end if;

    v_val := (v_el ->> 'value')::integer;
    v_lab := btrim(coalesce(v_el ->> 'label', ''));

    if length(v_lab) = 0 then
      raise exception 'Every scale option needs a label.';
    end if;
    if length(v_lab) > 40 then
      raise exception 'A scale label is at most 40 characters.';
    end if;
    -- 0..100 mirrors `peer_ratings_score_check`. The envelope is deliberately
    -- coarse: the real membership test is "is this score in THIS criterion's
    -- scale", which only the submit RPC can ask.
    if v_val < 0 or v_val > 100 then
      raise exception 'Scale values must be between 0 and 100.';
    end if;
    -- Strictly ascending, which also makes them distinct. Ascending matters
    -- because 0051 normalises a percentage against the first and last values.
    if v_prev is not null and v_val <= v_prev then
      raise exception 'Scale values must go up, with no repeats.';
    end if;

    v_prev := v_val;
    v_out := v_out || jsonb_build_array(jsonb_build_object('value', v_val, 'label', v_lab));
  end loop;

  return v_out;
end;
$$;

grant execute on function public.cp_peer_scale_clean(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.peer_evaluations (
  id           uuid primary key default gen_random_uuid(),
  semester_id  uuid not null default public.cp_active_semester_id()
                 references public.semesters(id) on delete cascade,
  -- Required (the instructor's call): every evaluation names the subject it
  -- belongs to, because the same roster takes two of them.
  subject_id   uuid not null references public.subjects(id) on delete cascade,
  title        text not null check (length(btrim(title)) between 1 and 80),
  instructions text check (instructions is null or length(instructions) <= 600),
  scope        text not null check (scope in ('section', 'group')),
  status       text not null default 'open' check (status in ('open', 'closed')),
  -- NULL = closed by hand only. Otherwise the per-minute cron closes it.
  closes_at    timestamptz,
  closed_at    timestamptz,
  -- 0051. Declared here so the release is one UPDATE rather than a migration.
  results_released_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists peer_evaluations_semester_idx
  on public.peer_evaluations (semester_id, created_at desc);
create index if not exists peer_evaluations_due_idx
  on public.peer_evaluations (closes_at) where status = 'open';

-- The composite primary key is the fix for peer2peer's join table, which had no
-- key at all and so let the same section be targeted twice — doubling every
-- student in it.
create table if not exists public.peer_evaluation_sections (
  evaluation_id uuid not null references public.peer_evaluations(id) on delete cascade,
  section_id    uuid not null references public.sections(id)         on delete cascade,
  primary key (evaluation_id, section_id)
);

create index if not exists peer_evaluation_sections_section_idx
  on public.peer_evaluation_sections (section_id);

create table if not exists public.peer_criteria (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.peer_evaluations(id) on delete cascade,
  label         text not null check (length(btrim(label)) between 1 and 60),
  -- Per-criterion custom scale: [{"value":1,"label":"Poor"}, …]. Element shape
  -- is validated by cp_peer_scale_clean() — a CHECK cannot walk the array.
  scale         jsonb not null
                  check (jsonb_typeof(scale) = 'array'
                         and jsonb_array_length(scale) between 2 and 10),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists peer_criteria_eval_idx
  on public.peer_criteria (evaluation_id, sort_order);

-- The entity peer2peer never had, and the reason it could not answer "who has
-- not submitted". It is also what makes double-submit impossible rather than
-- unlikely: the reference app used a findFirst-then-createMany race with no
-- unique constraint behind it.
create table if not exists public.peer_submissions (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.peer_evaluations(id) on delete cascade,
  evaluator_id  uuid not null references public.students(id)         on delete cascade,
  section_id    uuid not null references public.sections(id)         on delete cascade,
  -- A SNAPSHOT of the group at submit time, so regrouping students later never
  -- rewrites history. `set null` rather than cascade for the same reason: an
  -- archived group must not take the submission with it.
  group_id      uuid references public.peer_groups(id) on delete set null,
  submitted_at  timestamptz not null default now(),
  unique (evaluation_id, evaluator_id)
);

create index if not exists peer_submissions_eval_idx
  on public.peer_submissions (evaluation_id, submitted_at desc);

create table if not exists public.peer_ratings (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.peer_submissions(id) on delete cascade,
  evaluation_id uuid not null references public.peer_evaluations(id) on delete cascade,
  evaluator_id  uuid not null references public.students(id)         on delete cascade,
  ratee_id      uuid not null references public.students(id)         on delete cascade,
  criterion_id  uuid not null references public.peer_criteria(id)    on delete cascade,
  score         integer not null,
  created_at    timestamptz not null default now(),
  -- Self-rating refused by the DATABASE. peer2peer prevented it with a
  -- client-side filter, which is a suggestion.
  constraint peer_ratings_no_self_check check (evaluator_id <> ratee_id),
  -- A coarse envelope only. Exact membership in the criterion's own scale is
  -- enforced in submit_peer_evaluation, which is the only writer.
  constraint peer_ratings_score_check check (score between 0 and 100),
  unique (submission_id, ratee_id, criterion_id)
);

-- The two read paths 0051 aggregates on. peer2peer had zero indexes beyond
-- its primary keys, so its hot table was a sequential scan.
create index if not exists peer_ratings_ratee_idx
  on public.peer_ratings (evaluation_id, ratee_id);
create index if not exists peer_ratings_criterion_idx
  on public.peer_ratings (evaluation_id, criterion_id);

-- ONE row per peer, stored once. peer2peer wrote the comment onto every
-- criterion row and then de-duplicated it again on read.
create table if not exists public.peer_comments (
  submission_id uuid not null references public.peer_submissions(id) on delete cascade,
  ratee_id      uuid not null references public.students(id)         on delete cascade,
  evaluator_id  uuid not null references public.students(id)         on delete cascade,
  evaluation_id uuid not null references public.peer_evaluations(id) on delete cascade,
  body          text not null check (length(btrim(body)) between 1 and 400),
  -- 0051. Lets the instructor suppress a cruel comment before release without
  -- destroying the evidence — the `lounge_posts.hidden_at` precedent.
  hidden_at     timestamptz,
  created_at    timestamptz not null default now(),
  primary key (submission_id, ratee_id),
  constraint peer_comments_no_self_check check (evaluator_id <> ratee_id)
);

create index if not exists peer_comments_ratee_idx
  on public.peer_comments (evaluation_id, ratee_id);

-- ----------------------------------------------------------------------------
-- 4. Who can see what
-- ----------------------------------------------------------------------------
create or replace function public.cp_peer_eval_targets_me(p_eval uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.peer_evaluation_sections t
      join public.students s on s.id = public.cp_my_student_id()
     where t.evaluation_id = p_eval
       and t.section_id = s.section_id
  );
$$;

grant execute on function public.cp_peer_eval_targets_me(uuid) to authenticated;

alter table public.peer_evaluations         enable row level security;
alter table public.peer_evaluation_sections enable row level security;
alter table public.peer_criteria            enable row level security;
alter table public.peer_submissions         enable row level security;
alter table public.peer_ratings             enable row level security;
alter table public.peer_comments            enable row level security;

drop policy if exists peer_evaluations_select on public.peer_evaluations;
create policy peer_evaluations_select on public.peer_evaluations
  for select to authenticated
  using (public.is_instructor() or public.cp_peer_eval_targets_me(id));

drop policy if exists peer_evaluation_sections_select on public.peer_evaluation_sections;
create policy peer_evaluation_sections_select on public.peer_evaluation_sections
  for select to authenticated
  using (public.is_instructor() or public.cp_peer_eval_targets_me(evaluation_id));

drop policy if exists peer_criteria_select on public.peer_criteria;
create policy peer_criteria_select on public.peer_criteria
  for select to authenticated
  using (public.is_instructor() or public.cp_peer_eval_targets_me(evaluation_id));

-- Your own submission receipt, so the list can say "Submitted" without an RPC.
drop policy if exists peer_submissions_select on public.peer_submissions;
create policy peer_submissions_select on public.peer_submissions
  for select to authenticated
  using (public.is_instructor() or evaluator_id = public.cp_my_student_id());

-- ⚠ INSTRUCTOR ONLY, AND THIS IS THE PROMISE THE FEATURE MAKES.
--   No student branch, not even "ratings addressed to me". A student holding
--   the peer list could difference those rows against the totals and work out
--   who said what. 0051 hands released results through an aggregating RPC.
drop policy if exists peer_ratings_select on public.peer_ratings;
create policy peer_ratings_select on public.peer_ratings
  for select to authenticated using (public.is_instructor());

drop policy if exists peer_comments_select on public.peer_comments;
create policy peer_comments_select on public.peer_comments
  for select to authenticated using (public.is_instructor());

grant select on public.peer_evaluations         to authenticated;
grant select on public.peer_evaluation_sections to authenticated;
grant select on public.peer_criteria            to authenticated;
grant select on public.peer_submissions         to authenticated;
grant select on public.peer_ratings             to authenticated;
grant select on public.peer_comments            to authenticated;

-- ----------------------------------------------------------------------------
-- 5. The peer set — ONE definition, used by every caller
--
--    The form, the submit validation, the completion view and the "open"
--    notification all ask this same question. Five copies of the show-up rate
--    and four of the points row have already drifted in this codebase; this one
--    decides who your peers are, so a second copy would let the form show a
--    classmate the submit RPC then refuses.
--
--    The OUT column is `peer_id`, NOT `student_id`: a RETURNS TABLE column
--    becomes a variable in scope, and `student_id` would shadow the column of
--    the same name on `peer_group_members`.
-- ----------------------------------------------------------------------------
drop function if exists public.cp_peer_set(uuid, uuid);
create function public.cp_peer_set(p_eval uuid, p_student uuid)
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
  select e.scope into v_scope from public.peer_evaluations e where e.id = p_eval;

  select s.section_id into v_section
    from public.students s
   where s.id = p_student and s.archived_at is null;

  -- No evaluation, no student, or a student whose section is not targeted:
  -- zero peers. Returning empty rather than raising is what lets the caller
  -- distinguish "not placed in a group" from "something went wrong".
  if v_scope is null or v_section is null then
    return;
  end if;
  if not exists (
    select 1 from public.peer_evaluation_sections t
     where t.evaluation_id = p_eval and t.section_id = v_section
  ) then
    return;
  end if;

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
       where m1.student_id = p_student;
  end if;
end;
$$;

grant execute on function public.cp_peer_set(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. The student's list
-- ----------------------------------------------------------------------------
drop function if exists public.get_my_peer_evaluations();
create function public.get_my_peer_evaluations()
returns table (
  id                  uuid,
  title               text,
  instructions        text,
  subject_code        text,
  subject_name        text,
  scope               text,
  status              text,
  closes_at           timestamptz,
  results_released_at timestamptz,
  peer_count          integer,
  submitted_at        timestamptz,
  created_at          timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.cp_my_student_id();
begin
  if v_me is null or public.cp_peer_eval_state() <> 'open' then
    return;
  end if;

  return query
  select
    e.id,
    e.title,
    e.instructions,
    sub.code,
    sub.name,
    e.scope,
    e.status,
    e.closes_at,
    e.results_released_at,
    p.n::integer,
    s.submitted_at,
    e.created_at
  from public.peer_evaluations e
  join public.subjects sub on sub.id = e.subject_id
  cross join lateral (
    select count(*) as n from public.cp_peer_set(e.id, v_me)
  ) p
  left join public.peer_submissions s
         on s.evaluation_id = e.id and s.evaluator_id = v_me
 where public.cp_peer_eval_targets_me(e.id)
 order by
   -- Anything still open and unanswered first: that is the only row with
   -- something to DO, and burying it under last term's closed ones is how a
   -- deadline gets missed.
   (e.status = 'open' and s.submitted_at is null) desc,
   e.created_at desc;
end;
$$;

grant execute on function public.get_my_peer_evaluations() to authenticated;

-- ----------------------------------------------------------------------------
-- 7. The form, in one call
--
--    Returns jsonb rather than a table because the payload is genuinely nested
--    — criteria each carry a scale array, and peers are a second list. As a
--    RETURNS TABLE it would be either two round trips or a cartesian product
--    the client has to un-pick.
-- ----------------------------------------------------------------------------
drop function if exists public.get_peer_evaluation(uuid);
create function public.get_peer_evaluation(p_eval uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me   uuid := public.cp_my_student_id();
  v_eval public.peer_evaluations;
  v_out  jsonb;
begin
  if public.cp_peer_eval_state() <> 'open' then
    raise exception 'Peer evaluation is paused right now.';
  end if;
  if v_me is null then
    raise exception 'Only a student can open an evaluation form.';
  end if;

  select * into v_eval from public.peer_evaluations where id = p_eval;
  if v_eval.id is null or not public.cp_peer_eval_targets_me(p_eval) then
    raise exception 'That evaluation is not open to you.';
  end if;

  select jsonb_build_object(
    'id',           v_eval.id,
    'title',        v_eval.title,
    'instructions', v_eval.instructions,
    'scope',        v_eval.scope,
    'status',       v_eval.status,
    'closesAt',     v_eval.closes_at,
    'subjectCode',  (select sub.code from public.subjects sub where sub.id = v_eval.subject_id),
    'subjectName',  (select sub.name from public.subjects sub where sub.id = v_eval.subject_id),
    'submittedAt',  (select sm.submitted_at from public.peer_submissions sm
                      where sm.evaluation_id = p_eval and sm.evaluator_id = v_me),
    'criteria',     coalesce((
                      select jsonb_agg(jsonb_build_object(
                               'id',    c.id,
                               'label', c.label,
                               'scale', c.scale
                             ) order by c.sort_order, c.created_at)
                        from public.peer_criteria c
                       where c.evaluation_id = p_eval
                    ), '[]'::jsonb),
    -- Display names only. The roster name is the instructor's, and a peer list
    -- is a student-facing surface.
    'peers',        coalesce((
                      select jsonb_agg(jsonb_build_object(
                               'id',          s.id,
                               'displayName', s.display_name,
                               'avatarUrl',   s.avatar_url
                             ) order by s.display_name)
                        from public.cp_peer_set(p_eval, v_me) ps
                        join public.students s on s.id = ps.peer_id
                    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

grant execute on function public.get_peer_evaluation(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. SUBMIT — the security-critical function
--
--    Every check peer2peer skipped. See the file header for the list; the order
--    below is deliberate, cheapest and most-likely-to-fail first, so the common
--    rejections (closed, already submitted) do not pay for the set comparisons.
--
--    `p_ratings`  : [{"ratee_id":uuid,"criterion_id":uuid,"score":int}, …]
--    `p_comments` : [{"ratee_id":uuid,"body":text}, …]  (optional, may be [])
--
--    Keys are snake_case because `jsonb_to_recordset` matches on column name,
--    and inventing an alias layer for four keys buys nothing.
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
  insert into public.peer_comments
         (submission_id, ratee_id, evaluator_id, evaluation_id, body)
  select v_sub, c.ratee_id, v_me, p_eval, btrim(c.body)
    from jsonb_to_recordset(v_comments) as c(ratee_id uuid, body text)
   where length(btrim(coalesce(c.body, ''))) > 0;

  return v_sub;
end;
$$;

grant execute on function public.submit_peer_evaluation(uuid, jsonb, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. Creating one
--
--    Criteria and sections arrive WITH the evaluation rather than being added
--    afterwards, so there is no window where an evaluation exists that a
--    student could open and find empty. It is created `open`, which is why this
--    is also where the "it's open" notification goes out.
-- ----------------------------------------------------------------------------
drop function if exists public.create_peer_evaluation(uuid, text, text, text, uuid[], jsonb, timestamptz);
create function public.create_peer_evaluation(
  p_subject      uuid,
  p_title        text,
  p_instructions text,
  p_scope        text,
  p_sections     uuid[],
  p_criteria     jsonb,
  p_closes_at    timestamptz default null
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

  insert into public.peer_evaluations (subject_id, title, instructions, scope, closes_at)
       values (p_subject, v_title, nullif(btrim(coalesce(p_instructions, '')), ''),
               p_scope, p_closes_at)
    returning id into v_id;

  insert into public.peer_evaluation_sections (evaluation_id, section_id)
  select v_id, t.section_id from unnest(v_sections) as t(section_id)
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
  -- tell them they are not on a team.
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
            'sections', to_jsonb(v_sections), 'closes_at', p_closes_at,
            'notified', v_total
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

grant execute on function public.create_peer_evaluation(uuid, text, text, text, uuid[], jsonb, timestamptz)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Editing — criteria and scope LOCK on the first submission
--
--     peer2peer destroyed every submitted response whenever criteria were
--     edited, unconditionally and without saying so. Here the shape of the
--     thing being answered becomes immutable the moment anyone has answered it;
--     the title, the instructions and the deadline stay editable forever,
--     because none of them changes what a submitted rating MEANT.
--
--     Passing null for criteria or sections leaves them alone, so the ordinary
--     "fix a typo in the title" call cannot trip the lock by accident.
-- ----------------------------------------------------------------------------
drop function if exists public.update_peer_evaluation(uuid, text, text, uuid[], jsonb, timestamptz, boolean);
create function public.update_peer_evaluation(
  p_eval          uuid,
  p_title         text default null,
  p_instructions  text default null,
  p_sections      uuid[] default null,
  p_criteria      jsonb default null,
  p_closes_at     timestamptz default null,
  p_set_closes_at boolean default false
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

  if v_locked and (p_sections is not null or p_criteria is not null) then
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

grant execute on function public.update_peer_evaluation(uuid, text, text, uuid[], jsonb, timestamptz, boolean)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 11. Closing, reopening, extending
--
--     `cp_close_peer_core` has NO instructor check because the cron calls it
--     too, and it is IDEMPOTENT because three things can close one evaluation —
--     the instructor, the cron at `closes_at`, and a retried request. The 0045
--     rule, for the same reason.
-- ----------------------------------------------------------------------------
create or replace function public.cp_close_peer_core(p_eval uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
    from public.peer_evaluations where id = p_eval for update;

  if v_status is null or v_status = 'closed' then
    return false;
  end if;

  update public.peer_evaluations
     set status = 'closed', closed_at = now()
   where id = p_eval;

  return true;
end;
$$;

revoke execute on function public.cp_close_peer_core(uuid) from public, anon, authenticated;

drop function if exists public.close_peer_evaluation(uuid);
create function public.close_peer_evaluation(p_eval uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can close an evaluation.';
  end if;
  return public.cp_close_peer_core(p_eval);
end;
$$;

grant execute on function public.close_peer_evaluation(uuid) to authenticated;

/**
 * Reopening clears `closes_at` deliberately.
 *
 * A reopened evaluation whose deadline is in the past would be closed again by
 * the cron within the minute, which reads as the button not working. The
 * instructor sets a new deadline if they want one.
 */
drop function if exists public.reopen_peer_evaluation(uuid);
create function public.reopen_peer_evaluation(p_eval uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eval public.peer_evaluations;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can reopen an evaluation.';
  end if;

  select * into v_eval from public.peer_evaluations where id = p_eval;
  if v_eval.id is null then
    raise exception 'That evaluation does not exist.';
  end if;
  if v_eval.results_released_at is not null then
    raise exception 'Results have already been released, so this cannot be reopened.';
  end if;

  update public.peer_evaluations
     set status = 'open', closed_at = null, closes_at = null
   where id = p_eval;

  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
  values (auth.uid(), 'peer_eval', 'peer_evaluations', p_eval,
          format('Reopened peer evaluation "%s"', v_eval.title),
          jsonb_build_object('title', v_eval.title, 'was_closed_at', v_eval.closed_at));
end;
$$;

grant execute on function public.reopen_peer_evaluation(uuid) to authenticated;

drop function if exists public.extend_peer_evaluation(uuid, timestamptz);
create function public.extend_peer_evaluation(p_eval uuid, p_closes_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can change a deadline.';
  end if;
  if p_closes_at is not null and p_closes_at <= now() then
    raise exception 'Pick a deadline in the future.';
  end if;

  update public.peer_evaluations
     set closes_at = p_closes_at
   where id = p_eval and status = 'open';

  if not found then
    raise exception 'That evaluation is not open.';
  end if;
end;
$$;

grant execute on function public.extend_peer_evaluation(uuid, timestamptz) to authenticated;

create or replace function public.cp_close_due_peer_evaluations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n  integer := 0;
begin
  for v_id in
    select id from public.peer_evaluations
     where status = 'open' and closes_at is not null and closes_at <= now()
  loop
    if public.cp_close_peer_core(v_id) then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.cp_close_due_peer_evaluations()
  from public, anon, authenticated;

-- cron.schedule upserts by job name, so re-running just retargets it.
select cron.schedule(
  'classpoint-close-due-peer-evals', '* * * * *',
  $cron$select public.cp_close_due_peer_evaluations();$cron$
);

-- ----------------------------------------------------------------------------
-- 12. The instructor's list and completion view
--
--     `applicable` is the third state peer2peer could not express. A student in
--     a group-scoped evaluation who is on no team has nobody to rate, so they
--     are NOT missing — reporting them as outstanding would send the instructor
--     chasing someone who has nothing to do.
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
    (select count(*)::integer from public.peer_criteria c where c.evaluation_id = e.id),
    (select count(*)::integer from public.peer_submissions s where s.evaluation_id = e.id),
    -- Expected = everyone who actually has someone to rate.
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

drop function if exists public.get_peer_completion(uuid);
create function public.get_peer_completion(p_eval uuid)
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
 order by
   -- Outstanding first: this list exists to be chased, so ordering it by name
   -- puts the answer on page two.
   (p.n > 0 and sm.submitted_at is null) desc,
   sec.name, s.full_name;
end;
$$;

grant execute on function public.get_peer_completion(uuid) to authenticated;

-- ============================================================================
-- VERIFY
--
--   Setup (as the instructor):
--     select public.create_peer_evaluation(
--       '<subject the section takes>', 'Group project 1', 'Be honest and kind.',
--       'group', array['<section>']::uuid[],
--       '[{"label":"Contribution","scale":[{"value":1,"label":"Poor"},
--                                          {"value":5,"label":"Excellent"}]},
--         {"label":"Showed up","scale":[{"value":0,"label":"No"},
--                                       {"value":1,"label":"Yes"}]}]'::jsonb,
--       now() + interval '2 days');
--
--   1. select * from public.list_peer_evaluations();
--      criteria_count 2, submitted_count 0, expected_count = only students who
--      are on a team. Confirm the notification went to those same students:
--        select student_id, type, url from public.notifications
--         where type = 'peer_eval_open';
--
--   2. A section that does NOT take that subject is refused at create time.
--
--   3. A BAD SCALE is refused, one raise per rule:
--        select public.cp_peer_scale_clean('[{"value":5,"label":"a"},
--                                            {"value":1,"label":"b"}]'::jsonb);
--        -- 'Scale values must go up, with no repeats.'
--        select public.cp_peer_scale_clean('[{"value":1,"label":"a"}]'::jsonb);
--        -- 'A rating scale needs between 2 and 10 options.'
--
--   4. As a STUDENT on a team:
--        select public.get_peer_evaluation('<eval>');
--      `peers` holds their groupmates and NEVER themselves; `criteria` carries
--      both scales.
--
--   5. THE FOUR NEGATIVE TESTS. Each must be refused by the DATABASE:
--      a. a ratee outside your group      → 'not one of your peers'
--      b. a score not on that scale (e.g. 3 on the 0/1 criterion)
--                                          → 'not on the scale'
--      c. yourself as ratee                → 'not one of your peers'
--      d. one peer left unrated            → 'Rate every peer'
--      Then submit a full, valid payload — it returns a submission id.
--
--   6. Submit AGAIN from a second tab:
--        'You have already submitted this evaluation. It cannot be changed.'
--      and select count(*) from public.peer_submissions where evaluator_id =
--      '<them>' and evaluation_id = '<eval>';   -- exactly 1
--
--   7. THE SEALING TEST, and the one that matters most. As that student:
--        select * from public.peer_ratings;    -- 0 rows
--        select * from public.peer_comments;   -- 0 rows
--      Even though rows exist that they wrote and rows exist about them.
--
--   8. THE EDIT LOCK:
--        select public.update_peer_evaluation('<eval>', p_title => 'New name');
--        -- succeeds
--        select public.update_peer_evaluation('<eval>',
--                 p_criteria => '[{"label":"x","scale":[{"value":1,"label":"a"},
--                                                       {"value":2,"label":"b"}]}]'::jsonb);
--        -- raises: questions are locked. Confirm the ratings SURVIVED:
--        select count(*) from public.peer_ratings where evaluation_id = '<eval>';
--
--   9. select * from public.get_peer_completion('<eval>');
--      Submitted students show a timestamp; a student on no team shows
--      applicable = false and peer_count 0, NOT a missing submission.
--
--  10. THE DEADLINE:
--        select public.extend_peer_evaluation('<eval>', now() + interval '1 minute');
--      Wait for the cron. status becomes 'closed' ONCE:
--        select jobname, schedule from cron.job
--         where jobname = 'classpoint-close-due-peer-evals';
--        select status, closed_at from public.peer_evaluations where id = '<eval>';
--      Then select public.close_peer_evaluation('<eval>');  -- returns false
--      A submit after close raises 'That evaluation has closed.'
--
--  11. select pg_get_constraintdef(oid) from pg_constraint
--       where conname = 'audit_log_action_check';
--      Still holds all fourteen values (0049 widened it for this phase).
--
--  12. Re-run this whole file. Nothing errors, nothing duplicates.
-- ============================================================================
