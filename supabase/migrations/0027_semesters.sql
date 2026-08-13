-- ============================================================================
-- ClassPoint · 0027 · Semesters, terms & subjects
-- Run after 0026. Safe to re-run.
--
-- WHY: until now the app had no academic structure at all. Week numbers were
-- derived client-side from a hardcoded constant (TERM_START in src/lib/term.ts),
-- sections were one flat global list, and there was no notion of a subject. This
-- migration gives the data a real shape:
--
--     semester → term (prelim | midterm | finals) → subject → section
--
-- Design notes worth keeping:
--   • Term dates are STORED, not computed. Six-week arithmetic is only the
--     default we seed; real calendars move for holidays and suspensions, so the
--     instructor edits the six dates in the app and week/term tags follow.
--   • Exactly ONE semester is active at a time, enforced by a partial unique
--     index rather than application code.
--   • `sections.name` loses its GLOBAL unique constraint — the whole point is
--     that "BSIT 2A" can exist in several semesters. Uniqueness moves to
--     (semester_id, lower(name)).
--   • Subjects belong to a semester and are ASSIGNED to sections, so pickers can
--     offer only valid subject↔section combinations.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. The backfill below adopts all existing data into
--   "1st Sem AY 2026–2027" automatically.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.semesters (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  -- Week 1 anchor. Should be a Monday; the app validates that on input.
  starts_on  date not null,
  is_active  boolean not null default false,
  created_at timestamptz not null default now()
);

-- At most one active semester. All indexed rows have is_active = true, so
-- uniqueness on that column means "only one row may be active".
create unique index if not exists semesters_one_active_idx
  on public.semesters (is_active) where is_active;

create table if not exists public.semester_terms (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  term        text not null check (term in ('prelim','midterm','finals')),
  starts_on   date not null,
  ends_on     date not null,
  constraint semester_terms_order_check check (ends_on >= starts_on),
  unique (semester_id, term)
);

create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  code        text not null,               -- "IT 32"
  name        text not null,               -- "Platform Technologies"
  created_at  timestamptz not null default now(),
  unique (semester_id, code)
);

-- Which sections take which subject. A section with two subjects means the same
-- roster meets you twice a week under two different labels.
create table if not exists public.section_subjects (
  section_id uuid not null references public.sections(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  primary key (section_id, subject_id)
);

alter table public.sections
  add column if not exists semester_id uuid references public.semesters(id);

-- ----------------------------------------------------------------------------
-- 2. Active-semester helper
--    Used by column defaults here and by the point-stamping trigger in 0029.
-- ----------------------------------------------------------------------------
create or replace function public.cp_active_semester_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.semesters where is_active limit 1;
$$;

grant execute on function public.cp_active_semester_id() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Backfill — adopt everything that already exists
--    Ordered: semester → terms → subjects → attach sections → constraints.
-- ----------------------------------------------------------------------------
insert into public.semesters (name, starts_on, is_active)
     values ('1st Sem AY 2026–2027', date '2026-06-15', true)
on conflict (name) do nothing;

-- Six weeks each from the June 15 2026 anchor. `on conflict do nothing` matters:
-- once the instructor edits these dates in the app, re-running this migration
-- must NOT stomp the edit.
-- Both seeds below target the EARLIEST semester rather than matching the name
-- string: the name contains an en dash, and a paste that mangles it would make
-- these silently insert nothing.
insert into public.semester_terms (semester_id, term, starts_on, ends_on)
select s.id, t.term, t.starts_on, t.ends_on
  from (select id from public.semesters order by starts_on limit 1) s
  cross join (values
      ('prelim',  date '2026-06-15', date '2026-07-26'),   -- weeks 1–6
      ('midterm', date '2026-07-27', date '2026-09-06'),   -- weeks 7–12
      ('finals',  date '2026-09-07', date '2026-10-18')    -- weeks 13–18
    ) as t(term, starts_on, ends_on)
on conflict (semester_id, term) do nothing;

insert into public.subjects (semester_id, code, name)
select s.id, v.code, v.name
  from (select id from public.semesters order by starts_on limit 1) s
  cross join (values
      ('IT 32',      'Platform Technologies'),
      ('Elective 1', 'Event-driven Programming')
    ) as v(code, name)
on conflict (semester_id, code) do nothing;

-- Existing sections join the first semester.
update public.sections
   set semester_id = (select id from public.semesters order by starts_on limit 1)
 where semester_id is null;

-- Only enforce NOT NULL once nothing is orphaned (re-running is a no-op).
do $$
begin
  if not exists (select 1 from public.sections where semester_id is null) then
    alter table public.sections alter column semester_id set not null;
  end if;
end
$$;

-- Safety net so a section can never be created outside a semester by accident.
alter table public.sections
  alter column semester_id set default public.cp_active_semester_id();

-- THE blocker for per-semester rosters: `name text not null unique` from 0001
-- made "BSIT 2A" globally unique. Uniqueness is per-semester now.
alter table public.sections drop constraint if exists sections_name_key;
create unique index if not exists sections_semester_name_idx
  on public.sections (semester_id, lower(name));

-- Assign every existing subject to every existing section, but ONLY on the very
-- first run. Guarding on "the table is completely empty" is what lets the
-- instructor untick a combination without this migration re-ticking it.
insert into public.section_subjects (section_id, subject_id)
select sec.id, sub.id
  from public.sections sec
  join public.subjects sub on sub.semester_id = sec.semester_id
 where not exists (select 1 from public.section_subjects)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 4. RLS — students read (they need term dates and subject names), instructor writes
-- ----------------------------------------------------------------------------
alter table public.semesters       enable row level security;
alter table public.semester_terms  enable row level security;
alter table public.subjects        enable row level security;
alter table public.section_subjects enable row level security;

drop policy if exists semesters_select on public.semesters;
create policy semesters_select on public.semesters
  for select to authenticated using (true);
drop policy if exists semesters_write on public.semesters;
create policy semesters_write on public.semesters
  for all to authenticated using (public.is_instructor()) with check (public.is_instructor());

drop policy if exists semester_terms_select on public.semester_terms;
create policy semester_terms_select on public.semester_terms
  for select to authenticated using (true);
drop policy if exists semester_terms_write on public.semester_terms;
create policy semester_terms_write on public.semester_terms
  for all to authenticated using (public.is_instructor()) with check (public.is_instructor());

drop policy if exists subjects_select on public.subjects;
create policy subjects_select on public.subjects
  for select to authenticated using (true);
drop policy if exists subjects_write on public.subjects;
create policy subjects_write on public.subjects
  for all to authenticated using (public.is_instructor()) with check (public.is_instructor());

drop policy if exists section_subjects_select on public.section_subjects;
create policy section_subjects_select on public.section_subjects
  for select to authenticated using (true);
drop policy if exists section_subjects_write on public.section_subjects;
create policy section_subjects_write on public.section_subjects
  for all to authenticated using (public.is_instructor()) with check (public.is_instructor());

grant select, insert, update, delete on public.semesters       to authenticated;
grant select, insert, update, delete on public.semester_terms  to authenticated;
grant select, insert, update, delete on public.subjects        to authenticated;
grant select, insert, update, delete on public.section_subjects to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Back these up too
--    Ownership move: cp_nightly_backup 0023 → 0027. Same signature, so a plain
--    `create or replace` rebinds it. Only the `tables` array changed — the
--    mirrors in the backup schema self-create on first run via the exception
--    handler, so no `backup.*` DDL is needed here.
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
    'semesters', 'semester_terms', 'subjects', 'section_subjects'
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
--   select name, starts_on, is_active from public.semesters;
--   select term, starts_on, ends_on from public.semester_terms order by starts_on;
--   select code, name from public.subjects;
--   select count(*) as unattached from public.sections where semester_id is null;  -- 0
--   select count(*) from public.section_subjects;   -- sections × subjects
--
--   -- The idempotency test that actually matters: untick one combination,
--   -- re-run this file, and confirm it stays unticked.
--   delete from public.section_subjects
--    where ctid = (select ctid from public.section_subjects limit 1);
-- ============================================================================
