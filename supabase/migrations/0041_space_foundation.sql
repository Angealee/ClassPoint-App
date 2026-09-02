-- ============================================================================
-- ClassPoint · 0041 · Student Space foundation (the gate)
-- Run after 0040. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   The access layer for Student Space — the social beta (Lounge + messaging)
--   built in 0042–0045. This file ships NO social content. It ships the answer
--   to one question, asked server-side: may this student be in there at all,
--   and may they post?
--
-- ── THE THREE STATES ────────────────────────────────────────────────────────
--   'locked'  the student's section is not in the beta.       (most students)
--   'paused'  the section IS in the beta, but the global kill
--             switch is off.                                  (an incident)
--   'open'    both on.
--
--   Two gates, deliberately, and they are not the same gate:
--     • `sections.space_enabled` is the BETA ROSTER — slow, per-section, and
--       the thing you grow as the beta widens.
--     • `app_flags.student_space` is the KILL SWITCH — one UPDATE takes the
--       whole feature down for everyone, without a deploy and without
--       un-enrolling anybody. Turning the roster off one section at a time
--       during an incident is exactly the friction that stops a kill switch
--       being used, which is why it is a separate lever.
--
--   'paused' is a distinct state rather than collapsing into 'locked' (the
--   user's call): a student who was mid-conversation and now sees "coming
--   soon" reads it as a bug and messages the instructor about it, which is the
--   traffic the switch exists to prevent.
--
-- ── TIMEOUTS ────────────────────────────────────────────────────────────────
--   A timeout mutes, it does not evict: the student still READS everything.
--   `cp_space_is_timed_out()` is exported so 0043 can carve out the one
--   exception the user asked for — a muted student may still DM the
--   instructor, because otherwise their only way to appeal a mute is to find
--   the instructor in person.
--
--   Enforcement lives in the RPCs (0042+ call `cp_space_can_post()`), never in
--   the client. The client copy is a courtesy that greys a composer out.
--
-- ── WHY THE FLAG TABLE HAS NO RLS POLICY ────────────────────────────────────
--   `app_flags` is reachable only through the SECURITY DEFINER functions
--   below — the same treatment `leaderboard_banned_words` gets in 0020. A
--   table with no policy is readable by nobody, which is the correct default
--   for a control surface: students learn the state from `get_space_access()`,
--   which tells them what they need and nothing else.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None to paste. But note the ROLLOUT ORDER: this file seeds the kill switch
--   ON and every section OFF, so applying it changes nothing for anybody.
--   Enable a section from /teach/space when you are ready.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

-- Generic, tiny feature-flag table. Keyed by name so later flags cost a row,
-- not a migration.
create table if not exists public.app_flags (
  key        text primary key,
  enabled    boolean not null default false,
  note       text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Seeded ENABLED: the kill switch is "is the feature allowed to run", and the
-- beta roster below is what actually lets anyone in. Shipping this false would
-- mean two switches to find on the day you first turn the beta on.
insert into public.app_flags (key, enabled, note)
     values ('student_space', true,
             'Master switch for Student Space. Off = every beta section sees the Paused screen.')
on conflict (key) do nothing;

-- The beta roster.
alter table public.sections
  add column if not exists space_enabled boolean not null default false;

comment on column public.sections.space_enabled is
  'Student Space beta roster (0041). Off for every section until the instructor '
  'enables it from /teach/space.';

-- A mute with an expiry. Rows are kept after they lapse: "has this student been
-- timed out before, and what for" is the question you actually ask the second
-- time, and a deleted row cannot answer it.
create table if not exists public.space_timeouts (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  until      timestamptz not null,
  reason     text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists space_timeouts_student_idx
  on public.space_timeouts (student_id, until desc);

alter table public.app_flags      enable row level security;
alter table public.space_timeouts enable row level security;

-- No policy at all on app_flags — see the header. RPC-only.
drop policy if exists app_flags_none on public.app_flags;

-- A student may see their OWN timeouts, so the UI can say why they are muted
-- and until when. No write policies: timeouts are set through the RPC.
drop policy if exists space_timeouts_select on public.space_timeouts;
create policy space_timeouts_select on public.space_timeouts
  for select to authenticated using (
    public.is_instructor()
    or student_id in (select id from public.students where user_id = auth.uid())
  );

grant select on public.space_timeouts to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Widen the audit constraint
--
--    Constraint name preserved (the 0007/0011 rule). 0034's 'broadcast' and
--    0035's 'promote'/'semester_activate' are RE-LISTED: dropping and
--    recreating this constraint silently narrows it otherwise, and that has
--    already been the bug twice.
-- ----------------------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'delete','archive','restore','hard_delete','broadcast',
    'promote','semester_activate',
    'space_flag','space_section','space_timeout'
  ));

-- ----------------------------------------------------------------------------
-- 3. Helpers
--
--    `cp_my_student_id()` is the subquery every policy in this schema has been
--    inlining since 0003. Naming it does not change behaviour; it makes the
--    Student Space policies readable, and it matches how `is_instructor()`
--    already works.
-- ----------------------------------------------------------------------------
create or replace function public.cp_my_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.students where user_id = auth.uid() limit 1;
$$;

grant execute on function public.cp_my_student_id() to authenticated;

-- Is the master switch on? Missing row is treated as OFF — a flag you cannot
-- read is a flag you do not trust.
create or replace function public.cp_space_flag()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select enabled from public.app_flags where key = 'student_space'), false);
$$;

revoke execute on function public.cp_space_flag() from public, anon, authenticated;

-- 'open' | 'paused' | 'locked'. The instructor is never locked out.
create or replace function public.cp_space_state()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  if public.is_instructor() then
    return case when public.cp_space_flag() then 'open' else 'paused' end;
  end if;

  select sec.space_enabled into v_enabled
    from public.students stu
    join public.sections sec on sec.id = stu.section_id
   where stu.user_id = auth.uid()
     and stu.archived_at is null;

  if not coalesce(v_enabled, false) then
    return 'locked';
  end if;
  return case when public.cp_space_flag() then 'open' else 'paused' end;
end;
$$;

grant execute on function public.cp_space_state() to authenticated;

-- When the caller's mute lapses, or null. Reads the LATEST live timeout.
create or replace function public.cp_space_timeout_until()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(until)
    from public.space_timeouts
   where student_id = public.cp_my_student_id()
     and until > now();
$$;

grant execute on function public.cp_space_timeout_until() to authenticated;

-- Exported so 0043 can allow a muted student to DM the instructor.
create or replace function public.cp_space_is_timed_out()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cp_space_timeout_until() is not null;
$$;

grant execute on function public.cp_space_is_timed_out() to authenticated;

-- THE gate every write in 0042+ must pass through.
create or replace function public.cp_space_can_post()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cp_space_state() = 'open' and not public.cp_space_is_timed_out();
$$;

grant execute on function public.cp_space_can_post() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. get_space_access() — the one call the student app makes
--
--    Returns the decided state rather than the raw inputs, deliberately. The
--    client mirroring this rule would be a SECOND definition of who is allowed
--    in, and every quantity this app has defined twice has drifted (the
--    show-up rate, four times; the points row, four times).
-- ----------------------------------------------------------------------------
drop function if exists public.get_space_access();
create function public.get_space_access()
returns table (
  state          text,
  can_post       boolean,
  timeout_until  timestamptz,
  timeout_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.cp_space_state(),
    public.cp_space_can_post(),
    public.cp_space_timeout_until(),
    (select t.reason
       from public.space_timeouts t
      where t.student_id = public.cp_my_student_id()
        and t.until > now()
      order by t.until desc
      limit 1);
$$;

grant execute on function public.get_space_access() to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Instructor controls (/teach/space)
-- ----------------------------------------------------------------------------

-- The master switch. Audited, because "when did Student Space go down" is a
-- question you will ask and the flag row only remembers the latest answer.
drop function if exists public.set_space_flag(boolean);
create function public.set_space_flag(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can change that.';
  end if;

  insert into public.app_flags (key, enabled, updated_at, updated_by)
       values ('student_space', p_enabled, now(), auth.uid())
  on conflict (key) do update
     set enabled = excluded.enabled,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by;

  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
       values (auth.uid(), 'space_flag', 'app_flags', null,
               case when p_enabled then 'Student Space resumed' else 'Student Space PAUSED' end,
               jsonb_build_object('key', 'student_space', 'enabled', p_enabled));

  return p_enabled;
end;
$$;

grant execute on function public.set_space_flag(boolean) to authenticated;

-- Add or remove one section from the beta.
drop function if exists public.set_section_space(uuid, boolean);
create function public.set_section_space(p_section_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section public.sections%rowtype;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can change that.';
  end if;

  select * into v_section from public.sections where id = p_section_id;
  if not found then
    raise exception 'That section no longer exists.';
  end if;
  if v_section.space_enabled = p_enabled then
    return p_enabled;                    -- idempotent; no audit noise
  end if;

  update public.sections set space_enabled = p_enabled where id = p_section_id;

  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
       values (auth.uid(), 'space_section', 'sections', p_section_id,
               v_section.name || (case when p_enabled then ' joined' else ' left' end)
                 || ' the Student Space beta',
               jsonb_build_object('section', v_section.name, 'enabled', p_enabled));

  return p_enabled;
end;
$$;

grant execute on function public.set_section_space(uuid, boolean) to authenticated;

-- The master switch's current value, on its own.
--
-- Separate from get_space_admin() because that returns one row PER SECTION, so
-- a semester with no sections yet would return zero rows and the toggle on
-- /teach/space would have nothing to render — the one screen that must always
-- be able to show you the state of the kill switch.
drop function if exists public.get_space_flag();
create function public.get_space_flag()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_instructor() then public.cp_space_flag() else null end;
$$;

grant execute on function public.get_space_flag() to authenticated;

-- The /teach/space roster: every section this semester, whether it is in the
-- beta, and how many active students that is.
drop function if exists public.get_space_admin();
create function public.get_space_admin()
returns table (
  flag_enabled  boolean,
  section_id    uuid,
  section_name  text,
  space_enabled boolean,
  student_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.cp_space_flag(),
    sec.id,
    sec.name,
    sec.space_enabled,
    (select count(*)::int
       from public.students stu
      where stu.section_id = sec.id
        and stu.archived_at is null)
  from public.sections sec
  where public.is_instructor()
    and sec.semester_id = public.cp_active_semester_id()
  order by sec.name;
$$;

grant execute on function public.get_space_admin() to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Timeouts
--
--    The table and its enforcement land here rather than with the moderation
--    UI (0044) because `cp_space_can_post()` is the gate every write in 0042
--    and 0043 calls — it cannot be added after the writes exist.
-- ----------------------------------------------------------------------------
drop function if exists public.timeout_student(uuid, timestamptz, text);
create function public.timeout_student(
  p_student_id uuid,
  p_until      timestamptz,
  p_reason     text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can time a student out.';
  end if;
  if p_until is null or p_until <= now() then
    raise exception 'Pick a time in the future.';
  end if;
  -- A year is not a timeout, it is a ban wearing a timeout's name. If that is
  -- what you want, take the section out of the beta instead.
  if p_until > now() + interval '90 days' then
    raise exception 'Timeouts cap at 90 days.';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then
    raise exception 'That student no longer exists.';
  end if;

  insert into public.space_timeouts (student_id, until, reason, created_by)
       values (p_student_id, p_until, nullif(btrim(coalesce(p_reason, '')), ''), auth.uid());

  insert into public.audit_log (actor, action, table_name, row_id, student_id, summary, row_data)
       values (auth.uid(), 'space_timeout', 'space_timeouts', p_student_id, p_student_id,
               v_student.full_name || ' muted until ' || to_char(p_until, 'YYYY-MM-DD HH24:MI'),
               jsonb_build_object('until', p_until, 'reason', p_reason));

  return p_until;
end;
$$;

grant execute on function public.timeout_student(uuid, timestamptz, text) to authenticated;

-- Lifting a mute EXPIRES the row rather than deleting it, so the history of
-- "this student was muted, and it was lifted early" survives.
drop function if exists public.clear_space_timeout(uuid);
create function public.clear_space_timeout(p_student_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can lift a timeout.';
  end if;

  update public.space_timeouts
     set until = now()
   where student_id = p_student_id
     and until > now();
  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into public.audit_log (actor, action, table_name, row_id, student_id, summary, row_data)
         values (auth.uid(), 'space_timeout', 'space_timeouts', p_student_id, p_student_id,
                 'Timeout lifted early',
                 jsonb_build_object('lifted', true, 'rows', v_count));
  end if;

  return v_count;
end;
$$;

grant execute on function public.clear_space_timeout(uuid) to authenticated;

-- Who is muted right now.
drop function if exists public.list_space_timeouts();
create function public.list_space_timeouts()
returns table (
  student_id   uuid,
  display_name text,
  section_name text,
  until        timestamptz,
  reason       text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.student_id, stu.display_name, sec.name, t.until, t.reason
    from public.space_timeouts t
    join public.students stu on stu.id = t.student_id
    left join public.sections sec on sec.id = stu.section_id
   where public.is_instructor()
     and t.until > now()
   order by t.until desc;
$$;

grant execute on function public.list_space_timeouts() to authenticated;

-- ============================================================================
-- Verify (run twice — this file is idempotent):
--
--   -- 1. The flag exists and is ON; every section is OFF, so nothing changed
--   --    for any student when this landed:
--   select key, enabled from public.app_flags;              -- student_space | t
--   select count(*) filter (where space_enabled) as in_beta,
--          count(*) filter (where not space_enabled) as out
--     from public.sections;                                 -- expect in_beta = 0
--
--   -- 2. As the INSTRUCTOR (run from the SQL editor, which has no JWT, so
--   --    is_instructor() is false there — check these from the app instead,
--   --    or impersonate). From the app, a student in a disabled section:
--   select * from public.get_space_access();
--   -- expect state = 'locked', can_post = false
--
--   -- 3. Turn one section on, re-check the same student:
--   --   select public.set_section_space('<section-uuid>', true);
--   --   select * from public.get_space_access();   -- 'open', can_post = true
--
--   -- 4. Pull the kill switch; the SAME student must read 'paused', not
--   --    'locked' — that distinction is the whole point of the second lever:
--   --   select public.set_space_flag(false);
--   --   select * from public.get_space_access();   -- 'paused', can_post = false
--   --   select public.set_space_flag(true);        -- put it back
--
--   -- 5. A timeout mutes without evicting:
--   --   select public.timeout_student('<student-uuid>', now() + interval '1 hour', 'testing');
--   --   -- as that student: state = 'open', can_post = FALSE
--   --   select public.clear_space_timeout('<student-uuid>');   -- returns 1
--
--   -- 6. The audit constraint still accepts everything it used to. This must
--   --    NOT error — it is the regression that has bitten twice:
--   select unnest(array['delete','archive','restore','hard_delete','broadcast',
--                       'promote','semester_activate','space_flag',
--                       'space_section','space_timeout']) as action;
--   -- (compare against pg_get_constraintdef for audit_log_action_check)
-- ============================================================================
