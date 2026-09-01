-- ============================================================================
-- ClassPoint · 0039 · A header photo on the student profile
-- Run after 0038. Safe to re-run.
--
-- `banner_urls` (0015) is a STRIP of up to three showcase photos — the "Photos"
-- section. It is not a cover image, and repurposing its first slot as one would
-- silently change what that strip shows for every student who already has
-- photos. So the header gets its own column.
--
-- One nullable column, and nothing else. `get_public_profile` is not an RPC —
-- `getPublicProfile` selects from `students` directly — so there is no return
-- type to grow and no function to drop-and-recreate here.
--
-- RLS needs no change: the policies on `students` are ROW level, and this adds
-- a column to rows the reader can already see.
--
-- `cp_nightly_backup` (owner: 0032) needs no change either — it mirrors
-- `students` wholesale and self-heals on schema drift via its exception handler.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Uploads reuse the existing `avatars` storage bucket and the 5 MB cap
--   already enforced client-side for avatars and showcase photos.
-- ============================================================================

alter table public.students
  add column if not exists header_url text;

comment on column public.students.header_url is
  'Optional wide cover image shown at the top of the profile. Distinct from '
  'banner_urls, which is the up-to-three showcase photo strip (0015).';

-- ============================================================================
-- Verify (run twice — this file is idempotent):
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_name = 'students' and column_name = 'header_url';
--   -- expect one row, text, YES
--
--   -- Every existing student starts with no header, which is the intended
--   -- state — the profile renders a plain gradient until one is uploaded:
--   select count(*) filter (where header_url is null) as without_header,
--          count(*) filter (where header_url is not null) as with_header
--     from public.students;
-- ============================================================================
