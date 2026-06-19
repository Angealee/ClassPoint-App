-- ============================================================================
-- ClassPoint · 0004 · Realtime
-- Adds tables to the supabase_realtime publication (idempotent).
-- Run after 0003.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'students'
  ) then
    alter publication supabase_realtime add table public.students;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'point_events'
  ) then
    alter publication supabase_realtime add table public.point_events;
  end if;
end
$$;
