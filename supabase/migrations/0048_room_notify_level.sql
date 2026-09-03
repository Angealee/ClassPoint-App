-- ============================================================================
-- ClassPoint · 0048 · Notification level per room
-- Run after 0046. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   `space_room_prefs.muted` was a boolean: notified, or not. It becomes three
--   levels, because "not muted" was doing two jobs badly —
--
--     all       every message in this room
--     mentions  mentions, replies to you, and DMs   ← the default, and what
--               every room does TODAY
--     none      nothing
--
-- ── `muted` IS NOW GENERATED, WHICH IS THE WHOLE TRICK ──────────────────────
--   `list_my_rooms()` (0043) returns `coalesce(pref.muted, false)`. Growing its
--   return type would mean a drop-first + re-grant of a 60-line function for a
--   column the room list already has. So `muted` stays — as
--   `generated always as (level = 'none') stored`. One writer (`level`), one
--   derived reader, and `list_my_rooms` needs no change at all.
--
-- ── OWNERSHIP MOVES ─────────────────────────────────────────────────────────
--   `set_room_muted` 0043 → 0048  (same signature; now a delegate)
--   `send_message`   0043 → 0048  (body carried forward VERBATIM except the
--                                  fan-out, which gains the 'all' audience)
--
--   The `send_message` body below was copied programmatically out of 0043, not
--   retyped. A 137-line copy-forward is exactly where a transcription error
--   lives, and this file is the fourth ownership move that function's
--   neighbourhood has seen.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The column, and the swap of `muted` to a generated one
--
--    Guarded on `is_generated`, so a second run of this file does nothing.
-- ----------------------------------------------------------------------------
alter table public.space_room_prefs
  add column if not exists level text not null default 'mentions';

do $do$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.space_room_prefs'::regclass
       and conname  = 'space_room_prefs_level_check'
  ) then
    alter table public.space_room_prefs
      add constraint space_room_prefs_level_check
      check (level in ('all', 'mentions', 'none'));
  end if;
end
$do$;

do $do$
begin
  -- Only on the first run: `muted` is still an ordinary column.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'space_room_prefs'
       and column_name  = 'muted'
       and is_generated = 'NEVER'
  ) then
    -- Carry the old meaning across BEFORE dropping it.
    update public.space_room_prefs
       set level = case when muted then 'none' else 'mentions' end;

    alter table public.space_room_prefs drop column muted;
    alter table public.space_room_prefs
      add column muted boolean generated always as (level = 'none') stored;
  end if;
end
$do$;

-- ----------------------------------------------------------------------------
-- 2. Setting it
-- ----------------------------------------------------------------------------
drop function if exists public.set_room_level(uuid, text);
create function public.set_room_level(p_room uuid, p_level text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.cp_my_student_id();
begin
  if v_me is null then
    raise exception 'Only a student has per-room notification settings.';
  end if;
  if p_level not in ('all', 'mentions', 'none') then
    raise exception 'Unknown notification level: %', p_level;
  end if;
  if not public.cp_can_read_room(p_room) then
    raise exception 'You are not in that room.';
  end if;

  insert into public.space_room_prefs (student_id, room_id, level)
  values (v_me, p_room, p_level)
  on conflict (student_id, room_id) do update set level = excluded.level;

  return p_level;
end;
$$;

grant execute on function public.set_room_level(uuid, text) to authenticated;

-- Ownership move from 0043: same signature, so nothing that calls it changes.
-- Kept as a DELEGATE rather than deleted — two ways to write this setting is
-- how `muted` and `level` would drift apart, which is the thing the generated
-- column exists to prevent.
drop function if exists public.set_room_muted(uuid, boolean);
create function public.set_room_muted(p_room uuid, p_muted boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.set_room_level(p_room, case when p_muted then 'none' else 'mentions' end);
  return p_muted;
end;
$$;

grant execute on function public.set_room_muted(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Ownership move: send_message 0043 → 0048
--
--    Body carried forward verbatim; only the fan-out at the end differs.
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
  -- Two audiences now, and they get DIFFERENT copy:
  --
  --   'direct' — mentioned, replied to, or in this DM. Notified unless the
  --              room is set to 'none'. This is 0043's behaviour, unchanged.
  --   'all'    — asked for every message in this room (0048). Never the
  --              sender, and never someone already a 'direct' target, or one
  --              message would queue two rows for the same person.
  --
  -- Levels come from `space_room_prefs.level`; `muted` is now GENERATED from
  -- it, so there is exactly one writer and the two cannot disagree.
  --
  -- ⚠ `everything` re-derives membership from the ROOM rather than calling
  -- cp_can_read_room(): that function answers for the CALLER, and here the
  -- question is whether the TARGET still belongs in this room. A student who
  -- set 'all' and then changed section must not keep getting the old room.
  with lvl as (
    select pref.student_id, pref.level
      from public.space_room_prefs pref
     where pref.room_id = p_room
  ), direct as (
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
       and coalesce(
             (select level from lvl where lvl.student_id = t.student_id), 'mentions'
           ) <> 'none'
  ), everything as (
    -- Driven by the prefs table, so this reads the handful of people who opted
    -- in rather than scanning the roster.
    select lvl.student_id
      from lvl
      join public.students s on s.id = lvl.student_id and s.archived_at is null
     where lvl.level = 'all'
       and lvl.student_id is distinct from v_me
       and lvl.student_id not in (select student_id from direct)
       and (
         v_room.kind = 'global'
         or (v_room.kind = 'section' and s.section_id = v_room.section_id)
       )
  ), targets as (
    select student_id, 'direct'::text as reason from direct
    union all
    select student_id, 'all'::text    as reason from everything
  ), inserted as (
    insert into public.notifications (student_id, type, title, body, url)
    select t.student_id,
           case
             when v_room.kind = 'dm' then 'space_dm'
             when t.reason = 'all'   then 'space_message'
             else 'space_mention'
           end,
           case
             when v_room.kind = 'dm' then v_name
             when t.reason = 'all'   then v_name || ' sent a message'
             else v_name || ' mentioned you'
           end,
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

-- ============================================================================
-- VERIFY
--
--   1. select level, muted from public.space_room_prefs limit 5;
--      `muted` is now derived: true exactly when level = 'none'. Try to write
--      it directly and Postgres refuses — that is the point.
--
--   2. As a student: select public.set_room_level('<room>', 'all');
--      Then have someone else post a plain message in that room (no mention).
--      A `notifications` row appears for you, type 'space_message', titled
--      "<name> sent a message".
--
--   3. THE ONE THAT WOULD DOUBLE-NOTIFY: with level 'all', have them post a
--      message that ALSO @mentions you. Exactly ONE notification row, typed
--      'space_mention' — not two.
--
--   4. set_room_level('<room>', 'none') — a mention no longer notifies you.
--      set_room_muted('<room>', false) — reads back as 'mentions'.
--
--   5. Re-run this whole file. The `do` blocks no-op, nothing errors, and
--      `muted` is still generated (not dropped and re-added).
-- ============================================================================
