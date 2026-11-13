-- ============================================================================
-- 0068 — Lounge: threaded replies + "who gave a W"   (2026-11-13)
--
-- Paste AFTER 0042 (needs lounge_posts / lounge_replies / lounge_ws). Independent
-- of 0043–0067. Idempotent — paste it twice.
--
-- Decisions (instructor):
--   · a W list is visible to EVERYONE in Student Space (a reaction list, like a
--     "liked by" sheet); un-W-ing removes you from it.
--   · replies thread ONE LEVEL deep. A reply to a reply attaches to the same
--     thread (Instagram style) and remembers which comment it answered, so the
--     screen can say "↳ Maria" without nesting any deeper.
--
-- WHAT CHANGES
--   1. lounge_replies gains parent_reply_id (the thread ROOT — always a
--      top-level comment) and reply_to_id (the comment actually answered).
--   2. ownership moves 0042 → 0068, all re-granted:
--        reply_to_post     SIGNATURE GROWS (p_parent_id) → the exact old
--                          (uuid, text) signature is dropped first, or
--                          PostgREST would see an overload and reject every
--                          call as ambiguous (the 0028 lesson).
--        get_lounge_replies RETURN TYPE grows → drop-first (the 0014 lesson).
--        delete_lounge_reply deleting a thread root soft-deletes its answers,
--                          otherwise they would float with no parent.
--   3. get_post_ws(post) — the W list. A definer RPC, because lounge_ws is
--      readable by direct select but a join to students for names must not
--      depend on the caller's RLS.
--   4. a push to the author of the comment you answered (type 'space_reply').
--      Same shape as 0042's shoutout push; never to yourself.
--
-- EXPLICIT GRANTS: every new/recreated function revokes PUBLIC + anon and grants
-- authenticated, so it is correct whether or not 0067's default-privilege change
-- has been applied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columns
-- ----------------------------------------------------------------------------
alter table public.lounge_replies
  add column if not exists parent_reply_id uuid references public.lounge_replies(id) on delete cascade,
  add column if not exists reply_to_id     uuid references public.lounge_replies(id) on delete set null;

create index if not exists lounge_replies_parent_idx
  on public.lounge_replies (parent_reply_id, created_at)
  where parent_reply_id is not null and deleted_at is null;

-- ----------------------------------------------------------------------------
-- 2a. reply_to_post  (signature grows)
-- ----------------------------------------------------------------------------
drop function if exists public.reply_to_post(uuid, text);
drop function if exists public.reply_to_post(uuid, text, uuid);

create function public.reply_to_post(
  p_post_id   uuid,
  p_body      text,
  p_parent_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_body    text;
  v_post    public.lounge_posts%rowtype;
  v_answered public.lounge_replies%rowtype;
  v_root    uuid;
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

  if p_parent_id is not null then
    select * into v_answered from public.lounge_replies where id = p_parent_id;
    if not found or v_answered.deleted_at is not null or v_answered.post_id <> p_post_id then
      raise exception 'That comment is gone.';
    end if;
    if v_answered.hidden_at is not null then
      raise exception 'That comment is under review.';
    end if;
    -- One level deep: answering a reply joins the thread it lives in.
    v_root := coalesce(v_answered.parent_reply_id, v_answered.id);
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

  insert into public.lounge_replies
         (post_id, author_student_id, display_name, avatar_url, body, parent_reply_id, reply_to_id)
       values
         (p_post_id, v_student.id, v_student.display_name, v_student.avatar_url, v_body,
          v_root, case when p_parent_id is null then null else p_parent_id end)
    returning id into v_id;

  -- Tell the person you answered. Never yourself, never a deleted account.
  if p_parent_id is not null
     and v_answered.author_student_id is not null
     and v_answered.author_student_id <> v_student.id then
    perform public.cp_push_dispatch(array[
      public.cp_queue_notification(
        v_answered.author_student_id, 'space_reply',
        v_student.display_name || ' replied to you',
        left(v_body, 120),
        '/app/space/post/' || p_post_id::text
      )
    ]);
  end if;

  return v_id;
end;
$$;

revoke execute on function public.reply_to_post(uuid, text, uuid) from public, anon;
grant  execute on function public.reply_to_post(uuid, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2b. get_lounge_replies  (return type grows → drop-first)
-- ----------------------------------------------------------------------------
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
  created_at        timestamptz,
  parent_reply_id   uuid,
  reply_to_id       uuid,
  reply_to_name     text
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
           r.hidden_at, r.created_at,
           r.parent_reply_id, r.reply_to_id,
           a.display_name
      from public.lounge_replies r
      left join public.lounge_replies a
             on a.id = r.reply_to_id and a.deleted_at is null
     where r.post_id = p_post_id
       and r.deleted_at is null
     order by r.created_at asc
     limit 400;
end;
$$;

revoke execute on function public.get_lounge_replies(uuid) from public, anon;
grant  execute on function public.get_lounge_replies(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2c. delete_lounge_reply — a thread root takes its answers with it
-- ----------------------------------------------------------------------------
create or replace function public.delete_lounge_reply(p_id uuid)
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
  -- Answers inside this thread (only a root can have any).
  update public.lounge_replies set deleted_at = now()
   where parent_reply_id = p_id and deleted_at is null;
end;
$$;

revoke execute on function public.delete_lounge_reply(uuid) from public, anon;
grant  execute on function public.delete_lounge_reply(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. get_post_ws — who gave a W
-- ----------------------------------------------------------------------------
drop function if exists public.get_post_ws(uuid);
create function public.get_post_ws(p_post_id uuid)
returns table (
  student_id   uuid,
  display_name text,
  avatar_url   text,
  section_id   uuid,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() and public.cp_space_state() <> 'open' then
    raise exception 'Student Space is not open right now.';
  end if;

  return query
    select s.id, s.display_name, s.avatar_url, s.section_id, w.created_at
      from public.lounge_ws w
      join public.lounge_posts p on p.id = w.post_id and p.deleted_at is null
      join public.students s on s.id = w.student_id and s.archived_at is null
     where w.post_id = p_post_id
     order by w.created_at desc
     limit 300;
end;
$$;

revoke execute on function public.get_post_ws(uuid) from public, anon;
grant  execute on function public.get_post_ws(uuid) to authenticated;

-- ============================================================================
-- VERIFY (SQL editor). Every row should read `true`.
-- ============================================================================
-- select 'columns' as check,
--        (select count(*) = 2 from information_schema.columns
--          where table_schema = 'public' and table_name = 'lounge_replies'
--            and column_name in ('parent_reply_id', 'reply_to_id'))
-- union all
-- select 'one reply_to_post (no overload)',
--        (select count(*) = 1 from pg_proc where proname = 'reply_to_post'
--            and pronamespace = 'public'::regnamespace)
-- union all
-- select 'get_post_ws exists',
--        exists (select 1 from pg_proc where proname = 'get_post_ws'
--                 and pronamespace = 'public'::regnamespace)
-- union all
-- select 'anon cannot read the W list',
--        not has_function_privilege('anon', 'public.get_post_ws(uuid)', 'execute');
-- ============================================================================
