-- ============================================================================
-- ClassPoint · 0005 · Seed
-- Instructor allowlist + sections 2A..2E. Safe to re-run.
-- Run after 0004.
-- ============================================================================

insert into public.instructors (email)
values ('koby.macale@dct.edu.ph')
on conflict (email) do nothing;

insert into public.sections (name)
values ('2A'), ('2B'), ('2C'), ('2D'), ('2E')
on conflict (name) do nothing;
