-- ============================================================================
-- ClassPoint · 0007 · Avatars (storage), bulk import, minus points
-- Run after 0006. Safe to re-run (idempotent).
--
-- This migration powers three features:
--   1. Student profile pictures        -> a public `avatars` Storage bucket + policies
--   2. Instructor Excel/CSV roster import -> create_students() bulk RPC
--   3. Minus points (penalties)        -> point_events accepts -5..-1, a 'penalty'
--                                         category, and totals never go below 0
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Avatars storage bucket
--    Public-read (avatar URLs appear on the leaderboard for every signed-in
--    user). Each student may only write inside a folder named after their auth
--    user id, e.g.  <auth.uid()>/avatar.png  — enforced by the policies below.
--    The 5 MB cap is enforced here too, not just in the browser.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,                                              -- 5 MB
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may read avatar objects (the bucket is public anyway; this also keeps
-- signed reads working if the bucket is later flipped to private).
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select to public
  using (bucket_id = 'avatars');

-- A signed-in user may upload/replace/delete only within their own uid folder.
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- 2. Minus points (penalties)
--    Points may now be negative (a violation deducts), but never 0. A student's
--    lifetime_points is still SUM(points) — clamped at 0 so XP/level math (which
--    assumes a non-negative total) never breaks and the table's
--    `lifetime_points >= 0` check always holds.
-- ----------------------------------------------------------------------------
alter table public.point_events
  drop constraint if exists point_events_points_check;
alter table public.point_events
  add constraint point_events_points_check
  check (points between -5 and 5 and points <> 0);

-- Allow a dedicated 'penalty' category so deductions read clearly in the feed.
alter table public.point_events
  drop constraint if exists point_events_category_check;
alter table public.point_events
  add constraint point_events_category_check
  check (category in ('recitation','activity','penalty'));

-- Recompute now clamps the running total at 0.
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
     set lifetime_points = greatest(
       0,
       coalesce((select sum(points) from public.point_events where student_id = target), 0)
     )
   where s.id = target;
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Bulk roster import
--    Insert many students into one section in a single round-trip, each with a
--    fresh one-time claim token. Instructor-only, mirrors create_student().
-- ----------------------------------------------------------------------------
create or replace function public.create_students(
  p_section_id uuid,
  p_full_names text[]
)
returns table (full_name text, claim_token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name  text;
  v_id    uuid;
  v_token text;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can add students.';
  end if;

  foreach v_name in array p_full_names loop
    v_name := btrim(v_name);
    continue when v_name = '';

    v_token := public.cp_generate_token();

    insert into public.students (section_id, full_name, display_name)
         values (p_section_id, v_name, v_name)
      returning id into v_id;

    insert into public.student_secrets (student_id, claim_token)
         values (v_id, v_token);

    full_name  := v_name;
    claim_token := v_token;
    return next;
  end loop;
end;
$$;

grant execute on function public.create_students(uuid, text[]) to authenticated;
