-- ============================================================================
-- ClassPoint · 0040 · Where the cover photo sits
-- Run after 0039. Safe to re-run.
--
-- 0039 added `header_url` and rendered it with `object-fit: cover`, which
-- centres the image and crops the rest. On a portrait — the common case, since
-- students pick photos of themselves — centring cuts the head off.
--
-- This stores WHICH PART of the image to show, as a single vertical focal
-- point: 0 = align the top edge, 100 = align the bottom, 50 = centred (the
-- old behaviour, and the default). It maps straight onto CSS
-- `object-position: 50% <n>%`, so rendering it costs nothing.
--
-- ── WHY A FOCAL POINT AND NOT A CROPPED UPLOAD ──────────────────────────────
-- Cropping in the browser and uploading the result would need no column at
-- all. It was rejected on purpose: it throws the original away, so changing
-- your mind later means finding and re-picking the file. Storing a position
-- keeps the full image and makes the cover adjustable forever — which is what
-- "adjustable" has to mean to be worth building.
--
-- Horizontal position is deliberately NOT stored. The cover is a wide, short
-- strip and the image is scaled to cover it, so on almost every photo there is
-- vertical slack and no horizontal slack — a second axis would be a control
-- that does nothing in the overwhelming majority of cases.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

alter table public.students
  add column if not exists header_pos smallint not null default 50;

-- Named so a future widening follows the 0007/0011 precedent of keeping the
-- constraint name stable.
alter table public.students
  drop constraint if exists students_header_pos_check;
alter table public.students
  add constraint students_header_pos_check check (header_pos between 0 and 100);

comment on column public.students.header_pos is
  'Vertical focal point of header_url, 0-100, used as CSS object-position '
  '50% <n>%. 50 = centred, which is the pre-0040 rendering.';

-- ============================================================================
-- Verify (run twice — this file is idempotent):
--
--   select column_name, data_type, column_default, is_nullable
--     from information_schema.columns
--    where table_name = 'students' and column_name = 'header_pos';
--   -- expect smallint, default 50, NOT NULL
--
--   -- Every existing row keeps the old centred rendering:
--   select count(*) filter (where header_pos = 50) as centred,
--          count(*) filter (where header_pos <> 50) as moved
--     from public.students;   -- expect moved = 0 immediately after this runs
--
--   -- The CHECK actually bites:
--   --   update public.students set header_pos = 101 where id = (select id from public.students limit 1);
--   --   ERROR:  new row for relation "students" violates check constraint
--   --           "students_header_pos_check"
-- ============================================================================
