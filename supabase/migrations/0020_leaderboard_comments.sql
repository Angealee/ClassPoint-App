-- ============================================================================
-- ClassPoint · 0020 · Flying leaderboard comments
-- Run after 0019. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   Students post short comments that fly across the leaderboard (danmaku
--   style). Named + moderated (the user's decision): every pill shows who said
--   it, a banned-word filter blocks the obvious stuff, the instructor can
--   delete anything, students get 3 per rolling 24h, and everything
--   self-destructs after 24h.
--
-- DESIGN NOTES
--   • ONE GLOBAL STREAM: comments aren't scoped to a section view. Every
--     comment flies on every board — one shared conversation for the class.
--   • DENORMALIZED AUTHOR: display_name/avatar_url are copied onto the row at
--     post time, so a realtime INSERT payload carries everything a pill needs
--     to render immediately — no per-comment join or extra round-trip. Rows
--     live 24h, so a stale name can't meaningfully drift.
--   • student_id IS NULL  ⇒  the instructor wrote it (badged in the UI, and
--     exempt from the 3/day limit).
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Paste and run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.leaderboard_comments (
  id           uuid primary key default gen_random_uuid(),
  -- null = posted by the instructor.
  student_id   uuid references public.students(id) on delete cascade,
  display_name text not null,
  avatar_url   text,
  body         text not null check (char_length(btrim(body)) between 1 and 120),
  created_at   timestamptz not null default now()
);
create index if not exists leaderboard_comments_created_idx
  on public.leaderboard_comments (created_at desc);
create index if not exists leaderboard_comments_student_idx
  on public.leaderboard_comments (student_id, created_at desc);

-- Editable without a migration: `insert into leaderboard_banned_words values ('x')`.
create table if not exists public.leaderboard_banned_words (
  word text primary key
);

alter table public.leaderboard_comments   enable row level security;
alter table public.leaderboard_banned_words enable row level security;

-- Everyone signed in reads the stream (names are public here by design).
drop policy if exists leaderboard_comments_select on public.leaderboard_comments;
create policy leaderboard_comments_select on public.leaderboard_comments
  for select to authenticated using (true);

-- Delete your own; the instructor deletes anything. No INSERT policy — posting
-- goes through the RPC so the filter and rate limit can't be skipped.
drop policy if exists leaderboard_comments_delete on public.leaderboard_comments;
create policy leaderboard_comments_delete on public.leaderboard_comments
  for delete to authenticated using (
    public.is_instructor()
    or student_id in (select id from public.students where user_id = auth.uid())
  );

-- The word list is never read by the client — only by the SECURITY DEFINER
-- function below. No policy = no access for anyone else.
drop policy if exists leaderboard_banned_words_none on public.leaderboard_banned_words;

grant select, delete on public.leaderboard_comments to authenticated;

-- Realtime: pills appear on every open board the instant they're posted, and
-- vanish when moderated. (A DELETE event carries only the primary key under the
-- default replica identity — that's all the client needs to remove the pill.)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'leaderboard_comments'
  ) then
    alter publication supabase_realtime add table public.leaderboard_comments;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2. Seed the banned-word list (idempotent). English + Filipino basics.
--    Matched on word boundaries, so "class" never trips on "ass".
-- ----------------------------------------------------------------------------
insert into public.leaderboard_banned_words (word) values
  ('fuck'), ('fucking'), ('fuk'), ('shit'), ('bitch'), ('bastard'), ('asshole'),
  ('dick'), ('cunt'), ('slut'), ('whore'), ('retard'), ('retarded'), ('faggot'),
  ('nigger'), ('nigga'), ('rape'), ('kys'),
  ('putangina'), ('putang'), ('tangina'), ('tanginamo'), ('gago'), ('gaga'),
  ('tarantado'), ('ulol'), ('bobo'), ('tanga'), ('pakyu'), ('punyeta'),
  ('leche'), ('lintik'), ('kingina'), ('pucha'), ('bwisit'), ('hayop'),
  ('inutil'), ('engot'), ('siraulo')
on conflict (word) do nothing;

-- ----------------------------------------------------------------------------
-- 3. post_leaderboard_comment() — the only way in
-- ----------------------------------------------------------------------------
create or replace function public.post_leaderboard_comment(p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_instructor boolean := public.is_instructor();
  v_student       public.students%rowtype;
  v_name          text;
  v_avatar        text;
  v_body          text;
  v_recent        int;
begin
  -- Normalise first: collapse runs of whitespace (incl. newlines, which would
  -- otherwise break a single-line pill) and strip control characters.
  v_body := btrim(regexp_replace(regexp_replace(coalesce(p_body, ''), '[[:cntrl:]]', ' ', 'g'),
                                 '\s+', ' ', 'g'));
  if v_body = '' then
    raise exception 'Say something first.';
  end if;
  if char_length(v_body) > 120 then
    raise exception 'Keep it under 120 characters.';
  end if;

  -- Word-boundary match so ordinary words containing a banned substring pass.
  if exists (
    select 1 from public.leaderboard_banned_words w
     where lower(v_body) ~ ('\m' || w.word || '\M')
  ) then
    raise exception 'Keep it friendly — that one did not pass.';
  end if;

  if v_is_instructor then
    v_name   := 'Instructor';
    v_avatar := null;
  else
    select * into v_student from public.students where user_id = auth.uid();
    if not found then
      raise exception 'Only students can comment.';
    end if;

    -- Rolling 24h window, not a midnight reset: simpler, and it can't be gamed
    -- by posting 3 at 11:59 and 3 more a minute later. UI copy says "3 a day".
    select count(*)::int into v_recent
      from public.leaderboard_comments
     where student_id = v_student.id
       and created_at > now() - interval '24 hours';
    if v_recent >= 3 then
      raise exception 'You have used your 3 comments for today. Back tomorrow.';
    end if;

    v_name   := v_student.display_name;
    v_avatar := v_student.avatar_url;
  end if;

  insert into public.leaderboard_comments (student_id, display_name, avatar_url, body)
       values (case when v_is_instructor then null else v_student.id end,
               v_name, v_avatar, v_body);
end;
$$;

grant execute on function public.post_leaderboard_comment(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Hourly purge. The client also filters to <24h, so the visible cutoff is
--    exact regardless of when this last ran.
-- ----------------------------------------------------------------------------
create or replace function public.cp_purge_leaderboard_comments()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.leaderboard_comments where created_at < now() - interval '24 hours';
$$;

revoke execute on function public.cp_purge_leaderboard_comments() from public, anon, authenticated;

select cron.schedule(
  'classpoint-comments-purge', '5 * * * *',
  $$select public.cp_purge_leaderboard_comments();$$
);
