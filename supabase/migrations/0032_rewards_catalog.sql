-- ============================================================================
-- ClassPoint · 0032 · Rewards catalog (the price list)
-- Run after 0031. Safe to re-run.
--
-- WHY: the app has an economy with no prices. A student opens Use Points, sees
-- a number stepper and four abstract kinds (Quiz / Activity / Exam / Other), and
-- has to invent the ask themselves — with no way to know what 10 points is
-- actually worth. Every request then becomes a negotiation the instructor has to
-- adjudicate.
--
-- This is the instructor-authored price list. A student taps an item and it
-- pre-fills the request; the free-form path stays for anything not on the list.
--
-- DELIBERATELY NOT semester-scoped. A price list is a standing policy, not a
-- per-term artefact — retire or reprice an item with `archived_at` instead of
-- recreating the catalog every rollover. (The rollover wizard will show a
-- non-blocking "review your prices" nudge.)
--
-- The redemption RPCs are UNTOUCHED. A catalog tap only pre-fills
-- `request_point_redemption`, so the FOR UPDATE row-locking and the
-- overspend-prevention logic from 0019/0029 keep working exactly as they are.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. The catalog ships EMPTY by design — add your rewards in the app
--   (Requests → Rewards). Nothing arbitrary is written to your database here.
-- ============================================================================

create table if not exists public.reward_catalog_items (
  id         uuid primary key default gen_random_uuid(),
  -- What the student is buying, in their words: "+2 on a quiz".
  label      text not null check (char_length(btrim(label)) between 1 and 60),
  -- Capped at 50 to match request_point_redemption's own limit (0029:207) —
  -- an item priced above it could be displayed but never actually requested.
  points     integer not null check (points between 1 and 50),
  -- Mirrors point_redemptions.kind so an approved catalog request is
  -- indistinguishable from a free-form one downstream.
  kind       text not null check (kind in ('quiz', 'activity', 'exam', 'other')),
  sort_order integer not null default 0,
  -- Retire without deleting: existing redemptions keep their meaning, and the
  -- item simply stops being offered.
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reward_catalog_live_idx
  on public.reward_catalog_items (sort_order, created_at)
  where archived_at is null;

alter table public.reward_catalog_items enable row level security;

-- Students see the live menu; only the instructor writes it.
drop policy if exists reward_catalog_select on public.reward_catalog_items;
create policy reward_catalog_select on public.reward_catalog_items
  for select to authenticated using (archived_at is null or public.is_instructor());

drop policy if exists reward_catalog_write on public.reward_catalog_items;
create policy reward_catalog_write on public.reward_catalog_items
  for all to authenticated
  using (public.is_instructor())
  with check (public.is_instructor());

grant select, insert, update, delete on public.reward_catalog_items to authenticated;

-- ----------------------------------------------------------------------------
-- Back it up with everything else.
-- Ownership move: cp_nightly_backup 0027 → 0032. Same signature, so a plain
-- `create or replace` rebinds it; only the `tables` array changed. The backup
-- mirror self-creates on first run via the existing exception handler.
-- ----------------------------------------------------------------------------
create or replace function public.cp_nightly_backup()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t      text;
  tables constant text[] := array[
    'students', 'point_events', 'attendance_records', 'class_sessions',
    'sections', 'point_redemptions', 'student_achievements', 'student_secrets',
    'semesters', 'semester_terms', 'subjects', 'section_subjects',
    'reward_catalog_items'
  ];
begin
  foreach t in array tables loop
    begin
      -- Idempotent per day: re-running replaces today's snapshot.
      execute format('delete from backup.%I where snapshot_date = current_date', t);
      execute format('insert into backup.%I select current_date, s.* from public.%I s', t, t);
    exception when others then
      -- Schema drift (or a brand-new table): rebuild the mirror and retry once.
      -- Old snapshots for this one table are sacrificed for a working backup
      -- going forward — the other tables' history is untouched.
      execute format('drop table if exists backup.%I', t);
      execute format('create table backup.%I (snapshot_date date not null, like public.%I)', t, t);
      execute format('create index on backup.%I (snapshot_date)', t);
      execute format('insert into backup.%I select current_date, s.* from public.%I s', t, t);
    end;
  end loop;

  -- Retention: 14 daily snapshots; audit trail kept a full year.
  foreach t in array tables loop
    execute format('delete from backup.%I where snapshot_date < current_date - 14', t);
  end loop;
  delete from public.audit_log where at < now() - interval '365 days';
end;
$$;

revoke execute on function public.cp_nightly_backup() from public, anon, authenticated;

-- ============================================================================
-- Verify (run twice — this file is idempotent):
--
--   -- Empty by design; you add rewards in the app.
--   select count(*) from public.reward_catalog_items;              -- 0
--
--   -- A price above the RPC's own ceiling must be refused:
--   -- insert into public.reward_catalog_items (label, points, kind)
--   --   values ('Too expensive', 99, 'quiz');   -- expect a CHECK violation
--
--   -- After adding a few in the app, confirm ordering and retirement work:
--   select label, points, kind, sort_order, archived_at
--     from public.reward_catalog_items order by sort_order, created_at;
-- ============================================================================
