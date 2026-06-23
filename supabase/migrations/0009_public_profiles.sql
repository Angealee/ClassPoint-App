-- ============================================================================
-- ClassPoint · 0009 · Public student profiles (bio, interests, preview history)
-- Run after 0008. Safe to re-run (idempotent).
--
-- Powers the "tap a classmate on the leaderboard to see their profile" feature:
--   1. students.bio        — short, optional "about me" (student-editable).
--   2. students.interests  — short, optional comma-separated interests/hobbies.
--   3. public_point_events() — a read-only function that returns ANY student's
--      recent point history so classmates can see it on the profile preview.
--      point_events RLS otherwise restricts reads to the owner + instructor, so
--      this runs SECURITY DEFINER and only returns columns safe to show.
-- ============================================================================

-- 1. New self-described profile columns --------------------------------------
alter table public.students add column if not exists bio       text;
alter table public.students add column if not exists interests text;

-- Keep them short and safe — enforced by the DB, not just the UI.
alter table public.students drop constraint if exists students_bio_len_check;
alter table public.students
  add constraint students_bio_len_check
  check (bio is null or char_length(bio) <= 160);

alter table public.students drop constraint if exists students_interests_len_check;
alter table public.students
  add constraint students_interests_len_check
  check (interests is null or char_length(interests) <= 120);

-- The student-update guard is a denylist of protected columns. bio/interests are
-- not protected, so a student may edit them on their own row; the guard is
-- re-stated here only to keep its error message accurate.
create or replace function public.cp_guard_student_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Instructor edits anything; service role (auth.uid() is null) bypasses too.
  if public.is_instructor() or auth.uid() is null then
    return NEW;
  end if;
  if NEW.id              is distinct from OLD.id
     or NEW.section_id      is distinct from OLD.section_id
     or NEW.full_name       is distinct from OLD.full_name
     or NEW.lifetime_points is distinct from OLD.lifetime_points
     or NEW.user_id         is distinct from OLD.user_id
     or NEW.created_at      is distinct from OLD.created_at then
    raise exception 'You can only update your display name, photo, bio and interests.';
  end if;
  return NEW;
end;
$$;

-- 2. Public, read-only recent point history ----------------------------------
-- Returns the latest N events for ANY student. SECURITY DEFINER so it bypasses
-- the point_events RLS (which otherwise hides other students' rows). It exposes
-- only what is safe to show a classmate on the profile preview — never the
-- student id, so a caller can't enumerate anything they weren't already given.
create or replace function public.public_point_events(
  p_student_id uuid,
  p_limit      integer default 5
)
returns table (
  id         uuid,
  points     integer,
  category   text,
  note       text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, points, category, note, created_at
  from public.point_events
  where student_id = p_student_id
  order by created_at desc
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

grant execute on function public.public_point_events(uuid, integer) to authenticated;
