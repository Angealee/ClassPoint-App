-- ============================================================================
-- ClassPoint · 0049 · Peer groups
-- Run after 0048. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   Phase 1 of Peer Evaluation, and it ships useful on its own: the instructor
--   can organise a section into teams before any evaluation exists. Nothing
--   else in the app changes, and nothing here touches `point_events` — points
--   are never turned into a grade, and this feature stays structurally out of
--   the ledger.
--
-- ── ONE GROUP PER STUDENT PER SECTION, AND WHY THE COLUMN IS DUPLICATED ─────
--   `peer_group_members.section_id` is denormalised from the group it belongs
--   to. It exists for exactly one reason: it makes `unique (section_id,
--   student_id)` expressible, and that constraint IS the one-group-per-student
--   rule. Deriving it through a join cannot be a constraint, so it would have
--   to be a trigger, and a trigger is a rule you can forget to fire. Same
--   justification as `space_rooms.dm_key` in 0043.
--
--   A trigger keeps the copy honest on write (`trg_peer_member_section`), so a
--   caller cannot pass a section that disagrees with the group's own.
--
-- ── NO `semester_id` ANYWHERE IN THIS FILE ──────────────────────────────────
--   A section has been semester-scoped since 0027. A second copy of that fact
--   is a second thing that can drift, and the join to get it is one hop.
--
-- ── TICKING A STUDENT WHO IS ALREADY IN A GROUP MOVES THEM ──────────────────
--   The builder is group-first (the instructor's call): each group card opens a
--   sheet of the section roster with checkboxes. That shape lets the same
--   student be ticked in two different sheets, and the unique constraint above
--   would then reject the second save with a constraint name for a message.
--
--   So `set_peer_group_members` treats a tick as authoritative: it removes the
--   student from any OTHER group in the same section first, then adds them
--   here. The sheet shows which group each student is currently in, so the move
--   is visible before it is made rather than surprising afterwards.
--
-- ── ARCHIVE, NEVER DELETE ───────────────────────────────────────────────────
--   `peer_groups.archived_at`, the 0023 discipline. Phase 2 snapshots
--   `peer_submissions.group_id` at submit time, so a group that disappears
--   would take the meaning of past submissions with it. Archiving also frees
--   the name (the unique index is partial) and frees every member, which is
--   what "retire this team" has to mean to be worth having.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. `audit_log_action_check` — widened ONCE, for both phases
--
--    'peer_eval' is added here even though nothing writes it until 0050. This
--    constraint has already been silently narrowed twice by a drop-and-recreate
--    that forgot a value, and widening it in two files is two chances to do it
--    again. Name preserved; all twelve existing values RE-LISTED.
-- ----------------------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'delete','archive','restore','hard_delete','broadcast',
    'promote','semester_activate',
    'space_flag','space_section','space_timeout',
    'space_break_glass','space_moderate',
    'peer_group','peer_eval'
  ));

-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.peer_groups (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references public.sections(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 40),
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Partial, so archiving a group frees its name for reuse. Case-insensitive,
-- the same shape 0027 gave `sections (semester_id, lower(name))`.
create unique index if not exists peer_groups_section_name_idx
  on public.peer_groups (section_id, lower(btrim(name)))
  where archived_at is null;

create index if not exists peer_groups_section_idx
  on public.peer_groups (section_id, sort_order)
  where archived_at is null;

create table if not exists public.peer_group_members (
  group_id   uuid not null references public.peer_groups(id) on delete cascade,
  student_id uuid not null references public.students(id)    on delete cascade,
  -- Denormalised from the group — see the header. Kept honest by the trigger
  -- below, never trusted from the caller.
  section_id uuid not null references public.sections(id)     on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, student_id),
  -- THE RULE. One group per student per section, enforced by the database
  -- rather than by whichever screen happens to be doing the writing.
  unique (section_id, student_id)
);

create index if not exists peer_group_members_student_idx
  on public.peer_group_members (student_id);

-- ----------------------------------------------------------------------------
-- 3. The denormalised column cannot be wrong
--
--    Every write goes through an RPC that sets it correctly, so this trigger is
--    a belt on top of braces. It is cheap, and the alternative is a column that
--    is right until the day something new writes the table.
-- ----------------------------------------------------------------------------
create or replace function public.cp_peer_member_section()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select g.section_id into new.section_id
    from public.peer_groups g
   where g.id = new.group_id;

  if new.section_id is null then
    raise exception 'That group does not exist.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_peer_member_section on public.peer_group_members;
create trigger trg_peer_member_section
  before insert or update on public.peer_group_members
  for each row execute function public.cp_peer_member_section();

-- ----------------------------------------------------------------------------
-- 4. RLS — INSTRUCTOR SELECT ONLY, no write policies at all
--
--    Every write goes through a `security definer` RPC below, so the instructor
--    check lives in one place per action rather than being restated as a policy
--    that a future `.from()` call could satisfy by accident.
--
--    Students get NO select here, deliberately. Phase 2 hands a student their
--    groupmates through `get_peer_evaluation()`, which is scoped to one
--    evaluation they are actually in. A blanket read of the membership table
--    would let any student enumerate every team in their section whether or not
--    an evaluation exists, which is a roster nobody asked to publish.
-- ----------------------------------------------------------------------------
alter table public.peer_groups        enable row level security;
alter table public.peer_group_members enable row level security;

drop policy if exists peer_groups_select on public.peer_groups;
create policy peer_groups_select on public.peer_groups
  for select to authenticated using (public.is_instructor());

drop policy if exists peer_group_members_select on public.peer_group_members;
create policy peer_group_members_select on public.peer_group_members
  for select to authenticated using (public.is_instructor());

grant select on public.peer_groups        to authenticated;
grant select on public.peer_group_members to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Reading the builder in ONE call
--
--    Groups with their members attached, so the screen does not fan out to a
--    query per card. The client derives "unassigned" as the section roster
--    minus everyone returned here — no extra RPC, and no second definition of
--    who is placed.
--
--    ARCHIVED STUDENTS ARE FILTERED OUT of `members` and `member_count`, but
--    their row is NOT deleted: it still holds their unique slot, so restoring a
--    student (0023) puts them back in the team they were on. The builder must
--    not show them; the constraint must not forget them.
-- ----------------------------------------------------------------------------
drop function if exists public.get_section_groups(uuid);
create function public.get_section_groups(p_section uuid)
returns table (
  id           uuid,
  name         text,
  sort_order   integer,
  member_count integer,
  members      jsonb,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can read peer groups.';
  end if;

  return query
  select
    g.id,
    g.name,
    g.sort_order,
    count(s.id)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',           s.id,
          'displayName',  s.display_name,
          'avatarUrl',    s.avatar_url
        )
        order by s.display_name
      ) filter (where s.id is not null),
      '[]'::jsonb
    ),
    g.created_at
  from public.peer_groups g
  left join public.peer_group_members m on m.group_id = g.id
  left join public.students s
         on s.id = m.student_id
        and s.archived_at is null
 where g.section_id = p_section
   and g.archived_at is null
 group by g.id, g.name, g.sort_order, g.created_at
 order by g.sort_order, g.created_at;
end;
$$;

grant execute on function public.get_section_groups(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Create
--
--    The name arrives BLANK from the composer (the instructor's call): a
--    pre-filled "Group 1" is one un-edited default away from a section full of
--    teams nobody can tell apart, and unlike a section name a group name is
--    cheap to type once.
--
--    The duplicate-name case is caught and re-raised in words. A raw
--    `peer_groups_section_name_idx` violation is not a sentence anyone can act
--    on, and this is the error the instructor will actually hit.
-- ----------------------------------------------------------------------------
drop function if exists public.create_peer_group(uuid, text);
create function public.create_peer_group(p_section uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can create a group.';
  end if;

  if length(v_name) = 0 then
    raise exception 'Give the group a name.';
  end if;
  if length(v_name) > 40 then
    raise exception 'A group name is at most 40 characters.';
  end if;

  if not exists (select 1 from public.sections where id = p_section) then
    raise exception 'That section does not exist.';
  end if;

  begin
    insert into public.peer_groups (section_id, name, sort_order)
    select p_section, v_name,
           coalesce(max(g.sort_order), 0) + 1
      from public.peer_groups g
     where g.section_id = p_section
    returning id into v_id;
  exception when unique_violation then
    raise exception 'This section already has a group called "%".', v_name;
  end;

  return v_id;
end;
$$;

grant execute on function public.create_peer_group(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Rename
-- ----------------------------------------------------------------------------
drop function if exists public.rename_peer_group(uuid, text);
create function public.rename_peer_group(p_group uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can rename a group.';
  end if;

  if length(v_name) = 0 then
    raise exception 'Give the group a name.';
  end if;
  if length(v_name) > 40 then
    raise exception 'A group name is at most 40 characters.';
  end if;

  if not exists (
    select 1 from public.peer_groups where id = p_group and archived_at is null
  ) then
    raise exception 'That group does not exist.';
  end if;

  begin
    update public.peer_groups set name = v_name where id = p_group;
  exception when unique_violation then
    raise exception 'This section already has a group called "%".', v_name;
  end;
end;
$$;

grant execute on function public.rename_peer_group(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Membership — the whole list, replaced in one statement
--
--    Takes the FULL intended membership rather than add/remove deltas: the
--    sheet the instructor is looking at holds the complete answer, and a delta
--    API means the screen and the table can disagree about a student whose
--    checkbox toggled twice.
--
--    THE MOVE. A student ticked here who is already in another group of the
--    same section is REMOVED from that group first. That is what makes the
--    group-first builder safe — see the header. It is deliberate and silent at
--    the database level; the sheet is where the instructor sees it coming.
--
--    Archived students are refused outright: putting one on a team creates a
--    peer nobody can evaluate.
-- ----------------------------------------------------------------------------
drop function if exists public.set_peer_group_members(uuid, uuid[]);
create function public.set_peer_group_members(p_group uuid, p_students uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section uuid;
  v_ids     uuid[] := coalesce(p_students, '{}'::uuid[]);
  v_bad     integer;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can change a group.';
  end if;

  select g.section_id into v_section
    from public.peer_groups g
   where g.id = p_group and g.archived_at is null;

  if v_section is null then
    raise exception 'That group does not exist.';
  end if;

  -- Every id must be an ACTIVE student of this group's own section. Counted
  -- rather than checked one at a time so the message names the real problem
  -- instead of the first row that happened to fail.
  select count(*) into v_bad
    from unnest(v_ids) as t(student_id)
   where not exists (
     select 1 from public.students s
      where s.id = t.student_id
        and s.section_id = v_section
        and s.archived_at is null
   );

  if v_bad > 0 then
    raise exception 'Only active students of this section can join the group.';
  end if;

  -- The move. Ticking a student here takes them off whatever team they were on
  -- in this section, which is what the unique constraint would otherwise turn
  -- into an error message nobody can read.
  delete from public.peer_group_members
   where section_id = v_section
     and group_id <> p_group
     and student_id = any (v_ids);

  -- Anyone unticked leaves this group.
  delete from public.peer_group_members
   where group_id = p_group
     and not (student_id = any (v_ids));

  -- `section_id` is set by the trigger regardless of what is passed here.
  insert into public.peer_group_members (group_id, student_id, section_id)
  select p_group, t.student_id, v_section
    from unnest(v_ids) as t(student_id)
  on conflict (group_id, student_id) do nothing;
end;
$$;

grant execute on function public.set_peer_group_members(uuid, uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. Archive
--
--    Members are released so they can be placed elsewhere; the group row stays
--    so Phase 2's `peer_submissions.group_id` snapshot keeps its meaning. One
--    audit row, written with the membership it had at the time — the point of
--    the record is being able to answer "who was on that team" after the fact.
-- ----------------------------------------------------------------------------
drop function if exists public.archive_peer_group(uuid);
create function public.archive_peer_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group   public.peer_groups;
  v_members jsonb;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can archive a group.';
  end if;

  select * into v_group from public.peer_groups where id = p_group;

  if v_group.id is null then
    raise exception 'That group does not exist.';
  end if;
  if v_group.archived_at is not null then
    return;  -- Already archived. Idempotent, so a retried tap is harmless.
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.display_name)), '[]'::jsonb)
    into v_members
    from public.peer_group_members m
    join public.students s on s.id = m.student_id
   where m.group_id = p_group;

  update public.peer_groups set archived_at = now() where id = p_group;
  delete from public.peer_group_members where group_id = p_group;

  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
       values (auth.uid(), 'peer_group', 'peer_groups', p_group,
               format('Archived peer group "%s"', v_group.name),
               jsonb_build_object(
                 'name',       v_group.name,
                 'section_id', v_group.section_id,
                 'members',    v_members
               ));
end;
$$;

grant execute on function public.archive_peer_group(uuid) to authenticated;

-- ============================================================================
-- VERIFY (run as the instructor unless a step says otherwise)
--
--   1. The constraint really still holds every old value — this is the check
--      that would have caught both previous silent narrowings:
--        select pg_get_constraintdef(oid) from pg_constraint
--         where conname = 'audit_log_action_check';
--      Expect all fourteen, ending 'peer_group','peer_eval'.
--
--   2. select public.create_peer_group('<section>', 'Team Alpha');
--      select public.create_peer_group('<section>', ' team alpha ');
--      The second RAISES with the readable duplicate message, not an index name.
--
--   3. select public.set_peer_group_members('<alpha>', array['<s1>','<s2>']);
--      select * from public.get_section_groups('<section>');
--      Alpha reports member_count 2 and both names in `members`.
--
--   4. THE ONE THAT MATTERS. Create 'Team Beta', then tick s2 into it:
--        select public.set_peer_group_members('<beta>', array['<s2>']);
--      s2 MOVES: Alpha drops to 1, Beta holds 1, and no constraint error is
--      raised. Confirm the unique slot moved with them:
--        select group_id from public.peer_group_members where student_id = '<s2>';
--
--   5. A student from ANOTHER section is refused:
--        select public.set_peer_group_members('<alpha>', array['<other-section-student>']);
--      Raises 'Only active students of this section can join the group.'
--
--   6. Archive a student (select public.archive_student('<s1>')), then
--      get_section_groups: Alpha's member_count DROPS but the row survives —
--        select * from public.peer_group_members where student_id = '<s1>';
--      still returns it. Restore the student and the count comes back.
--
--   7. select public.archive_peer_group('<beta>');
--      Beta vanishes from get_section_groups, its members are released, and
--        select * from public.audit_log where action = 'peer_group';
--      holds one row naming the group and listing who was on it.
--      Call it again — returns silently, writes no second audit row.
--
--   8. The name is free again after archiving:
--        select public.create_peer_group('<section>', 'Team Beta');   -- succeeds
--
--   9. As a STUDENT: select * from public.peer_groups;  -- 0 rows
--      select public.get_section_groups('<section>');   -- raises
--
--  10. Re-run this whole file. Nothing errors, nothing duplicates.
-- ============================================================================
