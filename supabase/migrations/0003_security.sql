-- ============================================================================
-- ClassPoint · 0003 · Row-Level Security + grants
-- Run after 0002.
-- ============================================================================

alter table public.sections        enable row level security;
alter table public.students        enable row level security;
alter table public.student_secrets enable row level security;
alter table public.point_events    enable row level security;
alter table public.instructors     enable row level security;

-- sections ---------------------------------------------------------------------
drop policy if exists sections_select on public.sections;
create policy sections_select on public.sections
  for select to authenticated using (true);

drop policy if exists sections_write on public.sections;
create policy sections_write on public.sections
  for all to authenticated
  using (public.is_instructor())
  with check (public.is_instructor());

-- students ---------------------------------------------------------------------
-- Everyone signed in can read (powers the leaderboard + realtime).
drop policy if exists students_select on public.students;
create policy students_select on public.students
  for select to authenticated using (true);

drop policy if exists students_insert on public.students;
create policy students_insert on public.students
  for insert to authenticated with check (public.is_instructor());

-- Instructor edits anyone; a student edits only their own row.
-- (Column restriction for students is enforced by trg_guard_student_update.)
drop policy if exists students_update on public.students;
create policy students_update on public.students
  for update to authenticated
  using (public.is_instructor() or user_id = auth.uid())
  with check (public.is_instructor() or user_id = auth.uid());

drop policy if exists students_delete on public.students;
create policy students_delete on public.students
  for delete to authenticated using (public.is_instructor());

-- student_secrets --------------------------------------------------------------
-- Instructor only. (The claim Edge Function uses the service role, which
-- bypasses RLS; students can never read tokens or usernames.)
drop policy if exists secrets_all on public.student_secrets;
create policy secrets_all on public.student_secrets
  for all to authenticated
  using (public.is_instructor())
  with check (public.is_instructor());

-- point_events -----------------------------------------------------------------
drop policy if exists points_select on public.point_events;
create policy points_select on public.point_events
  for select to authenticated using (
    public.is_instructor()
    or student_id in (select id from public.students where user_id = auth.uid())
  );

drop policy if exists points_write on public.point_events;
create policy points_write on public.point_events
  for all to authenticated
  using (public.is_instructor())
  with check (public.is_instructor());

-- instructors ------------------------------------------------------------------
-- RLS enabled with NO policies => no direct client access. is_instructor()
-- reads it via SECURITY DEFINER, and seeding runs as the postgres role.

-- Grants (RLS still gates which rows each role may touch) -----------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.sections        to authenticated;
grant select, insert, update, delete on public.students        to authenticated;
grant select, insert, update, delete on public.student_secrets to authenticated;
grant select, insert, update, delete on public.point_events    to authenticated;

grant execute on function public.is_instructor()              to authenticated;
grant execute on function public.cp_level(integer)            to authenticated, anon;
grant execute on function public.create_student(uuid, text)   to authenticated;
