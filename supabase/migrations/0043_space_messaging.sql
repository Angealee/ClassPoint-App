-- ============================================================================
-- ClassPoint · 0043 · Student Space messaging
-- Run after 0042. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   Chat: one room per beta section, one Global room with the instructor in it,
--   and DMs (student↔student and student↔instructor). Replies, six fixed emoji
--   reactions, @mentions, a pinned message, slow mode and an announce-only
--   switch. Deliberately NO "seen" — see below.
--
-- ── THE DM PROMISE IS ENFORCED BY THE SHAPE OF THE POLICY ───────────────────
--   `cp_can_read_room()` grants a DM room to its MEMBERS ONLY. It gives the
--   instructor nothing. Instructor access to a DM exists solely through
--   `read_dm_thread()`, which writes an `audit_log` row BEFORE it returns a
--   single message.
--
--   That is the whole design. If the instructor had a blanket select here,
--   break-glass would be decorative and the line the app shows students —
--   "Private. Your instructor can review reported threads." — would be a lie.
--
-- ── NO "SEEN", AND THAT IS A SCHEMA DECISION ────────────────────────────────
--   There is no read-receipt column anywhere in this file, because a column
--   that exists gets rendered eventually. Unread state is a timestamp the
--   CLIENT keeps in localStorage and compares against `last_message_at`, so a
--   student's read position never reaches the server and therefore can never be
--   shown to anyone.
--
-- ── WHY MUTE IS A TABLE AND UNREAD IS NOT ───────────────────────────────────
--   Push is dispatched server-side, so the server has to know who muted what.
--   It is the one preference that cannot live on the device.
--
-- ── PUSH POLICY ─────────────────────────────────────────────────────────────
--   Notifications fire for MENTIONS, REPLIES TO YOU, and DMs. Never for every
--   message in a room — a 40-person room would notify 40 people 200 times a day
--   and be muted at the OS level within a week, taking the instructor's
--   broadcasts with it.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None. Rooms are provisioned on demand by `cp_ensure_space_rooms()`, so
--   enabling a section on /teach/space is all it takes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Widen the audit constraint
--
--    `read_dm_thread()` below writes action = 'space_break_glass', and 0041's
--    constraint does not list it — so the FIRST break-glass read would die on a
--    check violation. That is the most important safety path in Student Space,
--    and it would have failed the one time it was ever needed.
--
--    Constraint name preserved (0007/0011). Every earlier value is RE-LISTED:
--    dropping and recreating this silently narrows it otherwise, which has been
--    the bug twice already.
-- ----------------------------------------------------------------------------
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'delete','archive','restore','hard_delete','broadcast',
    'promote','semester_activate',
    'space_flag','space_section','space_timeout',
    'space_break_glass'
  ));

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table if not exists public.space_rooms (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('section', 'global', 'dm')),
  -- Only for kind = 'section'.
  section_id          uuid references public.sections(id) on delete cascade,
  semester_id         uuid not null default public.cp_active_semester_id()
                        references public.semesters(id) on delete cascade,

  -- Canonical participant key for a DM, so the same pair can never open two
  -- rooms by both tapping Message at once. Built by cp_dm_key() below.
  dm_key              text,

  slow_mode_seconds   int not null default 0 check (slow_mode_seconds between 0 and 300),
  -- The Global room's switch: on = only the instructor may post.
  announce_only       boolean not null default false,
  pinned_message_id   uuid,

  -- Denormalized so the room LIST is one query with no per-room subselect.
  last_message_at     timestamptz,
  last_message_by     text,
  last_message_body   text,

  created_at          timestamptz not null default now()
);

-- Exactly one Global room per semester, and one room per section.
create unique index if not exists space_rooms_global_uniq
  on public.space_rooms (semester_id) where kind = 'global';
create unique index if not exists space_rooms_section_uniq
  on public.space_rooms (section_id) where kind = 'section';
create unique index if not exists space_rooms_dm_uniq
  on public.space_rooms (dm_key) where kind = 'dm';

-- Members exist ONLY for DM rooms. Section and Global membership is derived —
-- there are no rows to maintain, and nothing to get out of sync when the
-- instructor moves a student between sections.
create table if not exists public.space_room_members (
  room_id    uuid not null references public.space_rooms(id) on delete cascade,
  -- NULL = the instructor (0020's convention, used throughout Student Space).
  student_id uuid references public.students(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- A nullable column cannot carry a primary key's meaning, so uniqueness is an
-- index over a coalesced sentinel instead.
create unique index if not exists space_room_members_uniq
  on public.space_room_members
     (room_id, coalesce(student_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists space_room_members_student_idx
  on public.space_room_members (student_id);

create table if not exists public.space_messages (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid not null references public.space_rooms(id) on delete cascade,
  author_student_id uuid references public.students(id) on delete cascade,
  display_name      text not null,
  avatar_url        text,
  body              text not null check (char_length(btrim(body)) between 1 and 600),

  reply_to_id       uuid references public.space_messages(id) on delete set null,
  -- Denormalized reply preview: a realtime payload can draw the quoted line
  -- without a second fetch, and the quote survives the parent being deleted.
  reply_to_name     text,
  reply_to_excerpt  text,

  hidden_at         timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists space_messages_room_idx
  on public.space_messages (room_id, created_at desc, id desc);
create index if not exists space_messages_author_idx
  on public.space_messages (author_student_id, created_at desc);

-- `room_id` is denormalized here ON PURPOSE. A realtime `postgres_changes`
-- filter is single-column equality, so without it every reaction anywhere in
-- the app would be pushed to every open room.
-- ⚠ REACTIONS ARE STORED AS CODES, NOT AS THE EMOJI THEMSELVES.
--
-- Storing the glyph looks simpler and is a trap: several of the six carry a
-- variation selector (❤️ is U+2764 U+FE0F), so a client that sends the bare
-- codepoint — or any layer that normalises the string — fails the CHECK and the
-- reaction silently will not save. Codes are ASCII, immune to normalisation,
-- and let the glyph be changed later without a migration. `CHAT_REACTIONS` in
-- src/lib/types.ts maps code → emoji.
create table if not exists public.space_message_reactions (
  message_id uuid not null references public.space_messages(id) on delete cascade,
  room_id    uuid not null references public.space_rooms(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  code       text not null check (code in ('like', 'lol', 'fire', 'wow', 'sad', 'love')),
  created_at timestamptz not null default now(),
  primary key (message_id, student_id, code)
);
create index if not exists space_reactions_room_idx
  on public.space_message_reactions (room_id, message_id);

-- Drives the push fan-out and the "mentions me" highlight. A table rather than
-- parsing the body on read: the client resolves @names to ids when it sends, so
-- the server never has to guess which "Maria" was meant.
create table if not exists public.space_mentions (
  message_id uuid not null references public.space_messages(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (message_id, student_id)
);

create table if not exists public.space_room_prefs (
  student_id uuid not null references public.students(id) on delete cascade,
  room_id    uuid not null references public.space_rooms(id) on delete cascade,
  muted      boolean not null default false,
  primary key (student_id, room_id)
);

alter table public.space_rooms             enable row level security;
alter table public.space_room_members      enable row level security;
alter table public.space_messages          enable row level security;
alter table public.space_message_reactions enable row level security;
alter table public.space_mentions          enable row level security;
alter table public.space_room_prefs        enable row level security;

-- ----------------------------------------------------------------------------
-- 2. Access helpers
-- ----------------------------------------------------------------------------

-- Canonical DM key. Sorting the two participants means (A,B) and (B,A) produce
-- the same string, so the unique index above collapses a double-tap race into
-- one room instead of two half-empty ones. 'instructor' stands in for null.
create or replace function public.cp_dm_key(p_a uuid, p_b uuid)
returns text
language sql
immutable
as $$
  select case
           when coalesce(p_a::text, 'instructor') < coalesce(p_b::text, 'instructor')
             then coalesce(p_a::text, 'instructor') || '|' || coalesce(p_b::text, 'instructor')
           else coalesce(p_b::text, 'instructor') || '|' || coalesce(p_a::text, 'instructor')
         end;
$$;

revoke execute on function public.cp_dm_key(uuid, uuid) from public, anon, authenticated;

/*
 * May the caller READ this room?
 *
 * ⚠ A DM resolves to MEMBERSHIP ONLY. The instructor branch below deliberately
 * does not cover 'dm' — that is the entire DM privacy promise, and widening
 * this one `or` would silently revoke it everywhere at once.
 */
create or replace function public.cp_can_read_room(p_room uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_room  public.space_rooms%rowtype;
  v_me    uuid := public.cp_my_student_id();
  v_instr boolean := public.is_instructor();
begin
  select * into v_room from public.space_rooms where id = p_room;
  if not found then
    return false;
  end if;

  if v_room.kind = 'dm' then
    return exists (
      select 1 from public.space_room_members m
       where m.room_id = p_room
         and (
           (v_instr and m.student_id is null)
           or (v_me is not null and m.student_id = v_me)
         )
    );
  end if;

  if not v_instr and public.cp_space_state() <> 'open' then
    return false;
  end if;
  if v_instr then
    return true;
  end if;

  if v_room.kind = 'global' then
    return v_room.semester_id = public.cp_active_semester_id();
  end if;

  -- kind = 'section'
  return exists (
    select 1 from public.students stu
     where stu.id = v_me and stu.section_id = v_room.section_id
  );
end;
$$;

grant execute on function public.cp_can_read_room(uuid) to authenticated;

/*
 * May the caller POST here, and if not, why not?
 *
 * Returns NULL when they may, otherwise the message to show them. A single
 * function so the four rules — space state, timeout, announce-only, slow mode —
 * cannot disagree between `send_message` and the composer's own check.
 */
create or replace function public.cp_room_post_block(p_room uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_room     public.space_rooms%rowtype;
  v_me       uuid := public.cp_my_student_id();
  v_instr    boolean := public.is_instructor();
  v_last     timestamptz;
  v_wait     int;
  v_to_instr boolean;
begin
  select * into v_room from public.space_rooms where id = p_room;
  if not found then
    return 'That room is gone.';
  end if;
  if not public.cp_can_read_room(p_room) then
    return 'You are not in that room.';
  end if;

  if v_instr then
    return null;                         -- the instructor is never slowed or muted
  end if;

  if public.cp_space_state() <> 'open' then
    return 'Student Space is not open right now.';
  end if;

  -- THE TIMEOUT EXCEPTION. A muted student may still DM the instructor,
  -- because otherwise their only way to appeal a mute is to find them in
  -- person. Every other room stays closed to them.
  if public.cp_space_is_timed_out() then
    v_to_instr := v_room.kind = 'dm' and exists (
      select 1 from public.space_room_members m
       where m.room_id = p_room and m.student_id is null
    );
    if not v_to_instr then
      return 'You are muted right now. You can still read, and you can still message your instructor.';
    end if;
  end if;

  if v_room.announce_only then
    return 'Only the instructor can post in here right now.';
  end if;

  if v_room.slow_mode_seconds > 0 then
    select max(created_at) into v_last
      from public.space_messages
     where room_id = p_room and author_student_id = v_me and deleted_at is null;
    if v_last is not null then
      v_wait := ceil(extract(epoch from (v_last + make_interval(secs => v_room.slow_mode_seconds) - now())));
      if v_wait > 0 then
        return 'Slow mode: wait ' || v_wait || 's.';
      end if;
    end if;
  end if;

  return null;
end;
$$;

grant execute on function public.cp_room_post_block(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. RLS
--
--    SELECT only, gated on cp_can_read_room(). Every write goes through an RPC.
-- ----------------------------------------------------------------------------
drop policy if exists space_rooms_select on public.space_rooms;
create policy space_rooms_select on public.space_rooms
  for select to authenticated using (public.cp_can_read_room(id));

drop policy if exists space_room_members_select on public.space_room_members;
create policy space_room_members_select on public.space_room_members
  for select to authenticated using (public.cp_can_read_room(room_id));

drop policy if exists space_messages_select on public.space_messages;
create policy space_messages_select on public.space_messages
  for select to authenticated using (public.cp_can_read_room(room_id));

drop policy if exists space_reactions_select on public.space_message_reactions;
create policy space_reactions_select on public.space_message_reactions
  for select to authenticated using (public.cp_can_read_room(room_id));

drop policy if exists space_mentions_select on public.space_mentions;
create policy space_mentions_select on public.space_mentions
  for select to authenticated using (
    student_id = public.cp_my_student_id() or public.is_instructor()
  );

drop policy if exists space_room_prefs_select on public.space_room_prefs;
create policy space_room_prefs_select on public.space_room_prefs
  for select to authenticated using (student_id = public.cp_my_student_id());

grant select on public.space_rooms             to authenticated;
grant select on public.space_room_members      to authenticated;
grant select on public.space_messages          to authenticated;
grant select on public.space_message_reactions to authenticated;
grant select on public.space_mentions          to authenticated;
grant select on public.space_room_prefs        to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Room provisioning
--
--    On demand rather than at enable-time, so this file does not have to reach
--    back into 0041's set_section_space(). Idempotent: the unique indexes above
--    make a double call a no-op.
-- ----------------------------------------------------------------------------
create or replace function public.cp_ensure_space_rooms()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sem uuid := public.cp_active_semester_id();
begin
  if v_sem is null then
    return;
  end if;

  insert into public.space_rooms (kind, semester_id)
       select 'global', v_sem
        where not exists (
          select 1 from public.space_rooms
           where kind = 'global' and semester_id = v_sem
        );

  insert into public.space_rooms (kind, section_id, semester_id)
       select 'section', sec.id, sec.semester_id
         from public.sections sec
        where sec.space_enabled
          and sec.semester_id = v_sem
          and not exists (
            select 1 from public.space_rooms r
             where r.kind = 'section' and r.section_id = sec.id
          );
end;
$$;

revoke execute on function public.cp_ensure_space_rooms() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Reading
-- ----------------------------------------------------------------------------

-- Every room the caller is in, newest activity first. VOLATILE, not stable: it
-- provisions rooms on the way through.
drop function if exists public.list_my_rooms();
create function public.list_my_rooms()
returns table (
  id                uuid,
  kind              text,
  name              text,
  slow_mode_seconds int,
  announce_only     boolean,
  pinned_message_id uuid,
  muted             boolean,
  last_message_at   timestamptz,
  last_message_by   text,
  last_message_body text,
  member_count      int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.cp_my_student_id();
begin
  if not public.is_instructor() and public.cp_space_state() <> 'open' then
    raise exception 'Student Space is not open right now.';
  end if;

  perform public.cp_ensure_space_rooms();

  return query
    select
      r.id,
      r.kind,
      case
        when r.kind = 'global'  then 'Global'
        when r.kind = 'section' then coalesce(sec.name, 'Your section')
        else coalesce(
          -- A DM is named after the OTHER person.
          (select coalesce(stu.display_name, 'Instructor')
             from public.space_room_members m
             left join public.students stu on stu.id = m.student_id
            where m.room_id = r.id
              and m.student_id is distinct from v_me
            limit 1),
          'Direct message'
        )
      end,
      r.slow_mode_seconds,
      r.announce_only,
      r.pinned_message_id,
      coalesce(pref.muted, false),
      r.last_message_at,
      r.last_message_by,
      r.last_message_body,
      case
        when r.kind = 'dm' then (select count(*)::int from public.space_room_members m
                                  where m.room_id = r.id)
        when r.kind = 'section' then (select count(*)::int from public.students stu
                                       where stu.section_id = r.section_id
                                         and stu.archived_at is null)
        else (select count(*)::int from public.students stu
                join public.sections s2 on s2.id = stu.section_id
               where s2.space_enabled and stu.archived_at is null)
      end
    from public.space_rooms r
    left join public.sections sec on sec.id = r.section_id
    left join public.space_room_prefs pref
           on pref.room_id = r.id and pref.student_id = v_me
   where public.cp_can_read_room(r.id)
   order by r.last_message_at desc nulls last, r.kind;
end;
$$;

grant execute on function public.list_my_rooms() to authenticated;

-- One page of a room, NEWEST FIRST. The client reverses for display and pages
-- backwards with the compound cursor — a timestamp alone is not a total order.
drop function if exists public.get_room_messages(uuid, int, timestamptz, uuid);
create function public.get_room_messages(
  p_room           uuid,
  p_limit          int         default 40,
  p_before_created timestamptz default null,
  p_before_id      uuid        default null
)
returns table (
  id               uuid,
  author_student_id uuid,
  display_name     text,
  avatar_url       text,
  body             text,
  reply_to_id      uuid,
  reply_to_name    text,
  reply_to_excerpt text,
  mentions_me      boolean,
  can_delete       boolean,
  reactions        jsonb,
  my_reactions     jsonb,
  hidden_at        timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me    uuid := public.cp_my_student_id();
  v_instr boolean := public.is_instructor();
  v_lim   int := least(greatest(coalesce(p_limit, 40), 1), 100);
begin
  if not public.cp_can_read_room(p_room) then
    raise exception 'You are not in that room.';
  end if;

  return query
    select
      m.id,
      m.author_student_id,
      m.display_name,
      m.avatar_url,
      -- A deleted message is a TOMBSTONE: the row survives so a reply to it
      -- still makes sense, but the text is withheld server-side. Same for a
      -- hidden one, to everyone but the instructor.
      case
        when m.deleted_at is not null then null
        when m.hidden_at is not null and not v_instr then null
        else m.body
      end,
      m.reply_to_id,
      m.reply_to_name,
      m.reply_to_excerpt,
      exists (select 1 from public.space_mentions x
               where x.message_id = m.id and x.student_id = v_me),
      (v_instr or (v_me is not null and m.author_student_id = v_me)),
      coalesce((
        select jsonb_object_agg(t.code, t.n)
          from (select r.code, count(*)::int as n
                  from public.space_message_reactions r
                 where r.message_id = m.id
                 group by r.code) t
      ), '{}'::jsonb),
      coalesce((
        select jsonb_agg(r.code)
          from public.space_message_reactions r
         where r.message_id = m.id and r.student_id = v_me
      ), '[]'::jsonb),
      m.hidden_at,
      m.deleted_at,
      m.created_at
    from public.space_messages m
   where m.room_id = p_room
     and (
       p_before_created is null
       or (m.created_at, m.id) < (p_before_created, p_before_id)
     )
   order by m.created_at desc, m.id desc
   limit v_lim;
end;
$$;

grant execute on function public.get_room_messages(uuid, int, timestamptz, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Sending
-- ----------------------------------------------------------------------------
drop function if exists public.send_message(uuid, text, uuid, uuid[]);
create function public.send_message(
  p_room     uuid,
  p_body     text,
  p_reply_to uuid   default null,
  p_mentions uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block   text;
  v_me      uuid := public.cp_my_student_id();
  v_instr   boolean := public.is_instructor();
  v_student public.students%rowtype;
  v_name    text;
  v_avatar  text;
  v_body    text;
  v_room    public.space_rooms%rowtype;
  v_parent  public.space_messages%rowtype;
  v_id      uuid;
  v_ids     uuid[];
  v_chunk   uuid[];
  i         int;
begin
  v_block := public.cp_room_post_block(p_room);
  if v_block is not null then
    raise exception '%', v_block;
  end if;

  -- Same normaliser and word list as the Lounge (0042). One definition of what
  -- "600 characters" and "friendly" mean across all of Student Space.
  v_body := public.cp_lounge_clean(p_body);

  select * into v_room from public.space_rooms where id = p_room;

  if v_instr then
    v_name := 'Instructor';
    v_avatar := null;
  else
    select * into v_student from public.students where id = v_me;
    if not found then
      raise exception 'Only students can send messages.';
    end if;
    v_name := v_student.display_name;
    v_avatar := v_student.avatar_url;
  end if;

  -- Duplicate guard, same reasoning as 0042: a retry after a timeout that
  -- actually succeeded should not post twice.
  if exists (
    select 1 from public.space_messages
     where room_id = p_room
       and author_student_id is not distinct from (case when v_instr then null else v_me end)
       and deleted_at is null
       and body = v_body
       and created_at > now() - interval '30 seconds'
  ) then
    raise exception 'You just sent that.';
  end if;

  if p_reply_to is not null then
    select * into v_parent from public.space_messages
     where id = p_reply_to and room_id = p_room;
    if not found then
      raise exception 'That message is not in this room.';
    end if;
  end if;

  insert into public.space_messages (
    room_id, author_student_id, display_name, avatar_url, body,
    reply_to_id, reply_to_name, reply_to_excerpt
  ) values (
    p_room, case when v_instr then null else v_me end, v_name, v_avatar, v_body,
    p_reply_to, v_parent.display_name,
    case when v_parent.id is null then null
         when v_parent.deleted_at is not null then null
         else left(v_parent.body, 80) end
  ) returning id into v_id;

  -- Mentions: the CLIENT resolves @names to ids, so the server never guesses
  -- which "Maria" was meant. Only people who can actually read the room count.
  if p_mentions is not null and array_length(p_mentions, 1) is not null then
    insert into public.space_mentions (message_id, student_id)
         select v_id, x
           from unnest(p_mentions) as x
          where x is distinct from v_me
            and exists (select 1 from public.students s where s.id = x and s.archived_at is null)
    on conflict do nothing;
  end if;

  -- ── Push fan-out ────────────────────────────────────────────────────────
  -- MENTIONS, REPLIES TO YOU, and DMs only. Never the whole room. Muted rooms
  -- and the sender are excluded in the query, not in a per-row check.
  with targets as (
    select distinct t.student_id
      from (
        select x.student_id from public.space_mentions x where x.message_id = v_id
        union
        select v_parent.author_student_id where v_parent.author_student_id is not null
        union
        select m.student_id from public.space_room_members m
         where v_room.kind = 'dm' and m.room_id = p_room and m.student_id is not null
      ) t
     where t.student_id is not null
       and t.student_id is distinct from v_me
       and not exists (
         select 1 from public.space_room_prefs pref
          where pref.student_id = t.student_id and pref.room_id = p_room and pref.muted
       )
  ), inserted as (
    insert into public.notifications (student_id, type, title, body, url)
    select t.student_id,
           case when v_room.kind = 'dm' then 'space_dm' else 'space_mention' end,
           case when v_room.kind = 'dm' then v_name else v_name || ' mentioned you' end,
           left(v_body, 120),
           '/app/space/chat/' || p_room::text
      from targets t
    returning id
  )
  select array_agg(id) into v_ids from inserted;

  -- Chunked at 50: cp_push_dispatch puts every id in ONE http body and was
  -- written for one-or-two-id calls (the 0034 lesson).
  if v_ids is not null then
    i := 1;
    while i <= array_length(v_ids, 1) loop
      v_chunk := v_ids[i : least(i + 49, array_length(v_ids, 1))];
      perform public.cp_push_dispatch(v_chunk);
      i := i + 50;
    end loop;
  end if;

  return v_id;
end;
$$;

grant execute on function public.send_message(uuid, text, uuid, uuid[]) to authenticated;

-- Keeps the room list one query. Fires on the message, not from the RPC, so a
-- message inserted any other way still updates the preview.
create or replace function public.cp_room_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.space_rooms
     set last_message_at   = NEW.created_at,
         last_message_by   = NEW.display_name,
         last_message_body = left(NEW.body, 80)
   where id = NEW.room_id;
  return null;
end;
$$;

drop trigger if exists trg_room_touch on public.space_messages;
create trigger trg_room_touch
  after insert on public.space_messages
  for each row execute function public.cp_room_touch();

-- ----------------------------------------------------------------------------
-- 7. Reactions, deletion, DMs
-- ----------------------------------------------------------------------------
drop function if exists public.react_to_message(uuid, text);
create function public.react_to_message(p_message uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := public.cp_my_student_id();
  v_msg public.space_messages%rowtype;
  v_had boolean;
begin
  if v_me is null then
    raise exception 'Only students can react.';
  end if;

  select * into v_msg from public.space_messages where id = p_message;
  if not found or v_msg.deleted_at is not null then
    raise exception 'That message is gone.';
  end if;
  if not public.cp_can_read_room(v_msg.room_id) then
    raise exception 'You are not in that room.';
  end if;
  -- Reacting is not posting: a muted student may still react. The mute is
  -- about what they SAY. But a closed Space is closed.
  if public.cp_space_state() <> 'open' then
    raise exception 'Student Space is not open right now.';
  end if;

  select exists (
    select 1 from public.space_message_reactions
     where message_id = p_message and student_id = v_me and code = p_code
  ) into v_had;

  if v_had then
    delete from public.space_message_reactions
     where message_id = p_message and student_id = v_me and code = p_code;
  else
    insert into public.space_message_reactions (message_id, room_id, student_id, code)
         values (p_message, v_msg.room_id, v_me, p_code)
    on conflict do nothing;
  end if;

  return not v_had;
end;
$$;

grant execute on function public.react_to_message(uuid, text) to authenticated;

-- Soft delete = the tombstone. The row stays so a reply to it still reads.
drop function if exists public.delete_my_message(uuid);
create function public.delete_my_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := public.cp_my_student_id();
  v_msg public.space_messages%rowtype;
begin
  select * into v_msg from public.space_messages where id = p_id;
  if not found then
    return;
  end if;
  if not public.is_instructor() and v_msg.author_student_id is distinct from v_me then
    raise exception 'You can only delete your own messages.';
  end if;

  update public.space_messages set deleted_at = now()
   where id = p_id and deleted_at is null;
end;
$$;

grant execute on function public.delete_my_message(uuid) to authenticated;

-- Open (or reopen) a DM. `p_target` null means "message the instructor".
drop function if exists public.start_dm(uuid);
create function public.start_dm(p_target uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := public.cp_my_student_id();
  v_instr boolean := public.is_instructor();
  v_key   text;
  v_id    uuid;
begin
  if v_instr then
    if p_target is null then
      raise exception 'Pick a student to message.';
    end if;
    v_key := public.cp_dm_key(null, p_target);
  else
    if v_me is null then
      raise exception 'Only students can start a DM.';
    end if;
    if public.cp_space_state() <> 'open' then
      raise exception 'Student Space is not open right now.';
    end if;
    if p_target = v_me then
      raise exception 'Pick someone else.';
    end if;
    v_key := public.cp_dm_key(v_me, p_target);
  end if;

  if p_target is not null and not exists (
    select 1 from public.students stu
      join public.sections sec on sec.id = stu.section_id
     where stu.id = p_target and stu.archived_at is null
       and (sec.space_enabled or v_instr)
  ) then
    raise exception 'That person is not in Student Space.';
  end if;

  select id into v_id from public.space_rooms where kind = 'dm' and dm_key = v_key;
  if v_id is not null then
    return v_id;                         -- idempotent: one room per pair, ever
  end if;

  insert into public.space_rooms (kind, dm_key) values ('dm', v_key)
    returning id into v_id;

  insert into public.space_room_members (room_id, student_id)
       values (v_id, case when v_instr then null else v_me end),
              (v_id, p_target)
  on conflict do nothing;

  return v_id;
end;
$$;

grant execute on function public.start_dm(uuid) to authenticated;

drop function if exists public.set_room_muted(uuid, boolean);
create function public.set_room_muted(p_room uuid, p_muted boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.cp_my_student_id();
begin
  if v_me is null then
    raise exception 'Only students can mute a room.';
  end if;
  if not public.cp_can_read_room(p_room) then
    raise exception 'You are not in that room.';
  end if;

  insert into public.space_room_prefs (student_id, room_id, muted)
       values (v_me, p_room, p_muted)
  on conflict (student_id, room_id) do update set muted = excluded.muted;

  return p_muted;
end;
$$;

grant execute on function public.set_room_muted(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Instructor controls
-- ----------------------------------------------------------------------------
drop function if exists public.set_room_controls(uuid, int, boolean);
create function public.set_room_controls(
  p_room     uuid,
  p_slow     int     default null,
  p_announce boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can change that.';
  end if;
  if p_slow is not null and (p_slow < 0 or p_slow > 300) then
    raise exception 'Slow mode is 0 to 300 seconds.';
  end if;

  update public.space_rooms
     set slow_mode_seconds = coalesce(p_slow, slow_mode_seconds),
         announce_only     = coalesce(p_announce, announce_only)
   where id = p_room;
end;
$$;

grant execute on function public.set_room_controls(uuid, int, boolean) to authenticated;

drop function if exists public.pin_room_message(uuid, uuid);
create function public.pin_room_message(p_room uuid, p_message uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can pin a message.';
  end if;
  if p_message is not null and not exists (
    select 1 from public.space_messages where id = p_message and room_id = p_room
  ) then
    raise exception 'That message is not in this room.';
  end if;

  update public.space_rooms set pinned_message_id = p_message where id = p_room;
end;
$$;

grant execute on function public.pin_room_message(uuid, uuid) to authenticated;

/*
 * BREAK-GLASS. The only way the instructor reads a DM they are not in.
 *
 * The audit row is written BEFORE the messages are returned, so a read that
 * errors halfway still leaves a trace. `cp_can_read_room()` deliberately does
 * not grant this — if it did, this function would be decorative and the promise
 * shown to students would be false.
 */
drop function if exists public.read_dm_thread(uuid, text);
create function public.read_dm_thread(p_room uuid, p_reason text default null)
returns table (
  id           uuid,
  display_name text,
  body         text,
  deleted_at   timestamptz,
  created_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.space_rooms%rowtype;
  v_who  text;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can do that.';
  end if;

  select * into v_room from public.space_rooms where id = p_room;
  if not found or v_room.kind <> 'dm' then
    raise exception 'That is not a direct message thread.';
  end if;

  select string_agg(coalesce(stu.display_name, 'Instructor'), ' & ') into v_who
    from public.space_room_members m
    left join public.students stu on stu.id = m.student_id
   where m.room_id = p_room;

  insert into public.audit_log (actor, action, table_name, row_id, summary, row_data)
       values (auth.uid(), 'space_break_glass', 'space_rooms', p_room,
               'Read the DM between ' || coalesce(v_who, 'unknown'),
               jsonb_build_object('room', p_room, 'reason', p_reason));

  return query
    select m.id, m.display_name,
           case when m.deleted_at is not null then null else m.body end,
           m.deleted_at, m.created_at
      from public.space_messages m
     where m.room_id = p_room
     order by m.created_at asc
     limit 500;
end;
$$;

grant execute on function public.read_dm_thread(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 9. Retention — 90 days
-- ----------------------------------------------------------------------------
create or replace function public.cp_purge_space_messages()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.space_messages where created_at < now() - interval '90 days';
$$;

revoke execute on function public.cp_purge_space_messages() from public, anon, authenticated;

select cron.schedule(
  'classpoint-space-messages-purge', '25 3 * * *',
  $cron$select public.cp_purge_space_messages();$cron$
);

-- ----------------------------------------------------------------------------
-- 10. Realtime
--
--     TWO tables here, unlike the Lounge's one — and the trade genuinely
--     differs. A chat subscription is page-scoped to ONE room and filtered
--     `room_id=eq.<id>`, so the traffic is bounded by that room. Denormalising
--     six reaction counters onto every message to avoid the second table would
--     be uglier than the subscription is expensive, and `room_id` was added to
--     the reactions table specifically so this filter is possible.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'space_messages'
  ) then
    alter publication supabase_realtime add table public.space_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'space_message_reactions'
  ) then
    alter publication supabase_realtime add table public.space_message_reactions;
  end if;
end
$$;

-- ============================================================================
-- Verify (run twice — this file is idempotent):
--
--   -- 1. Rooms provision on demand, and only once:
--   --   select * from public.list_my_rooms();     -- from the APP, as a student
--   --   select * from public.list_my_rooms();     -- again
--   select kind, count(*) from public.space_rooms group by kind;
--   -- expect exactly ONE 'global', and one 'section' per enabled section.
--
--   -- 2. THE DM PROMISE. As the INSTRUCTOR, with a student↔student DM open:
--   select count(*) from public.space_messages
--    where room_id = '<their-dm-room>';
--   -- expect 0. RLS gives the instructor NOTHING in a DM they are not in.
--   -- If this returns rows, cp_can_read_room has been widened and the whole
--   -- privacy promise is void.
--
--   -- 3. Break-glass works AND leaves a trace:
--   --   select * from public.read_dm_thread('<their-dm-room>', 'testing');
--   select action, summary from public.audit_log
--    where action = 'space_break_glass' order by at desc limit 1;
--
--   -- 4. One room per pair, however hard you try:
--   --   select public.start_dm('<student-b>');    -- as student A
--   --   select public.start_dm('<student-a>');    -- as student B
--   select count(*) from public.space_rooms where kind = 'dm';   -- expect 1
--
--   -- 5. The timeout exception. Mute a student (0041), then as them:
--   --   select public.cp_room_post_block('<section-room>');
--   --   -- 'You are muted right now...'
--   --   select public.cp_room_post_block('<their-DM-with-instructor>');
--   --   -- NULL — they can still reach you. This is the one that matters.
--
--   -- 6. Slow mode actually blocks:
--   --   select public.set_room_controls('<room>', 30, null);
--   --   -- as a student, send twice: the second raises 'Slow mode: wait Ns.'
--
--   -- 7. Announce-only:
--   --   select public.set_room_controls('<global>', null, true);
--   --   -- a student's send raises; the instructor's still works.
--
--   -- 8. Realtime is published for exactly the two tables:
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and tablename like 'space_%';
--   -- expect space_messages and space_message_reactions, nothing else.
-- ============================================================================
