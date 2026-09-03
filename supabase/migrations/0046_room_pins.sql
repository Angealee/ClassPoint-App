-- ============================================================================
-- ClassPoint · 0046 · Several pinned messages per room
-- Run after 0045. Safe to re-run (idempotent).
--
-- WHAT THIS IS
--   0043 gave every room ONE pin: `space_rooms.pinned_message_id`. A beta room
--   wants a rules post AND a schedule AND a link at the same time, so pins move
--   to their own table, capped at 10 per room.
--
-- ── ONE WRITER, SO THE TWO CANNOT DRIFT ─────────────────────────────────────
--   `space_rooms.pinned_message_id` is NOT abandoned here, and it is not a
--   second source of truth either. `list_my_rooms()` already returns it and
--   changing that function's return type would mean a drop-first + re-grant
--   dance for a column nothing renders. So the pin RPCs below keep it pointing
--   at the MOST RECENT pin (null when the last one is removed), and they are
--   the only things that write it. Read the LIST from `get_room_pins()`; treat
--   the column as a denormalised "newest pin" that rides along for free.
--
--   Existing single pins are backfilled into the table, so nothing that was
--   pinned before this migration is lost.
--
-- ── WHO CAN PIN ─────────────────────────────────────────────────────────────
--   The instructor only, exactly as 0043's `pin_room_message` already required.
--   Students read the list; they do not curate it. `pin_room_message` is
--   REPLACED here (an ownership move) rather than left beside the new
--   functions — two ways to pin is how the list and the column drift apart.
--
--   No `audit_log` row and therefore NO widening of `audit_log_action_check`:
--   pinning is not destructive and is visible to the whole room by definition.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   None.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The table
-- ----------------------------------------------------------------------------
create table if not exists public.space_pins (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.space_rooms(id)    on delete cascade,
  message_id uuid not null references public.space_messages(id) on delete cascade,
  -- Null = the instructor, matching 0020's convention used throughout Space.
  pinned_by  uuid references public.students(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (room_id, message_id)
);

create index if not exists space_pins_room_idx
  on public.space_pins (room_id, created_at desc);

-- Backfill whatever 0043's single slot was holding. `on conflict do nothing`
-- makes the whole file re-runnable.
insert into public.space_pins (room_id, message_id, created_at)
select r.id, r.pinned_message_id, now()
  from public.space_rooms r
 where r.pinned_message_id is not null
   and exists (
     select 1 from public.space_messages m
      where m.id = r.pinned_message_id and m.room_id = r.id
   )
on conflict (room_id, message_id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. RLS — SELECT only, the 0043 shape. Every write goes through an RPC.
-- ----------------------------------------------------------------------------
alter table public.space_pins enable row level security;

drop policy if exists space_pins_select on public.space_pins;
create policy space_pins_select on public.space_pins
  for select to authenticated using (public.cp_can_read_room(room_id));

grant select on public.space_pins to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Reading the list
--
--    A hidden or deleted message keeps its ROW (so the instructor can see what
--    is pinned) but loses its BODY for everyone else — the same rule all four
--    Lounge feed functions follow. Returning the text and trusting the client
--    not to draw it would make moderation a rendering preference.
-- ----------------------------------------------------------------------------
drop function if exists public.get_room_pins(uuid);
create function public.get_room_pins(p_room uuid)
returns table (
  message_id   uuid,
  author_id    uuid,
  display_name text,
  avatar_url   text,
  body         text,
  created_at   timestamptz,
  pinned_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.author_student_id,
    m.display_name,
    m.avatar_url,
    case
      when m.deleted_at is not null then null
      when m.hidden_at is not null and not public.is_instructor() then null
      else m.body
    end,
    m.created_at,
    p.created_at
  from public.space_pins p
  join public.space_messages m on m.id = p.message_id
 where p.room_id = p_room
   and public.cp_can_read_room(p_room)
 order by p.created_at desc;
$$;

grant execute on function public.get_room_pins(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Pinning and unpinning
--
--    The cap is enforced INSIDE the function, not by a constraint: a CHECK
--    cannot count sibling rows, and a trigger would raise a message the client
--    cannot phrase kindly. 10 is a scannable list, not a second feed.
-- ----------------------------------------------------------------------------
drop function if exists public.pin_message(uuid, uuid);
create function public.pin_message(p_room uuid, p_message uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can pin a message.';
  end if;

  if not exists (
    select 1 from public.space_messages
     where id = p_message and room_id = p_room and deleted_at is null
  ) then
    raise exception 'That message is not in this room.';
  end if;

  select count(*) into v_count from public.space_pins where room_id = p_room;
  if v_count >= 10 and not exists (
    select 1 from public.space_pins where room_id = p_room and message_id = p_message
  ) then
    raise exception 'This room already has 10 pinned messages. Unpin one first.';
  end if;

  insert into public.space_pins (room_id, message_id, pinned_by)
  values (p_room, p_message, public.cp_my_student_id())
  on conflict (room_id, message_id) do nothing;

  update public.space_rooms set pinned_message_id = p_message where id = p_room;
end;
$$;

grant execute on function public.pin_message(uuid, uuid) to authenticated;

drop function if exists public.unpin_message(uuid, uuid);
create function public.unpin_message(p_room uuid, p_message uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can unpin a message.';
  end if;

  delete from public.space_pins where room_id = p_room and message_id = p_message;

  -- Keep the denormalised column honest: it follows whatever is newest now,
  -- and goes null when the last pin is removed.
  update public.space_rooms r
     set pinned_message_id = (
       select p.message_id from public.space_pins p
        where p.room_id = r.id
        order by p.created_at desc
        limit 1
     )
   where r.id = p_room;
end;
$$;

grant execute on function public.unpin_message(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Ownership move: 0043's single-slot pin is REPLACED
--
--    Kept as a thin delegate rather than deleted, so anything still calling it
--    (a cached client bundle, say) writes to the same place instead of setting
--    a column nothing reads. `p_message => null` used to mean "unpin"; it now
--    clears every pin in the room, which is the closest honest translation.
-- ----------------------------------------------------------------------------
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

  if p_message is null then
    delete from public.space_pins where room_id = p_room;
    update public.space_rooms set pinned_message_id = null where id = p_room;
  else
    perform public.pin_message(p_room, p_message);
  end if;
end;
$$;

grant execute on function public.pin_room_message(uuid, uuid) to authenticated;

-- ============================================================================
-- VERIFY (run as the instructor, then as a student)
--
--   1. select public.pin_message('<room>', '<message>');
--      select * from public.get_room_pins('<room>');          -- 1 row
--
--   2. Pin the same message twice — still ONE row, no error.
--
--   3. Pin 11 different messages — the 11th raises, and the list stays at 10.
--
--   4. As a STUDENT in that room: select * from public.get_room_pins('<room>');
--      returns the same rows. As a student NOT in the room: 0 rows.
--
--   5. select public.unpin_message('<room>', '<message>');
--      space_rooms.pinned_message_id now points at the next-newest pin, or is
--      null when none are left.
--
--   6. Re-run this whole file. Nothing errors, nothing duplicates.
-- ============================================================================
