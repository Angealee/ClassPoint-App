-- ============================================================================
-- ClassPoint · 0015 · Profile social (photo banners + profile views)
-- Run after 0014. Safe to re-run (idempotent).
--
-- WHAT THIS ADDS
--   1. students.banner_urls  — up to 3 public "showcase" photos a student can put
--      on their profile. Reuses the existing public `avatars` Storage bucket (its
--      RLS already allows any object under <auth.uid()>/…), so no new bucket.
--   2. profile_views         — "who viewed your profile" (Messenger-style) + a
--      total view counter. One row per (viewer, viewed) pair; repeat views bump
--      view_count + last_viewed_at. Read/write only through the SECURITY DEFINER
--      RPCs below, so a student can see who viewed THEM but can't enumerate
--      anyone else's visitor list.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Photo banner column (up to 3 URLs)
-- ----------------------------------------------------------------------------
alter table public.students add column if not exists banner_urls text[];

alter table public.students drop constraint if exists students_banner_len_check;
alter table public.students
  add constraint students_banner_len_check
  check (banner_urls is null or array_length(banner_urls, 1) <= 3);

-- banner_urls is NOT in cp_guard_student_update's protected denylist, so a student
-- may set it on their own row (like bio/interests/avatar) — no trigger change.

-- ----------------------------------------------------------------------------
-- 2. Profile views table
-- ----------------------------------------------------------------------------
create table if not exists public.profile_views (
  viewer_id      uuid not null references public.students(id) on delete cascade,
  viewed_id      uuid not null references public.students(id) on delete cascade,
  view_count     integer not null default 1,
  last_viewed_at timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  primary key (viewer_id, viewed_id)
);
create index if not exists profile_views_viewed_idx
  on public.profile_views (viewed_id, last_viewed_at desc);

alter table public.profile_views enable row level security;
-- No permissive policies: all access is via the SECURITY DEFINER RPCs below, so
-- direct table reads/writes are denied and nobody can scrape the raw view log.

-- ----------------------------------------------------------------------------
-- 3. Record a view. Resolves the viewer from auth.uid() so a caller can't spoof
--    someone else. No-op for non-students (e.g. the instructor) and self-views.
-- ----------------------------------------------------------------------------
create or replace function public.record_profile_view(p_viewed_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid;
begin
  select id into v_viewer from public.students where user_id = auth.uid();
  if v_viewer is null then return; end if;        -- not a claimed student
  if v_viewer = p_viewed_id then return; end if;  -- don't count viewing yourself

  insert into public.profile_views (viewer_id, viewed_id, view_count, last_viewed_at)
       values (v_viewer, p_viewed_id, 1, now())
  on conflict (viewer_id, viewed_id) do update
     set view_count     = public.profile_views.view_count + 1,
         last_viewed_at = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Read a profile's views. Only the OWNER (p_student_id = caller's student row)
--    gets real data — everyone else gets zeros/[] so visitor lists can't leak.
--    `recent` is a jsonb array of { display_name, avatar_url, last_viewed_at }.
-- ----------------------------------------------------------------------------
create or replace function public.get_profile_views(
  p_student_id uuid,
  p_limit      integer default 8
)
returns table (total_views bigint, visitor_count bigint, recent jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.students where user_id = auth.uid() and id = p_student_id
  ) then
    return query select 0::bigint, 0::bigint, '[]'::jsonb;
    return;
  end if;

  return query
    select
      coalesce(sum(v.view_count), 0)::bigint,
      count(*)::bigint,
      coalesce(
        (
          select jsonb_agg(r)
          from (
            select s.display_name, s.avatar_url, v2.last_viewed_at
            from public.profile_views v2
            join public.students s on s.id = v2.viewer_id
            where v2.viewed_id = p_student_id
            order by v2.last_viewed_at desc
            limit least(greatest(coalesce(p_limit, 8), 1), 20)
          ) r
        ),
        '[]'::jsonb
      )
    from public.profile_views v
    where v.viewed_id = p_student_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant execute on function public.record_profile_view(uuid)          to authenticated;
grant execute on function public.get_profile_views(uuid, integer)   to authenticated;
