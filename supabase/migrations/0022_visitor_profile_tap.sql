-- ============================================================================
-- ClassPoint · 0022 · Tappable profile viewers
-- Run after 0021. Safe to re-run (idempotent).
--
-- WHY: get_profile_visitors (0021) returned only display_name/avatar_url, so a
-- row couldn't open the viewer's profile. This recreates it to also return the
-- viewer's student id + the fields the profile-preview header needs
-- (section, points, rank) so a tap opens their profile with no extra fetch.
--
-- Return type changes → DROP first (the 0014 lesson). Owner-only gate unchanged.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Paste and run.
-- ============================================================================

drop function if exists public.get_profile_visitors(uuid, int, int);
create function public.get_profile_visitors(
  p_student_id uuid,
  p_offset int default 0,
  p_limit  int default 20
) returns table (
  student_id     uuid,
  display_name   text,
  avatar_url     text,
  section_id     uuid,
  lifetime_points int,
  rank           int,
  last_viewed_at timestamptz,
  view_count     int,
  total_count    bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the owner sees their own visitor list — never leak who viewed whom.
  if not exists (
    select 1 from public.students
     where id = p_student_id and user_id = auth.uid()
  ) then
    return;
  end if;

  return query
    select s.id,
           s.display_name,
           s.avatar_url,
           s.section_id,
           s.lifetime_points,
           ls.rank,
           pv.last_viewed_at,
           pv.view_count,
           count(*) over() as total_count
      from public.profile_views pv
      join public.students s on s.id = pv.viewer_id
      left join public.leaderboard_snapshot ls on ls.student_id = s.id
     where pv.viewed_id = p_student_id
     order by pv.last_viewed_at desc
     offset greatest(p_offset, 0)
     limit least(greatest(p_limit, 1), 50);
end;
$$;

grant execute on function public.get_profile_visitors(uuid, int, int) to authenticated;
