-- ============================================================================
-- ClassPoint · 0001 · Schema (extensions, tables, indexes)
-- Run this first in the Supabase SQL Editor.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Sections, e.g. 2A .. 2E ------------------------------------------------------
create table if not exists public.sections (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- Students: public-safe profile + points.
-- Broadly readable (RLS below) so the leaderboard + realtime work for everyone.
create table if not exists public.students (
  id              uuid primary key default gen_random_uuid(),
  section_id      uuid not null references public.sections(id) on delete cascade,
  full_name       text not null,                 -- roster name, set by instructor
  display_name    text not null,                 -- shown publicly; student-editable
  avatar_url      text,
  lifetime_points integer not null default 0 check (lifetime_points >= 0),
  user_id         uuid unique references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists students_section_idx on public.students (section_id);
create index if not exists students_points_idx  on public.students (lifetime_points desc);
create index if not exists students_user_idx     on public.students (user_id);

-- Student secrets: one-time claim token + chosen username.
-- Instructor-only (and service role) — never exposed to students.
create table if not exists public.student_secrets (
  student_id   uuid primary key references public.students(id) on delete cascade,
  claim_token  text not null unique,
  username     text,                             -- chosen at claim; login identifier
  claimed_at   timestamptz
);
create unique index if not exists student_secrets_username_idx
  on public.student_secrets (lower(username)) where username is not null;

-- Point events: the per-award history / student feed.
create table if not exists public.point_events (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  points      integer not null check (points between 1 and 5),
  category    text not null check (category in ('recitation','activity')),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists point_events_student_idx
  on public.point_events (student_id, created_at desc);

-- Instructor allowlist (by email). Seeded in 0005.
create table if not exists public.instructors (
  email text primary key
);
