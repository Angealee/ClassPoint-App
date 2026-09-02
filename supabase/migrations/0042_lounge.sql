-- ============================================================================
-- ClassPoint · 0042 · The Student Lounge
-- Run after 0041. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   The feed half of Student Space: text posts, shoutouts, scarce "W"
--   reactions, replies, and auto-posted Class Pulse cards. Messaging is 0043.
--
-- ── ONE SHARED FEED ─────────────────────────────────────────────────────────
--   Not per-section (the user's call). It follows 0020's flying comments,
--   which are deliberately one global stream — and in a class this size,
--   splitting a feed produces two dead feeds instead of one alive one. Podium
--   Pulse posts are whole-app events and would have no section to belong to.
--
--   Scoped to the ACTIVE SEMESTER via the 0029 default, so a rollover starts a
--   clean Lounge while the old one stays readable.
--
-- ── WHY THE COUNTERS ARE COLUMNS ────────────────────────────────────────────
--   `w_count` and `reply_count` are trigger-maintained on the post rather than
--   counted per render. Two reasons, and the second is the real one:
--     1. The feed is then ONE query with no correlated aggregates.
--     2. Realtime. Only `lounge_posts` is published — a W or a reply bumps a
--        counter, which fires an UPDATE on the post, which is exactly the event
--        the client needs. Publishing three tables to learn the same thing
--        would triple the realtime traffic for no extra information.
--
-- ── LIMITS (all mirrored in src/lib/types.ts) ───────────────────────────────
--   600 chars · 5 text posts / rolling 24h · 3 shoutouts / rolling 7 days,
--   at most one per classmate per week · 3 live Ws / rolling 24h.
--
--   The W limit counts LIVE rows, so un-W-ing refunds it. That is deliberate:
--   with only three a day, a mis-tap that cost a third of the allowance with no
--   way back would make people afraid to use the feature at all. Read it as
--   "you can be backing three posts at a time".
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Nothing is visible until a section is enabled on /teach/space.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table if not exists public.lounge_posts (
  id                  uuid primary key default gen_random_uuid(),
  semester_id         uuid not null default public.cp_active_semester_id()
                        references public.semesters(id) on delete cascade,
  kind                text not null check (kind in ('text', 'shoutout', 'pulse')),

  -- NULL author + kind 'text' = the instructor wrote it (0020's convention).
  -- For 'pulse', the author IS the student it is about; the card renders as a
  -- system announcement wearing their name.
  author_student_id   uuid references public.students(id) on delete cascade,
  display_name        text not null,
  avatar_url          text,
  body                text not null check (char_length(btrim(body)) between 1 and 600),

  -- Shoutouts. Denormalized like the author, for the same reason.
  target_student_id   uuid references public.students(id) on delete set null,
  target_display_name text,
  target_avatar_url   text,

  -- 'event' is listed here even though 0045 is what writes it. The alternative
  -- is 0045 dropping an INLINE, auto-named check by guessing
  -- `lounge_posts_pulse_kind_check` — a name Postgres generates, not one this
  -- file chose. Naming the constraint and listing the value up front is the
  -- cheaper of the two.
  pulse_kind          text constraint lounge_posts_pulse_kind_check
                        check (pulse_kind is null
                               or pulse_kind in ('level', 'podium', 'event')),
  pulse_value         int,

  w_count             int not null default 0,
  reply_count         int not null default 0,

  pinned_at           timestamptz,
  -- Set by 0044's report flow. Declared now so that migration does not have to
  -- change this table's shape, and so the feed's return type is already final.
  hidden_at           timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists lounge_posts_feed_idx
  on public.lounge_posts (semester_id, created_at desc, id desc)
  where deleted_at is null;
create index if not exists lounge_posts_trending_idx
  on public.lounge_posts (semester_id, w_count desc, created_at desc)
  where deleted_at is null;
create index if not exists lounge_posts_author_idx
  on public.lounge_posts (author_student_id, created_at desc);
-- Drives the 7-day shoutout strip on a profile.
create index if not exists lounge_posts_target_idx
  on public.lounge_posts (target_student_id, created_at desc)
  where kind = 'shoutout' and deleted_at is null;

-- One row per (post, student): the primary key IS the "one W each" rule.
create table if not exists public.lounge_ws (
  post_id    uuid not null references public.lounge_posts(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, student_id)
);
create index if not exists lounge_ws_student_idx
  on public.lounge_ws (student_id, created_at desc);

create table if not exists public.lounge_replies (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.lounge_posts(id) on delete cascade,
  author_student_id uuid references public.students(id) on delete cascade,
  display_name      text not null,
  avatar_url        text,
  body              text not null check (char_length(btrim(body)) between 1 and 600),
  hidden_at         timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists lounge_replies_post_idx
  on public.lounge_replies (post_id, created_at)
  where deleted_at is null;

alter table public.lounge_posts   enable row level security;
alter table public.lounge_ws      enable row level security;
alter table public.lounge_replies enable row level security;

-- ----------------------------------------------------------------------------
-- 2. RLS
--
--    SELECT only, for everyone whose Student Space is OPEN. There is no INSERT,
--    UPDATE or DELETE policy on any of these tables: every write goes through a
--    SECURITY DEFINER RPC below, which is what makes the banned-word filter,
--    the rate limits and the timeout impossible to skip. Straight from 0020.
--
--    Deletion is SOFT (`deleted_at`) so a reply thread does not lose its
--    parent, and so 0044's moderation has something to look at.
-- ----------------------------------------------------------------------------
drop policy if exists lounge_posts_select on public.lounge_posts;
create policy lounge_posts_select on public.lounge_posts
  for select to authenticated using (
    public.is_instructor() or public.cp_space_state() = 'open'
  );

drop policy if exists lounge_ws_select on public.lounge_ws;
create policy lounge_ws_select on public.lounge_ws
  for select to authenticated using (
    public.is_instructor() or public.cp_space_state() = 'open'
  );

drop policy if exists lounge_replies_select on public.lounge_replies;
create policy lounge_replies_select on public.lounge_replies
  for select to authenticated using (
    public.is_instructor() or public.cp_space_state() = 'open'
  );

grant select on public.lounge_posts   to authenticated;
grant select on public.lounge_ws      to authenticated;
grant select on public.lounge_replies to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Counter triggers
--
--    Guarded by `pg_publication_tables` below, only `lounge_posts` is
--    published — so these UPDATEs are also the realtime signal for a W or a
--    reply landing.
-- ----------------------------------------------------------------------------
create or replace function public.cp_lounge_w_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.lounge_posts set w_count = w_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update public.lounge_posts set w_count = greatest(0, w_count - 1) where id = OLD.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_lounge_w_count on public.lounge_ws;
create trigger trg_lounge_w_count
  after insert or delete on public.lounge_ws
  for each row execute function public.cp_lounge_w_count();

-- Counts only LIVE replies, so a soft delete decrements it.
create or replace function public.cp_lounge_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.lounge_posts set reply_count = reply_count + 1 where id = NEW.post_id;
  elsif TG_OP = 'UPDATE' then
    if OLD.deleted_at is null and NEW.deleted_at is not null then
      update public.lounge_posts set reply_count = greatest(0, reply_count - 1)
       where id = NEW.post_id;
    elsif OLD.deleted_at is not null and NEW.deleted_at is null then
      update public.lounge_posts set reply_count = reply_count + 1 where id = NEW.post_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_lounge_reply_count on public.lounge_replies;
create trigger trg_lounge_reply_count
  after insert or update on public.lounge_replies
  for each row execute function public.cp_lounge_reply_count();

-- ----------------------------------------------------------------------------
-- 4. Shared write guard
--
--    Every posting RPC starts here. Returns the caller's students row, or
--    raises the reason they cannot post — one place, so the rules cannot drift
--    between posts, shoutouts and replies.
-- ----------------------------------------------------------------------------
create or replace function public.cp_lounge_author()
returns public.students
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
begin
  if public.cp_space_state() = 'locked' then
    raise exception 'Student Space is not open for your section yet.';
  end if;
  if public.cp_space_state() = 'paused' then
    raise exception 'Student Space is paused right now. Try again shortly.';
  end if;
  if public.cp_space_is_timed_out() then
    raise exception 'You are muted in Student Space right now. You can still read, and you can still message your instructor.';
  end if;

  select * into v_student from public.students where user_id = auth.uid() and archived_at is null;
  if not found then
    raise exception 'Only students can post in the Lounge.';
  end if;
  return v_student;
end;
$$;

revoke execute on function public.cp_lounge_author() from public, anon, authenticated;

-- Normalise + reject. Shared by posts and replies so the two cannot disagree
-- about what "600 characters" or "friendly" means.
--
-- Newlines SURVIVE here (posts are multi-line by decision) — only control
-- characters other than newline are stripped, and runs of blank lines are
-- collapsed so a post cannot be 600 newlines tall.
create or replace function public.cp_lounge_clean(p_body text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_body text;
begin
  v_body := coalesce(p_body, '');
  -- Every control character EXCEPT newline becomes a space, so after this the
  -- only whitespace left is a space or a newline. That is what lets the next
  -- line be a plain ' +' rather than `[^\S\n]+` — the negated-shorthand idiom
  -- works in Postgres but is easy to misread, and this file is pasted by hand.
  v_body := regexp_replace(v_body, '[\r\t\f\v]', ' ', 'g');
  v_body := regexp_replace(v_body, ' +', ' ', 'g');           -- runs of spaces
  v_body := regexp_replace(v_body, '\n{3,}', E'\n\n', 'g');   -- 3+ blank lines
  v_body := btrim(v_body);

  if v_body = '' then
    raise exception 'Say something first.';
  end if;
  if char_length(v_body) > 600 then
    raise exception 'Keep it under 600 characters.';
  end if;
  if exists (
    select 1 from public.leaderboard_banned_words w
     where lower(v_body) ~ ('\m' || w.word || '\M')
  ) then
    raise exception 'Keep it friendly — that one did not pass.';
  end if;

  return v_body;
end;
$$;

revoke execute on function public.cp_lounge_clean(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Posting
-- ----------------------------------------------------------------------------
drop function if exists public.post_to_lounge(text);
create function public.post_to_lounge(p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_body    text;
  v_recent  int;
  v_id      uuid;
begin
  v_student := public.cp_lounge_author();
  v_body    := public.cp_lounge_clean(p_body);

  -- Rolling 24h, not a midnight reset — 0020's reasoning, and it cannot be
  -- gamed by posting five at 23:59 and five more a minute later.
  select count(*)::int into v_recent
    from public.lounge_posts
   where author_student_id = v_student.id
     and kind = 'text'
     and deleted_at is null
     and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'That is your 5 posts for today. Back tomorrow.';
  end if;

  -- DUPLICATE GUARD. A double-tap on a slow connection, or a retry after a
  -- timeout that actually succeeded, would otherwise post twice and burn one of
  -- five with no edit available. Nobody deliberately posts the same 600
  -- characters twice inside five minutes, so this cannot false-positive.
  if exists (
    select 1 from public.lounge_posts
     where author_student_id = v_student.id
       and deleted_at is null
       and body = v_body
       and created_at > now() - interval '5 minutes'
  ) then
    raise exception 'You just posted that.';
  end if;

  insert into public.lounge_posts (kind, author_student_id, display_name, avatar_url, body)
       values ('text', v_student.id, v_student.display_name, v_student.avatar_url, v_body)
    returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.post_to_lounge(text) to authenticated;

drop function if exists public.post_shoutout(uuid, text);
create function public.post_shoutout(p_target uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_target  public.students%rowtype;
  v_body    text;
  v_recent  int;
  v_id      uuid;
begin
  v_student := public.cp_lounge_author();
  v_body    := public.cp_lounge_clean(p_body);

  select * into v_target from public.students where id = p_target and archived_at is null;
  if not found then
    raise exception 'That classmate is not on the roster.';
  end if;
  if v_target.id = v_student.id then
    raise exception 'Shout out someone else.';
  end if;

  select count(*)::int into v_recent
    from public.lounge_posts
   where author_student_id = v_student.id
     and kind = 'shoutout'
     and deleted_at is null
     and created_at > now() - interval '7 days';
  if v_recent >= 3 then
    raise exception 'That is your 3 shoutouts for this week.';
  end if;

  -- THE PER-PERSON CAP IS THE IMPORTANT HALF. Without it two friends can trade
  -- shoutouts all week and the feed becomes their private channel.
  if exists (
    select 1 from public.lounge_posts
     where author_student_id = v_student.id
       and target_student_id = v_target.id
       and kind = 'shoutout'
       and deleted_at is null
       and created_at > now() - interval '7 days'
  ) then
    raise exception 'You already shouted them out this week. Spread it around.';
  end if;

  insert into public.lounge_posts (
    kind, author_student_id, display_name, avatar_url, body,
    target_student_id, target_display_name, target_avatar_url
  ) values (
    'shoutout', v_student.id, v_student.display_name, v_student.avatar_url, v_body,
    v_target.id, v_target.display_name, v_target.avatar_url
  ) returning id into v_id;

  -- Being praised and never finding out is the main way this feature fails.
  perform public.cp_push_dispatch(array[
    public.cp_queue_notification(
      v_target.id, 'space_shoutout',
      v_student.display_name || ' shouted you out',
      left(v_body, 120),
      '/app/space/post/' || v_id::text
    )
  ]);

  return v_id;
end;
$$;

grant execute on function public.post_shoutout(uuid, text) to authenticated;

drop function if exists public.reply_to_post(uuid, text);
create function public.reply_to_post(p_post_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_body    text;
  v_post    public.lounge_posts%rowtype;
  v_id      uuid;
begin
  v_student := public.cp_lounge_author();
  v_body    := public.cp_lounge_clean(p_body);

  select * into v_post from public.lounge_posts where id = p_post_id;
  if not found or v_post.deleted_at is not null then
    raise exception 'That post is gone.';
  end if;
  if v_post.hidden_at is not null then
    raise exception 'That post is under review.';
  end if;

  if exists (
    select 1 from public.lounge_replies
     where author_student_id = v_student.id
       and post_id = p_post_id
       and deleted_at is null
       and body = v_body
       and created_at > now() - interval '5 minutes'
  ) then
    raise exception 'You just said that.';
  end if;

  insert into public.lounge_replies (post_id, author_student_id, display_name, avatar_url, body)
       values (p_post_id, v_student.id, v_student.display_name, v_student.avatar_url, v_body)
    returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.reply_to_post(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Ws
--
--    A toggle, and the daily allowance counts LIVE rows — so un-W-ing refunds
--    it. See the header: three a day with no undo would make a mis-tap cost a
--    third of the allowance, which is how a feature stops being used.
-- ----------------------------------------------------------------------------
drop function if exists public.give_w(uuid);
create function public.give_w(p_post_id uuid)
returns table (w_count int, i_gave_w boolean, w_left int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_post    public.lounge_posts%rowtype;
  v_had     boolean;
  v_recent  int;
begin
  v_student := public.cp_lounge_author();

  select * into v_post from public.lounge_posts where id = p_post_id;
  if not found or v_post.deleted_at is not null then
    raise exception 'That post is gone.';
  end if;
  if v_post.author_student_id = v_student.id then
    raise exception 'You cannot W your own post.';
  end if;

  select exists (
    select 1 from public.lounge_ws where post_id = p_post_id and student_id = v_student.id
  ) into v_had;

  if v_had then
    delete from public.lounge_ws where post_id = p_post_id and student_id = v_student.id;
  else
    select count(*)::int into v_recent
      from public.lounge_ws
     where student_id = v_student.id
       and created_at > now() - interval '24 hours';
    if v_recent >= 3 then
      raise exception 'You are backing 3 posts already. Take one back to free a W.';
    end if;
    insert into public.lounge_ws (post_id, student_id) values (p_post_id, v_student.id);
  end if;

  select count(*)::int into v_recent
    from public.lounge_ws
   where student_id = v_student.id
     and created_at > now() - interval '24 hours';

  return query
    select p.w_count, not v_had, greatest(0, 3 - v_recent)
      from public.lounge_posts p
     where p.id = p_post_id;
end;
$$;

grant execute on function public.give_w(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Removing things
--
--    Soft delete throughout. A student may remove their own text post or
--    shoutout; the instructor may remove anything. A 'pulse' card is a system
--    record and is NOT author-deletable — levels and ranks are already public
--    on the leaderboard, so there is nothing private in it to take back.
-- ----------------------------------------------------------------------------
drop function if exists public.delete_lounge_post(uuid);
create function public.delete_lounge_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := public.cp_my_student_id();
  v_post public.lounge_posts%rowtype;
begin
  select * into v_post from public.lounge_posts where id = p_id;
  if not found then
    return;                                        -- already gone; idempotent
  end if;

  if public.is_instructor() then
    null;
  elsif v_post.kind = 'pulse' then
    raise exception 'That one is posted by ClassPoint, not by you.';
  elsif v_post.author_student_id is distinct from v_me then
    raise exception 'You can only delete your own posts.';
  end if;

  update public.lounge_posts set deleted_at = now() where id = p_id and deleted_at is null;
end;
$$;

grant execute on function public.delete_lounge_post(uuid) to authenticated;

drop function if exists public.delete_lounge_reply(uuid);
create function public.delete_lounge_reply(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := public.cp_my_student_id();
  v_reply public.lounge_replies%rowtype;
begin
  select * into v_reply from public.lounge_replies where id = p_id;
  if not found then
    return;
  end if;
  if not public.is_instructor() and v_reply.author_student_id is distinct from v_me then
    raise exception 'You can only delete your own replies.';
  end if;

  update public.lounge_replies set deleted_at = now() where id = p_id and deleted_at is null;
end;
$$;

grant execute on function public.delete_lounge_reply(uuid) to authenticated;

drop function if exists public.pin_lounge_post(uuid, boolean);
create function public.pin_lounge_post(p_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can pin a post.';
  end if;
  -- One pin at a time: a "pinned" section with four things in it is just the
  -- top of the feed again.
  if p_pinned then
    update public.lounge_posts set pinned_at = null where pinned_at is not null;
    update public.lounge_posts set pinned_at = now() where id = p_id;
  else
    update public.lounge_posts set pinned_at = null where id = p_id;
  end if;
end;
$$;

grant execute on function public.pin_lounge_post(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Reading the feed
--
--    Pinned posts come from their OWN function and are EXCLUDED from the
--    chronological list. Folding them into one query means either a pinned post
--    appears twice or the keyset cursor has to special-case page 1 — and a
--    clever pagination query is exactly where an off-by-one lives. Two simple
--    functions beat one clever one.
-- ----------------------------------------------------------------------------
drop function if exists public.get_lounge_feed(text, int, timestamptz, uuid);
create function public.get_lounge_feed(
  p_mode           text        default 'latest',
  p_limit          int         default 20,
  p_before_created timestamptz default null,
  p_before_id      uuid        default null
)
returns table (
  id                  uuid,
  kind                text,
  author_student_id   uuid,
  display_name        text,
  avatar_url          text,
  body                text,
  target_student_id   uuid,
  target_display_name text,
  target_avatar_url   text,
  pulse_kind          text,
  pulse_value         int,
  w_count             int,
  reply_count         int,
  i_gave_w            boolean,
  can_delete          boolean,
  pinned_at           timestamptz,
  hidden_at           timestamptz,
  created_at          timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me    uuid := public.cp_my_student_id();
  v_instr boolean := public.is_instructor();
  v_lim   int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if not v_instr and public.cp_space_state() <> 'open' then
    raise exception 'Student Space is not open right now.';
  end if;

  if p_mode = 'trending' then
    -- Last 7 days, and a post needs at least one W: a list of zero-W posts
    -- ordered by nothing is not "trending", it is the feed with extra steps.
    -- Not keyset-paged — the window plus a 50 cap bounds it hard.
    return query
      select p.id, p.kind, p.author_student_id, p.display_name, p.avatar_url,
             -- A hidden post keeps its row but loses its BODY to everyone but
             -- the instructor. Returning the text and trusting the client to
             -- not draw it would make moderation a rendering preference.
             case when p.hidden_at is not null and not v_instr then null else p.body end,
             p.target_student_id, p.target_display_name, p.target_avatar_url,
             p.pulse_kind, p.pulse_value, p.w_count, p.reply_count,
             exists (select 1 from public.lounge_ws w
                      where w.post_id = p.id and w.student_id = v_me),
             (v_instr or (p.kind <> 'pulse' and p.author_student_id = v_me)),
             p.pinned_at, p.hidden_at, p.created_at
        from public.lounge_posts p
       where p.semester_id = public.cp_active_semester_id()
         and p.deleted_at is null
         and p.created_at > now() - interval '7 days'
         and p.w_count > 0
       order by p.w_count desc, p.created_at desc, p.id desc
       limit v_lim;
    return;
  end if;

  return query
    select p.id, p.kind, p.author_student_id, p.display_name, p.avatar_url,
             -- A hidden post keeps its row but loses its BODY to everyone but
             -- the instructor. Returning the text and trusting the client to
             -- not draw it would make moderation a rendering preference.
             case when p.hidden_at is not null and not v_instr then null else p.body end,
           p.target_student_id, p.target_display_name, p.target_avatar_url,
           p.pulse_kind, p.pulse_value, p.w_count, p.reply_count,
           exists (select 1 from public.lounge_ws w
                    where w.post_id = p.id and w.student_id = v_me),
           (v_instr or (p.kind <> 'pulse' and p.author_student_id = v_me)),
           p.pinned_at, p.hidden_at, p.created_at
      from public.lounge_posts p
     where p.semester_id = public.cp_active_semester_id()
       and p.deleted_at is null
       and p.pinned_at is null
       -- Compound keyset: a timestamp alone is not a total order, and two posts
       -- in the same millisecond would drop or repeat a row across pages.
       and (
         p_before_created is null
         or (p.created_at, p.id) < (p_before_created, p_before_id)
       )
     order by p.created_at desc, p.id desc
     limit v_lim;
end;
$$;

grant execute on function public.get_lounge_feed(text, int, timestamptz, uuid) to authenticated;

drop function if exists public.get_lounge_pinned();
create function public.get_lounge_pinned()
returns table (
  id                  uuid,
  kind                text,
  author_student_id   uuid,
  display_name        text,
  avatar_url          text,
  body                text,
  target_student_id   uuid,
  target_display_name text,
  target_avatar_url   text,
  pulse_kind          text,
  pulse_value         int,
  w_count             int,
  reply_count         int,
  i_gave_w            boolean,
  can_delete          boolean,
  pinned_at           timestamptz,
  hidden_at           timestamptz,
  created_at          timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me    uuid := public.cp_my_student_id();
  v_instr boolean := public.is_instructor();
begin
  if not v_instr and public.cp_space_state() <> 'open' then
    return;
  end if;

  return query
    select p.id, p.kind, p.author_student_id, p.display_name, p.avatar_url,
             -- A hidden post keeps its row but loses its BODY to everyone but
             -- the instructor. Returning the text and trusting the client to
             -- not draw it would make moderation a rendering preference.
             case when p.hidden_at is not null and not v_instr then null else p.body end,
           p.target_student_id, p.target_display_name, p.target_avatar_url,
           p.pulse_kind, p.pulse_value, p.w_count, p.reply_count,
           exists (select 1 from public.lounge_ws w
                    where w.post_id = p.id and w.student_id = v_me),
           (v_instr or (p.kind <> 'pulse' and p.author_student_id = v_me)),
           p.pinned_at, p.hidden_at, p.created_at
      from public.lounge_posts p
     where p.semester_id = public.cp_active_semester_id()
       and p.deleted_at is null
       and p.pinned_at is not null
     order by p.pinned_at desc
     limit 3;
end;
$$;

grant execute on function public.get_lounge_pinned() to authenticated;

-- One post plus its replies — the /app/space/post/:id screen, and where the
-- shoutout notification lands.
drop function if exists public.get_lounge_post(uuid);
create function public.get_lounge_post(p_id uuid)
returns table (
  id                  uuid,
  kind                text,
  author_student_id   uuid,
  display_name        text,
  avatar_url          text,
  body                text,
  target_student_id   uuid,
  target_display_name text,
  target_avatar_url   text,
  pulse_kind          text,
  pulse_value         int,
  w_count             int,
  reply_count         int,
  i_gave_w            boolean,
  can_delete          boolean,
  pinned_at           timestamptz,
  hidden_at           timestamptz,
  created_at          timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me    uuid := public.cp_my_student_id();
  v_instr boolean := public.is_instructor();
begin
  if not v_instr and public.cp_space_state() <> 'open' then
    raise exception 'Student Space is not open right now.';
  end if;

  return query
    select p.id, p.kind, p.author_student_id, p.display_name, p.avatar_url,
             -- A hidden post keeps its row but loses its BODY to everyone but
             -- the instructor. Returning the text and trusting the client to
             -- not draw it would make moderation a rendering preference.
             case when p.hidden_at is not null and not v_instr then null else p.body end,
           p.target_student_id, p.target_display_name, p.target_avatar_url,
           p.pulse_kind, p.pulse_value, p.w_count, p.reply_count,
           exists (select 1 from public.lounge_ws w
                    where w.post_id = p.id and w.student_id = v_me),
           (v_instr or (p.kind <> 'pulse' and p.author_student_id = v_me)),
           p.pinned_at, p.hidden_at, p.created_at
      from public.lounge_posts p
     where p.id = p_id
       and p.deleted_at is null;
end;
$$;

grant execute on function public.get_lounge_post(uuid) to authenticated;

drop function if exists public.get_lounge_replies(uuid);
create function public.get_lounge_replies(p_post_id uuid)
returns table (
  id                uuid,
  author_student_id uuid,
  display_name      text,
  avatar_url        text,
  body              text,
  can_delete        boolean,
  hidden_at         timestamptz,
  created_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me    uuid := public.cp_my_student_id();
  v_instr boolean := public.is_instructor();
begin
  if not v_instr and public.cp_space_state() <> 'open' then
    raise exception 'Student Space is not open right now.';
  end if;

  return query
    select r.id, r.author_student_id, r.display_name, r.avatar_url,
           case when r.hidden_at is not null and not v_instr then null else r.body end,
           (v_instr or r.author_student_id = v_me),
           r.hidden_at, r.created_at
      from public.lounge_replies r
     where r.post_id = p_post_id
       and r.deleted_at is null
     order by r.created_at asc
     limit 200;
end;
$$;

grant execute on function public.get_lounge_replies(uuid) to authenticated;

-- What the composer needs to render its counters without guessing.
drop function if exists public.get_lounge_quota();
create function public.get_lounge_quota()
returns table (posts_left int, shoutouts_left int, ws_left int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.cp_my_student_id();
begin
  return query
    select
      greatest(0, 5 - (select count(*)::int from public.lounge_posts
                        where author_student_id = v_me and kind = 'text'
                          and deleted_at is null
                          and created_at > now() - interval '24 hours')),
      greatest(0, 3 - (select count(*)::int from public.lounge_posts
                        where author_student_id = v_me and kind = 'shoutout'
                          and deleted_at is null
                          and created_at > now() - interval '7 days')),
      greatest(0, 3 - (select count(*)::int from public.lounge_ws
                        where student_id = v_me
                          and created_at > now() - interval '24 hours'));
end;
$$;

grant execute on function public.get_lounge_quota() to authenticated;

-- Everyone in Student Space, with the handful of game facts the social
-- surfaces render beside a name.
--
-- ⚠ THE CLIENT MUST NOT USE `listStudents` FOR THIS. That function joins
-- `student_secrets` to merge claim tokens for the instructor's roster — calling
-- it from the student app would ship every classmate's claim token over the
-- wire to build a name picker. The columns below are exactly what the UI draws
-- and nothing else.
--
-- INCLUDES the caller, deliberately: chat renders a level and a rank beside
-- your OWN name too, and `send_message` already ignores a self-mention. The
-- shoutout picker filters itself out client-side, which is a one-line concern
-- there rather than a second RPC here.
--
-- `rank` comes from the twice-daily snapshot, so it is the same number the
-- leaderboard shows — not a live recount that would quietly disagree with it.
drop function if exists public.list_lounge_classmates();
drop function if exists public.get_space_people();
create function public.get_space_people()
returns table (
  id              uuid,
  display_name    text,
  avatar_url      text,
  semester_points int,
  section_id      uuid,
  rank            int
)
language sql
stable
security definer
set search_path = public
as $$
  select stu.id, stu.display_name, stu.avatar_url,
         stu.semester_points, stu.section_id, snap.rank
    from public.students stu
    join public.sections sec on sec.id = stu.section_id
    left join public.leaderboard_snapshot snap on snap.student_id = stu.id
   where sec.space_enabled
     and sec.semester_id = public.cp_active_semester_id()
     and stu.archived_at is null
     and (public.is_instructor() or public.cp_space_state() = 'open')
   order by stu.display_name;
$$;

grant execute on function public.get_space_people() to authenticated;

-- The 7-day shoutout strip on a profile.
drop function if exists public.list_shoutouts_for(uuid);
create function public.list_shoutouts_for(p_student_id uuid)
returns table (
  id           uuid,
  display_name text,
  avatar_url   text,
  body         text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.avatar_url, p.body, p.created_at
    from public.lounge_posts p
   where p.kind = 'shoutout'
     and p.target_student_id = p_student_id
     and p.deleted_at is null
     and p.hidden_at is null
     and p.created_at > now() - interval '7 days'
     and (public.is_instructor() or public.cp_space_state() = 'open')
   order by p.created_at desc
   limit 10;
$$;

grant execute on function public.list_shoutouts_for(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. Class Pulse
--
--    Auto-posted milestones. Level-ups and podium changes only (the user's
--    call) — badge unlocks and streaks were considered and left out, because a
--    feed where most cards are written by a robot stops being a lounge.
--
--    Voice is NEUTRAL AND FACTUAL, also the user's call.
--
--    Both triggers hang off the TABLE that already records the fact, never off
--    the function that writes it. `refresh_leaderboard_snapshot` has changed
--    owner three times (0023 → 0029 → 0037 → 0038), each move re-copying a
--    growing body; a trigger on the row it writes gets the same signal with
--    nothing to drift from. Same reasoning as 0021's town_crier.
-- ----------------------------------------------------------------------------

-- Nothing to announce to nobody: skip the write entirely while no section is
-- in the beta, so enabling it later does not reveal months of backlog.
create or replace function public.cp_lounge_pulse_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.sections where space_enabled);
$$;

revoke execute on function public.cp_lounge_pulse_enabled() from public, anon, authenticated;

create or replace function public.cp_pulse_level_up()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old int;
  v_new int;
begin
  if not public.cp_lounge_pulse_enabled() then
    return null;
  end if;
  if NEW.archived_at is not null then
    return null;
  end if;

  v_old := public.cp_level(coalesce(OLD.semester_points, 0));
  v_new := public.cp_level(coalesce(NEW.semester_points, 0));
  if v_new <= v_old then
    return null;                                   -- also covers a points LOSS
  end if;

  insert into public.lounge_posts
    (kind, author_student_id, display_name, avatar_url, body, pulse_kind, pulse_value)
  values
    ('pulse', NEW.id, NEW.display_name, NEW.avatar_url,
     NEW.display_name || ' reached Level ' || v_new || '.', 'level', v_new);

  return null;
end;
$$;

drop trigger if exists trg_pulse_level_up on public.students;
create trigger trg_pulse_level_up
  after update of semester_points on public.students
  for each row execute function public.cp_pulse_level_up();

create or replace function public.cp_pulse_podium()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_avatar text;
begin
  if not public.cp_lounge_pulse_enabled() then
    return null;
  end if;
  if NEW.rank is distinct from 1 then
    return null;
  end if;
  -- Only when the crown actually CHANGES HANDS. On an UPDATE where the same
  -- student is still #1, OLD.rank is already 1 and nothing is posted — which is
  -- what stops this firing twice a day, every day, forever.
  if TG_OP = 'UPDATE' and OLD.rank is not distinct from 1 then
    return null;
  end if;

  select s.display_name, s.avatar_url into v_name, v_avatar
    from public.students s where s.id = NEW.student_id and s.archived_at is null;
  if not found then
    return null;
  end if;

  insert into public.lounge_posts
    (kind, author_student_id, display_name, avatar_url, body, pulse_kind, pulse_value)
  values
    ('pulse', NEW.student_id, v_name, v_avatar,
     v_name || ' is now #1 on the leaderboard.', 'podium', 1);

  return null;
end;
$$;

drop trigger if exists trg_pulse_podium on public.leaderboard_snapshot;
create trigger trg_pulse_podium
  after insert or update of rank on public.leaderboard_snapshot
  for each row execute function public.cp_pulse_podium();

-- ----------------------------------------------------------------------------
-- 10. Realtime
--
--     ONLY lounge_posts. A W or a reply bumps a counter on the post, which
--     fires an UPDATE here — so publishing the other two tables would triple
--     the traffic to learn the same thing. Realtime honours RLS, and the SELECT
--     policy above already restricts this to students whose Space is open.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'lounge_posts'
  ) then
    alter publication supabase_realtime add table public.lounge_posts;
  end if;
end
$$;

-- ============================================================================
-- Verify (run twice — this file is idempotent):
--
--   -- 1. Tables, and every counter starts at zero:
--   select count(*) from public.lounge_posts;      -- 0 on a fresh install
--
--   -- 2. From the APP as a student in an enabled section:
--   --   select public.post_to_lounge('first post');
--   --   select * from public.get_lounge_feed('latest', 20, null, null);
--   --   -- expect 1 row, w_count 0, reply_count 0, can_delete true
--
--   -- 3. The duplicate guard bites (this is the one that protects a quota):
--   --   select public.post_to_lounge('first post');   -- ERROR: You just posted that.
--
--   -- 4. Counters are maintained by trigger, not by the client. As ANOTHER
--   --    student:
--   --   select * from public.give_w('<post-uuid>');   -- w_count 1, i_gave_w t, w_left 2
--   --   select * from public.give_w('<post-uuid>');   -- w_count 0, i_gave_w f, w_left 3
--   --   -- the second call is the un-W: the allowance must come BACK.
--
--   -- 5. You cannot W your own post:
--   --   (as the author) select * from public.give_w('<post-uuid>');
--   --   -- ERROR:  You cannot W your own post.
--
--   -- 6. Soft delete keeps the row and drops it from the feed:
--   --   select public.delete_lounge_post('<post-uuid>');
--   --   select count(*) from public.lounge_posts where deleted_at is not null;  -- 1
--   --   select count(*) from public.get_lounge_feed('latest', 20, null, null);  -- 0
--
--   -- 7. Class Pulse only fires once per crown change. Refresh the snapshot
--   --    twice without the leader changing and confirm no second post:
--   --   select public.refresh_leaderboard_snapshot();
--   --   select public.refresh_leaderboard_snapshot();
--   --   select count(*) from public.lounge_posts where pulse_kind = 'podium';
--   --   -- expect at most 1 — a second row here means the trigger is firing on
--   --   -- every refresh, which would bury the feed within a week.
--
--   -- 8. Realtime is published exactly once:
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and tablename like 'lounge%';
--   -- expect exactly one row: lounge_posts
-- ============================================================================
