-- ============================================================================
-- ClassPoint · 0021 · Profile visitors list + achievement library depth
-- Run after 0020. Safe to re-run (idempotent).
--
-- WHAT THIS ADDS
--   1. get_profile_visitors() — a paginated "who viewed me" list (the existing
--      get_profile_views only returns a small strip).
--   2. get_achievement_rarity() — holders-per-badge, so the detail sheet can
--      show "LEGENDARY · 8% · 3 of 42".
--   3. Two spending metrics (points_spent, redemptions_approved) on the
--      achievement metrics, plus four new badges:
--        big_spender    (metric)  first approved redemption
--        high_roller    (metric)  spend 100 lifetime points  → title
--        town_crier     (event)   post your first flying comment
--        window_shopper (event)   request a redemption, then cancel it
--
-- cp_achievement_metrics GAINS COLUMNS, so its return type changes → it must be
-- DROPPED first (the 0014 lesson), and the two functions that call it
-- (sync_achievements, get_achievement_progress) recreated in the same file.
-- THIS FILE'S cp_achievement_metrics BODY IS NOW CANONICAL — it carries 0018's
-- excused/irregular streak filters forward. Never fork it; copy it forward.
--
-- Event-granted badges (town_crier, window_shopper) use triggers rather than
-- editing post_leaderboard_comment / cancel_point_redemption — the grant lives
-- next to nothing it can drift from, and sync_achievements never touches them
-- (they're not in its satisfied list).
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Paste and run. (Requires 0016 achievements, 0019 redemptions,
--   0020 comments.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Paginated profile-visitors list (owner-only, like get_profile_views)
-- ----------------------------------------------------------------------------
create or replace function public.get_profile_visitors(
  p_student_id uuid,
  p_offset int default 0,
  p_limit  int default 20
) returns table (
  display_name text,
  avatar_url   text,
  last_viewed_at timestamptz,
  view_count   int,
  total_count  bigint
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
    return; -- empty for anyone else
  end if;

  return query
    select s.display_name,
           s.avatar_url,
           pv.last_viewed_at,
           pv.view_count,
           count(*) over() as total_count
      from public.profile_views pv
      join public.students s on s.id = pv.viewer_id
     where pv.viewed_id = p_student_id
     order by pv.last_viewed_at desc
     offset greatest(p_offset, 0)
     limit least(greatest(p_limit, 1), 50);
end;
$$;

grant execute on function public.get_profile_visitors(uuid, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Achievement rarity — holders per badge + the pool it's out of
-- ----------------------------------------------------------------------------
create or replace function public.get_achievement_rarity()
returns table (code text, holders int, total_students int)
language sql
security definer
set search_path = public
as $$
  -- "Claimed" students only (a real user_id), so unclaimed roster placeholders
  -- don't deflate every percentage.
  select a.code,
         (select count(*)::int from public.student_achievements sa
           where sa.achievement_code = a.code) as holders,
         (select count(*)::int from public.students s
           where s.user_id is not null) as total_students
    from public.achievements a;
$$;

grant execute on function public.get_achievement_rarity() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Metrics: add points_spent + redemptions_approved (return type change)
-- ----------------------------------------------------------------------------
drop function if exists public.cp_achievement_metrics(uuid);
create function public.cp_achievement_metrics(p_student_id uuid)
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
  points_spent        integer,
  redemptions_approved integer,
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
    -- Non-absent streak, newest-first; excused/irregular excluded so they
    -- neither break nor pad the run (0018's rule, carried forward).
    (select count(*)::integer from (
        select sum(case when ar.status = 'absent' then 1 else 0 end)
                 over (order by cs.started_at desc) as running_absent
          from public.attendance_records ar
          join public.class_sessions cs on cs.id = ar.session_id
         where ar.student_id = p_student_id
           and ar.status not in ('excused', 'irregular')
      ) t where running_absent = 0),
    (select count(*)::integer from (
        select sum(
                 case when ar.scanned_at is not null
                           and ar.scanned_at <= cs.started_at + interval '2 minutes'
                      then 0 else 1 end
               ) over (order by cs.started_at desc) as running_not_early
          from public.attendance_records ar
          join public.class_sessions cs on cs.id = ar.session_id
         where ar.student_id = p_student_id
           and ar.status not in ('excused', 'irregular')
      ) t where running_not_early = 0),
    public.cp_level(v_points),
    (select rank from public.leaderboard_snapshot where student_id = p_student_id),
    (select coalesce(sum(view_count), 0)::integer from public.profile_views where viewed_id = p_student_id),
    (select coalesce(sum(view_count), 0)::integer from public.profile_views where viewer_id = p_student_id),
    (select count(*)::integer from public.student_achievements where student_id = p_student_id),
    coalesce(array_length(v_banners, 1), 0),
    -- NEW: spending metrics (approved redemptions only).
    (select coalesce(sum(points), 0)::integer from public.point_redemptions
      where student_id = p_student_id and status = 'approved'),
    (select count(*)::integer from public.point_redemptions
      where student_id = p_student_id and status = 'approved'),
    exists(select 1 from public.point_events where student_id = p_student_id),
    exists(select 1 from public.attendance_records where student_id = p_student_id and scanned_at is not null),
    v_avatar is not null,
    v_bio is not null and v_interests is not null,
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

-- get_achievement_progress also gains the two columns → drop + recreate.
drop function if exists public.get_achievement_progress(uuid);
create function public.get_achievement_progress(p_student_id uuid)
returns table (
  points integer, recitations integer, present_count integer, attended_count integer,
  streak integer, early_streak integer, level integer, rank integer,
  views_received integer, views_given integer, unlocked_count integer, banner_count integer,
  points_spent integer, redemptions_approved integer
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
           m.level, m.rank, m.views_received, m.views_given, m.unlocked_count, m.banner_count,
           m.points_spent, m.redemptions_approved
      from public.cp_achievement_metrics(p_student_id) m;
end;
$$;

grant execute on function public.get_achievement_progress(uuid) to authenticated;

-- sync_achievements: same body + two new metric checks. Recreated so it binds
-- to the new cp_achievement_metrics signature.
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
        ('the_collector',      m.unlocked_count >= 20),
        -- NEW spending badges.
        ('big_spender',        m.redemptions_approved >= 1),
        ('high_roller',        m.points_spent >= 100)
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
-- 4. Widen the metric CHECK, then seed the four new badges (idempotent upsert)
-- ----------------------------------------------------------------------------
alter table public.achievements drop constraint if exists achievements_metric_check;
alter table public.achievements
  add constraint achievements_metric_check check (
    metric is null or metric in (
      'points','recitations','present_count','attended_count','streak','early_streak',
      'level','rank','views_received','views_given','unlocked_count','banner_count',
      'points_spent','redemptions_approved'
    )
  );

insert into public.achievements (code, category, name, description, secret, granted_by, title_text, metric, threshold, sort_order) values
  ('big_spender',    'fun', 'Big Spender',    'Get your first point redemption approved.', false, 'system', null, 'redemptions_approved', 1, 90),
  ('high_roller',    'fun', 'High Roller',    'Spend 100 lifetime points on your grades.', true,  'system', 'The Philanthropist', 'points_spent', 100, 91),
  ('town_crier',     'fun', 'Town Crier',     'Post your first flying comment on the leaderboard.', false, 'system', null, null, null, 92),
  ('window_shopper', 'fun', 'Window Shopper', 'Request a redemption… then cancel it. Make up your mind.', true, 'system', null, null, null, 93)
on conflict (code) do update set
  category    = excluded.category,
  name        = excluded.name,
  description = excluded.description,
  secret      = excluded.secret,
  granted_by  = excluded.granted_by,
  title_text  = excluded.title_text,
  metric      = excluded.metric,
  threshold   = excluded.threshold,
  sort_order  = excluded.sort_order;

-- ----------------------------------------------------------------------------
-- 5. Event-granted badges via triggers (nothing to drift from)
-- ----------------------------------------------------------------------------

-- Town Crier — first comment. The trigger is idempotent (unique constraint +
-- on conflict do nothing), so only the first comment ever grants it.
create or replace function public.cp_grant_town_crier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.student_id is not null then
    insert into public.student_achievements (student_id, achievement_code)
         values (NEW.student_id, 'town_crier')
    on conflict (student_id, achievement_code) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_town_crier on public.leaderboard_comments;
create trigger trg_town_crier
  after insert on public.leaderboard_comments
  for each row execute function public.cp_grant_town_crier();

-- Window Shopper — a request that gets cancelled.
create or replace function public.cp_grant_window_shopper()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'cancelled' and OLD.status is distinct from 'cancelled' then
    insert into public.student_achievements (student_id, achievement_code)
         values (NEW.student_id, 'window_shopper')
    on conflict (student_id, achievement_code) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_window_shopper on public.point_redemptions;
create trigger trg_window_shopper
  after update on public.point_redemptions
  for each row execute function public.cp_grant_window_shopper();
