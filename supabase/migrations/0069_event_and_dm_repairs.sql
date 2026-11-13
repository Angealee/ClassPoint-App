-- ============================================================================
-- 0069 — Repairs found in use (2026-11-14): closing a Random Event, the answers
--        sheet, and the DM break-glass read. Also drops the reward catalog.
--
-- Idempotent — paste it twice. Depends only on 0042/0043/0045.
--
-- ── 1. lounge_posts_pulse_kind_check  (closing an event failed) ─────────────
--   Closing an event with winners died with
--     new row for relation "lounge_posts" violates check constraint
--     "lounge_posts_pulse_kind_check"
--   0042 was EDITED after it had been pasted to list 'event' in this check
--   ("listed up front so 0045 does not have to drop an auto-named constraint").
--   Anyone who had already pasted the earlier 0042 kept the narrow constraint
--   ('level', 'podium'), so cp_close_event_core's reveal post — pulse_kind
--   'event' — violated it and the WHOLE close rolled back: no winners paid.
--   This is the 0047 lesson again: editing an applied migration is a silent
--   breaking change. The fix is a new file. The constraint keeps its name.
--
-- ── 2. get_event_answers  (the Answers sheet: "column reference \"id\" is ambiguous")
--   `select status … where id = p_event` — `id` is also an OUT column of the
--   function, so plpgsql raised 42702. Qualified. Body otherwise verbatim.
--
-- ── 3. read_dm_thread  (the SAME bug, never yet hit)
--   `select * into v_room … where id = p_room` — identical collision, on the DM
--   break-glass path, which nobody has exercised. It would have failed the first
--   time it mattered. Qualified. Body otherwise verbatim; the audit row is still
--   written BEFORE any message is returned.
--
-- ── 4. reward_catalog_items  (the instructor removed Rewards)
--   0032 was never applied (the Rewards tab failed with "Could not find the
--   table 'public.reward_catalog_items'"), the instructor decided not to ship
--   it, and the migration file and client code are gone. This drops the table
--   if it exists anywhere. cp_nightly_backup's table lists still name it; that
--   function already tolerates a missing source table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. widen the check
-- ----------------------------------------------------------------------------
alter table public.lounge_posts drop constraint if exists lounge_posts_pulse_kind_check;
alter table public.lounge_posts
  add constraint lounge_posts_pulse_kind_check
  check (pulse_kind is null or pulse_kind in ('level', 'podium', 'event'));

-- ----------------------------------------------------------------------------
-- 2. get_event_answers
-- ----------------------------------------------------------------------------
create or replace function public.get_event_answers(p_event uuid)
returns table (
  id             uuid,
  student_id     uuid,
  display_name   text,
  avatar_url     text,
  body           text,
  is_correct     boolean,
  awarded_points int,
  created_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me     uuid := public.cp_my_student_id();
  v_status text;
begin
  -- 0069: `e.id`, not `id` — `id` is also an OUT column of this function, and an
  -- unqualified reference raised 42702 "column reference is ambiguous".
  select e.status into v_status from public.lounge_events e where e.id = p_event;
  if v_status is null then
    return;
  end if;

  -- THE ANTI-COPY RULE, again. The RLS policy says the same thing; this says it
  -- where a reader of the function can see it, and neither depends on the other.
  if not public.is_instructor() and v_status <> 'closed' then
    return query
      select a.id, a.student_id, a.display_name, a.avatar_url, a.body,
             a.is_correct, a.awarded_points, a.created_at
        from public.lounge_event_answers a
       where a.event_id = p_event and a.student_id = v_me;
    return;
  end if;

  return query
    select a.id, a.student_id, a.display_name, a.avatar_url, a.body,
           a.is_correct, a.awarded_points, a.created_at
      from public.lounge_event_answers a
     where a.event_id = p_event
     order by a.created_at, a.id;
end;
$$;

revoke execute on function public.get_event_answers(uuid) from public, anon;
grant  execute on function public.get_event_answers(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. read_dm_thread
-- ----------------------------------------------------------------------------
create or replace function public.read_dm_thread(p_room uuid, p_reason text default null)
returns table (
  id           uuid,
  display_name text,
  body         text,
  deleted_at   timestamptz,
  created_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.space_rooms%rowtype;
  v_who  text;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can do that.';
  end if;

  -- 0069: `r.id` — a bare `id` collides with this function's OUT column (42702).
  select * into v_room from public.space_rooms r where r.id = p_room;
  if not found or v_room.kind <> 'dm' then
    raise exception 'That is not a direct message thread.';
  end if;

  select string_agg(coalesce(stu.display_name, 'Instructor'), ' & ') into v_who
    from public.space_room_members m
    left join public.students stu on stu.id = m.student_id
   where m.room_id = p_room;

  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
       values (auth.uid(), 'space_break_glass', 'space_rooms', p_room,
               'Read the DM between ' || coalesce(v_who, 'unknown'),
               jsonb_build_object('room', p_room, 'reason', p_reason));

  return query
    select m.id, m.display_name,
           case when m.deleted_at is not null then null else m.body end,
           m.deleted_at, m.created_at
      from public.space_messages m
     where m.room_id = p_room
     order by m.created_at asc
     limit 500;
end;
$$;

revoke execute on function public.read_dm_thread(uuid, text) from public, anon;
grant  execute on function public.read_dm_thread(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. no reward catalog
-- ----------------------------------------------------------------------------
drop table if exists public.reward_catalog_items cascade;

-- ============================================================================
-- VERIFY (SQL editor). Every row should read `true`.
-- ============================================================================
-- select 'pulse check lists event' as check,
--        (select pg_get_constraintdef(oid) like '%event%' from pg_constraint
--          where conname = 'lounge_posts_pulse_kind_check')
-- union all
-- select 'get_event_answers qualified',
--        pg_get_functiondef('public.get_event_answers(uuid)'::regprocedure) like '%e.id = p_event%'
-- union all
-- select 'read_dm_thread qualified',
--        pg_get_functiondef('public.read_dm_thread(uuid, text)'::regprocedure) like '%r.id = p_room%'
-- union all
-- select 'no reward table', to_regclass('public.reward_catalog_items') is null;
--
-- Then: close a Random Event that has a correct answer — it should pay and post
-- the "got it" line; and open Answers on /teach/space — it should list answers.
-- ============================================================================
