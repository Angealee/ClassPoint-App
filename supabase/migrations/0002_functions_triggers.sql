-- ============================================================================
-- ClassPoint · 0002 · Functions & triggers
-- Run after 0001.
-- ============================================================================

-- is_instructor(): true when the caller's email is in the allowlist.
-- SECURITY DEFINER so it can read public.instructors regardless of RLS.
create or replace function public.is_instructor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.instructors i
    where lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- cp_level(): mirrors src/lib/leveling.ts exactly.
-- Level 1 clears at 50 XP; each next requirement = round(previous * 1.5).
-- 50 -> 75 -> 113 -> 170 -> ...
create or replace function public.cp_level(total_points integer)
returns integer
language plpgsql
immutable
as $$
declare
  lvl       integer := 1;
  remaining integer := greatest(0, total_points);
  req       integer := 50;
begin
  while remaining >= req loop
    remaining := remaining - req;
    lvl := lvl + 1;
    req := round(req * 1.5)::integer;
  end loop;
  return lvl;
end;
$$;

-- cp_generate_token(): 8-char uppercase hex claim token (e.g. "9F3A1C7B").
create or replace function public.cp_generate_token()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8));
$$;

-- Keep students.lifetime_points in sync with their point_events.
create or replace function public.cp_recompute_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(NEW.student_id, OLD.student_id);
begin
  update public.students s
     set lifetime_points = coalesce(
       (select sum(points) from public.point_events where student_id = target), 0)
   where s.id = target;
  return null;
end;
$$;

-- Non-instructors may only change display_name / avatar_url on their own row.
create or replace function public.cp_guard_student_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Instructor edits anything; service role (no end-user, auth.uid() is null,
  -- e.g. the claim Edge Function) bypasses so it can link the account.
  if public.is_instructor() or auth.uid() is null then
    return NEW;
  end if;
  if NEW.id              is distinct from OLD.id
     or NEW.section_id      is distinct from OLD.section_id
     or NEW.full_name       is distinct from OLD.full_name
     or NEW.lifetime_points is distinct from OLD.lifetime_points
     or NEW.user_id         is distinct from OLD.user_id
     or NEW.created_at      is distinct from OLD.created_at then
    raise exception 'You can only update your display name and avatar.';
  end if;
  return NEW;
end;
$$;

-- Instructor: add a roster entry, returns the generated claim token.
create or replace function public.create_student(
  p_section_id uuid,
  p_full_name  text
)
returns table (student_id uuid, claim_token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id    uuid;
  v_token text;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can add students.';
  end if;

  v_token := public.cp_generate_token();

  insert into public.students (section_id, full_name, display_name)
       values (p_section_id, p_full_name, p_full_name)
    returning id into v_id;

  insert into public.student_secrets (student_id, claim_token)
       values (v_id, v_token);

  return query select v_id, v_token;
end;
$$;

-- Triggers ---------------------------------------------------------------------
drop trigger if exists trg_points_recompute on public.point_events;
create trigger trg_points_recompute
  after insert or update or delete on public.point_events
  for each row execute function public.cp_recompute_points();

drop trigger if exists trg_guard_student_update on public.students;
create trigger trg_guard_student_update
  before update on public.students
  for each row execute function public.cp_guard_student_update();
