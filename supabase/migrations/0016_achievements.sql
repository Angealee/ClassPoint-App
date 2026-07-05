-- ============================================================================
-- ClassPoint · 0016 · Achievements (badges, titles, instructor recognitions)
-- Run after 0015. Safe to re-run (idempotent).
--
-- WHAT THIS ADDS
--   * achievements         — the static catalog of 30 achievements (seeded
--     below). Not instructor-editable in v1; a fixed reference table.
--   * student_achievements — the unlock ledger. All writes go through the
--     SECURITY DEFINER RPCs below (mirrors the profile_views pattern from
--     0015) — nothing here is client-writable directly.
--   * students.display_title      — the title a student has equipped, if any.
--   * students.pinned_achievements — up to 3 favorite unlocked codes to
--     feature first on the profile (mirrors banner_urls from 0015).
--
-- EVALUATION MODEL
--   Server-authoritative, like every other gamified number in this app.
--   `sync_achievements(student_id)` re-derives each `system`-granted metric
--   fresh from source tables (never trusts client input) and unlocks anything
--   newly satisfied. The client calls it opportunistically (on load, after
--   saving a profile field, after a scan, after viewing someone) rather than
--   this migration adding triggers on point_events/attendance_records/
--   profile_views/students — fewer moving parts to keep in sync with a
--   redeployed function, which is exactly the class of bug the attendance
--   "could not create session" fix (0014) ran into this session.
--   `grant_achievement(student_id, code)` is the separate, instructor-only
--   path for the 5 `recognition`-category rows that have no computable
--   criteria at all (Most Improved, Class MVP, etc).
--
--   `icon_key` was in the original plan but is dropped here: `code` is
--   already a stable per-achievement slug, so the client's badge-art
--   component just switches on `code` directly — one less column with no
--   current benefit (nothing shares an icon yet).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table if not exists public.achievements (
  code        text primary key,
  category    text not null check (category in ('points','attendance','growth','social','fun','recognition')),
  name        text not null,
  description text not null,
  -- Hidden as "???" until unlocked (a few "fun" ones are a surprise).
  secret      boolean not null default false,
  -- 'system' = auto-evaluated by sync_achievements(); 'instructor' = only
  -- grant_achievement() may insert it (no computable criteria).
  granted_by  text not null default 'system' check (granted_by in ('system','instructor')),
  -- Non-null only for the achievements that also grant a display title.
  title_text  text,
  -- Which numeric value from cp_achievement_metrics() this achievement tracks
  -- (null for boolean/one-off/instructor-granted achievements with no
  -- meaningful "7/10"-style progress bar), and the value that clears it.
  -- 'rank' is the one inverted metric (lower is better).
  metric      text check (
    metric is null or metric in (
      'points','recitations','present_count','attended_count','streak','early_streak',
      'level','rank','views_received','views_given','unlocked_count','banner_count'
    )
  ),
  threshold   integer,
  sort_order  integer not null default 0
);

create table if not exists public.student_achievements (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  achievement_code text not null references public.achievements(code) on delete cascade,
  unlocked_at      timestamptz not null default now(),
  -- Set only for instructor-granted rows (audit trail); null for auto-unlocks.
  granted_by       uuid references auth.users(id) on delete set null,
  unique (student_id, achievement_code)
);
create index if not exists student_achievements_student_idx
  on public.student_achievements (student_id);

-- ----------------------------------------------------------------------------
-- students: display_title + pinned_achievements
-- ----------------------------------------------------------------------------
alter table public.students add column if not exists display_title text;
alter table public.students add column if not exists pinned_achievements text[];

alter table public.students drop constraint if exists students_pinned_len_check;
alter table public.students
  add constraint students_pinned_len_check
  check (pinned_achievements is null or array_length(pinned_achievements, 1) <= 3);

-- Neither column is in cp_guard_student_update's protected denylist, so a
-- student may write them via the ordinary self-update path (like bio/
-- interests/banner_urls) — but the VALUES written need validating against
-- what they've actually unlocked, which a CHECK constraint can't do (it needs
-- a subquery). A dedicated trigger does that instead, firing only when either
-- column actually changes so it doesn't run on every unrelated students
-- update (e.g. the lifetime_points recompute after every point event).
create or replace function public.cp_guard_achievement_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_instructor() or auth.uid() is null then
    return NEW;
  end if;

  if NEW.display_title is distinct from OLD.display_title and NEW.display_title is not null then
    if not exists (
      select 1
        from public.student_achievements sa
        join public.achievements a on a.code = sa.achievement_code
       where sa.student_id = NEW.id and a.title_text = NEW.display_title
    ) then
      raise exception 'You can only equip a title you have unlocked.';
    end if;
  end if;

  if NEW.pinned_achievements is distinct from OLD.pinned_achievements and NEW.pinned_achievements is not null then
    if exists (
      select 1
        from unnest(NEW.pinned_achievements) as code
       where not exists (
         select 1 from public.student_achievements sa
          where sa.student_id = NEW.id and sa.achievement_code = code
       )
    ) then
      raise exception 'You can only pin achievements you have unlocked.';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_guard_achievement_fields on public.students;
create trigger trg_guard_achievement_fields
  before update on public.students
  for each row
  when (
    NEW.display_title is distinct from OLD.display_title
    or NEW.pinned_achievements is distinct from OLD.pinned_achievements
  )
  execute function public.cp_guard_achievement_fields();

-- ----------------------------------------------------------------------------
-- Row-Level Security
-- ----------------------------------------------------------------------------
alter table public.achievements        enable row level security;
alter table public.student_achievements enable row level security;

-- The catalog is safe for anyone signed in to read (it's just reference data —
-- students need to see locked achievements' names/descriptions to know what
-- to chase). It has no insert/update/delete policy: only migrations seed it.
drop policy if exists achievements_select on public.achievements;
create policy achievements_select on public.achievements
  for select to authenticated using (true);

-- Instructor sees every student's unlocks; a student sees only their own.
-- No write policy at all — every insert goes through the SECURITY DEFINER
-- RPCs below, which run as the table owner regardless of grants.
drop policy if exists student_achievements_select on public.student_achievements;
create policy student_achievements_select on public.student_achievements
  for select to authenticated using (
    public.is_instructor()
    or student_id in (select id from public.students where user_id = auth.uid())
  );

grant select on public.achievements         to authenticated;
grant select on public.student_achievements to authenticated;

-- ----------------------------------------------------------------------------
-- cp_achievement_metrics() — every raw number an achievement can be measured
-- against, for ONE student. Internal helper (not granted to `authenticated`
-- directly — a SECURITY DEFINER caller runs as its owner, so it can still
-- invoke this without a separate grant). Both sync_achievements() and
-- get_achievement_progress() call this so the numbers can never drift between
-- "did you unlock it" and "how close are you" — one source of truth.
-- ----------------------------------------------------------------------------
create or replace function public.cp_achievement_metrics(p_student_id uuid)
returns table (
  points          integer,
  recitations     integer,
  present_count   integer,
  attended_count  integer,
  streak          integer,
  early_streak    integer,
  level           integer,
  rank            integer,
  views_received  integer,
  views_given     integer,
  unlocked_count  integer,
  banner_count    integer,
  has_events      boolean,
  has_attendance  boolean,
  has_avatar      boolean,
  has_bio_and_interests boolean,
  has_clean_slate boolean,
  has_comeback    boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points     integer;
  v_bio        text;
  v_interests  text;
  v_avatar     text;
  v_banners    text[];
  v_created_at timestamptz;
begin
  select lifetime_points, bio, interests, avatar_url, banner_urls, created_at
    into v_points, v_bio, v_interests, v_avatar, v_banners, v_created_at
    from public.students where id = p_student_id;
  if not found then
    raise exception 'Student not found.';
  end if;

  return query
  select
    v_points,
    (select count(*)::integer from public.point_events
      where student_id = p_student_id and category = 'recitation'),
    (select count(*)::integer from public.attendance_records
      where student_id = p_student_id and status = 'present'),
    (select count(*)::integer from public.attendance_records
      where student_id = p_student_id and status in ('present', 'late')),
    -- Current consecutive non-absent streak, counting backward from the most
    -- recent session: a running count of absences ordered newest-first hits 1
    -- exactly at (and stays >=1 after) the first absence, so "running_absent
    -- = 0" rows are exactly the unbroken run since then.
    (select count(*)::integer from (
        select sum(case when ar.status = 'absent' then 1 else 0 end)
                 over (order by cs.started_at desc) as running_absent
          from public.attendance_records ar
          join public.class_sessions cs on cs.id = ar.session_id
         where ar.student_id = p_student_id
      ) t where running_absent = 0),
    -- Same gaps-and-islands technique, keyed on "checked in within 2 minutes
    -- of the session opening" instead of "not absent".
    (select count(*)::integer from (
        select sum(
                 case when ar.scanned_at is not null
                           and ar.scanned_at <= cs.started_at + interval '2 minutes'
                      then 0 else 1 end
               ) over (order by cs.started_at desc) as running_not_early
          from public.attendance_records ar
          join public.class_sessions cs on cs.id = ar.session_id
         where ar.student_id = p_student_id
      ) t where running_not_early = 0),
    public.cp_level(v_points),
    (select rank from public.leaderboard_snapshot where student_id = p_student_id),
    (select coalesce(sum(view_count), 0)::integer from public.profile_views where viewed_id = p_student_id),
    (select coalesce(sum(view_count), 0)::integer from public.profile_views where viewer_id = p_student_id),
    (select count(*)::integer from public.student_achievements where student_id = p_student_id),
    coalesce(array_length(v_banners, 1), 0),
    exists(select 1 from public.point_events where student_id = p_student_id),
    exists(select 1 from public.attendance_records where student_id = p_student_id and scanned_at is not null),
    v_avatar is not null,
    v_bio is not null and v_interests is not null,
    -- Only eligible once enrolled 30+ days (otherwise a brand-new student
    -- would trivially clear "zero penalties" with zero elapsed time to earn
    -- one), and zero penalty-category events in the trailing 30 days.
    v_created_at <= now() - interval '30 days'
      and not exists (
        select 1 from public.point_events
         where student_id = p_student_id and category = 'penalty'
           and created_at >= now() - interval '30 days'
      ),
    exists (
      select 1
        from public.point_events p
        join public.point_events pen
          on pen.student_id = p.student_id and pen.category = 'penalty'
       where p.student_id = p_student_id and p.points > 0
         and p.created_at > pen.created_at
         and p.created_at <= pen.created_at + interval '24 hours'
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- sync_achievements() — re-evaluate one student's auto-computed unlocks.
-- ----------------------------------------------------------------------------
create or replace function public.sync_achievements(p_student_id uuid)
returns table(code text, name text, title_text text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_student uuid;
  m record;
begin
  -- A student may only sync their own progress; the instructor may sync anyone
  -- (e.g. from a roster view). Never trust a caller-supplied student id blind.
  select id into v_caller_student from public.students where user_id = auth.uid();
  if not (public.is_instructor() or v_caller_student = p_student_id) then
    raise exception 'You can only sync your own achievements.';
  end if;

  select * into m from public.cp_achievement_metrics(p_student_id);

  return query
    with satisfied(achievement_code, ok) as (
      values
        ('first_steps',        m.has_events),
        ('point_collector',    m.points >= 40),
        ('point_master',       m.points >= 80),
        ('recitation_regular', m.recitations >= 12),
        ('point_legend',       m.points >= 150),
        ('checked_in',         m.has_attendance),
        ('on_time',            m.present_count >= 10),
        ('reliable',           m.attended_count >= 20),
        ('streak_starter',     m.streak >= 5),
        ('iron_attendance',    m.streak >= 20),
        ('leveling_up',        m.level >= 1),
        ('halfway_hero',       m.level >= 3),
        ('top_ten',            m.rank is not null and m.rank <= 10),
        ('podium_finish',      m.rank is not null and m.rank <= 3),
        ('peak_performer',     m.rank = 1),
        ('picture_perfect',    m.has_avatar),
        ('open_book',          m.has_bio_and_interests),
        ('show_and_tell',      m.banner_count >= 3),
        ('getting_noticed',    m.views_received >= 20),
        ('profile_icon',       m.views_received >= 100),
        ('curious_classmate',  m.views_given >= 20),
        ('early_bird',         m.early_streak >= 8),
        ('clean_slate',        m.has_clean_slate),
        ('comeback_kid',       m.has_comeback),
        -- NOTE: m.unlocked_count was computed before this call's own inserts,
        -- so "The Collector" lags one sync call behind hitting exactly 20
        -- (fires on the next call instead of instantly) — an acceptable gap
        -- for a secret meta-achievement.
        ('the_collector',      m.unlocked_count >= 20)
    ),
    inserted as (
      insert into public.student_achievements (student_id, achievement_code)
      select p_student_id, s.achievement_code
        from satisfied s
        join public.achievements a on a.code = s.achievement_code and a.granted_by = 'system'
       where s.ok
      on conflict (student_id, achievement_code) do nothing
      returning achievement_code
    )
    select a.code, a.name, a.title_text
      from inserted i
      join public.achievements a on a.code = i.achievement_code;
end;
$$;

grant execute on function public.sync_achievements(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- get_achievement_progress() — the raw numbers behind the "7/10"-style
-- progress bars for locked achievements. Same permission model as
-- sync_achievements: a student may only read their own.
-- ----------------------------------------------------------------------------
create or replace function public.get_achievement_progress(p_student_id uuid)
returns table (
  points integer, recitations integer, present_count integer, attended_count integer,
  streak integer, early_streak integer, level integer, rank integer,
  views_received integer, views_given integer, unlocked_count integer, banner_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_student uuid;
begin
  select id into v_caller_student from public.students where user_id = auth.uid();
  if not (public.is_instructor() or v_caller_student = p_student_id) then
    raise exception 'You can only view your own achievement progress.';
  end if;

  return query
    select m.points, m.recitations, m.present_count, m.attended_count, m.streak, m.early_streak,
           m.level, m.rank, m.views_received, m.views_given, m.unlocked_count, m.banner_count
      from public.cp_achievement_metrics(p_student_id) m;
end;
$$;

grant execute on function public.get_achievement_progress(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- grant_achievement() — instructor-only manual award of a 'recognition' badge.
-- ----------------------------------------------------------------------------
create or replace function public.grant_achievement(p_student_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_granted_by text;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can grant achievements.';
  end if;

  select granted_by into v_granted_by from public.achievements where code = p_code;
  if v_granted_by is null then
    raise exception 'Unknown achievement code.';
  end if;
  if v_granted_by <> 'instructor' then
    raise exception 'This achievement is unlocked automatically and cannot be granted manually.';
  end if;

  insert into public.student_achievements (student_id, achievement_code, granted_by)
       values (p_student_id, p_code, auth.uid())
  on conflict (student_id, achievement_code) do nothing;
end;
$$;

grant execute on function public.grant_achievement(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Realtime — an instructor-granted achievement shows up live for an already-
-- open student app, mirroring the attendance_records publication (0014).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'student_achievements'
  ) then
    alter publication supabase_realtime add table public.student_achievements;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- Seed the 30-achievement catalog (idempotent upsert).
-- ----------------------------------------------------------------------------
insert into public.achievements (code, category, name, description, secret, granted_by, title_text, metric, threshold, sort_order) values
  ('first_steps',        'points', 'First Steps',        'Earn your first point award.', false, 'system', null, null, null, 1),
  ('point_collector',    'points', 'Point Collector',    'Reach 40 lifetime points.', false, 'system', null, 'points', 40, 2),
  ('point_master',       'points', 'Point Master',       'Reach 80 lifetime points.', false, 'system', null, 'points', 80, 3),
  ('recitation_regular', 'points', 'Recitation Regular', 'Log 12 recitation-category awards.', false, 'system', null, 'recitations', 12, 4),
  ('point_legend',       'points', 'Point Legend',       'Reach 150 lifetime points.', false, 'system', 'The Overachiever Elite', 'points', 150, 5),

  ('checked_in',      'attendance', 'Checked In',      'Scan into your first class session.', false, 'system', null, null, null, 6),
  ('on_time',         'attendance', 'On Time',         'Get marked Present (not Late) in 10 sessions.', false, 'system', null, 'present_count', 10, 7),
  ('reliable',        'attendance', 'Reliable',        'Attend 20 sessions with zero Absences.', false, 'system', null, 'attended_count', 20, 8),
  ('streak_starter',  'attendance', 'Streak Starter',  'Attend 5 consecutive sessions with no Absence.', false, 'system', null, 'streak', 5, 9),
  ('iron_attendance', 'attendance', 'Iron Attendance', 'Attend 20 consecutive sessions with no Absence.', false, 'system', 'The Eye of Seeing Everything', 'streak', 20, 10),

  ('leveling_up',    'growth', 'Leveling Up',    'Reach Level 1.', false, 'system', null, 'level', 1, 11),
  ('halfway_hero',   'growth', 'Halfway Hero',   'Reach Level 3.', false, 'system', 'The Unkillable Demon King', 'level', 3, 12),
  ('top_ten',        'growth', 'Top Ten',        'Place top 10 on the global leaderboard.', false, 'system', null, 'rank', 10, 13),
  ('podium_finish',  'growth', 'Podium Finish',  'Place top 3 on the global leaderboard.', false, 'system', null, 'rank', 3, 14),
  ('peak_performer', 'growth', 'Peak Performer', 'Reach #1 on the global leaderboard.', false, 'system', 'Summit Climber', 'rank', 1, 15),

  ('picture_perfect', 'social', 'Picture Perfect', 'Set a profile picture.', false, 'system', null, null, null, 16),
  ('open_book',       'social', 'Open Book',       'Fill in both your bio and interests.', false, 'system', null, null, null, 17),
  ('show_and_tell',   'social', 'Show and Tell',   'Upload all 3 showcase photos.', false, 'system', null, 'banner_count', 3, 18),
  ('getting_noticed', 'social', 'Getting Noticed', 'Reach 20 total profile views.', false, 'system', null, 'views_received', 20, 19),
  ('profile_icon',    'social', 'Profile Icon',    'Reach 100 total profile views.', false, 'system', 'Campus Celebrity', 'views_received', 100, 20),

  ('curious_classmate', 'fun', 'Curious Classmate', 'View other students'' profiles 20 times.', false, 'system', null, 'views_given', 20, 21),
  ('early_bird',        'fun', 'Early Bird',        'Check in within the first 2 minutes of a session opening, 8 times in a row.', true, 'system', 'The Early Bird Legend', 'early_streak', 8, 22),
  ('clean_slate',       'fun', 'Clean Slate',       'Go a full month with zero penalties.', false, 'system', 'The Enlightened One', null, null, 23),
  ('comeback_kid',      'fun', 'Comeback Kid',      'Earn a positive point award within 24 hours of a penalty.', true, 'system', null, null, null, 24),
  ('the_collector',     'fun', 'The Collector',     'Unlock 20 of the other achievements.', true, 'system', 'The Asian Kid', 'unlocked_count', 20, 25),

  ('helping_hand',  'recognition', 'Helping Hand',  'Instructor-awarded for helping classmates.', false, 'instructor', null, null, null, 26),
  ('most_improved', 'recognition', 'Most Improved', 'Instructor-awarded for the biggest participation turnaround.', false, 'instructor', null, null, null, 27),
  ('rising_star',   'recognition', 'Rising Star',   'Instructor-awarded for standout recent performance.', false, 'instructor', null, null, null, 28),
  ('team_player',   'recognition', 'Team Player',   'Instructor-awarded for great collaboration.', false, 'instructor', null, null, null, 29),
  ('class_mvp',     'recognition', 'Class MVP',     'The instructor''s pick for the section''s standout student.', false, 'instructor', 'Class MVP', null, null, 30)
on conflict (code) do update
  set category    = excluded.category,
      name        = excluded.name,
      description = excluded.description,
      secret      = excluded.secret,
      granted_by  = excluded.granted_by,
      title_text  = excluded.title_text,
      metric      = excluded.metric,
      threshold   = excluded.threshold,
      sort_order  = excluded.sort_order;
