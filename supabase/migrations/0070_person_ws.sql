-- ============================================================================
-- 0070 — Give a classmate a W (2026-11-14)
--
-- Paste AFTER 0042 (needs cp_lounge_author, students, the notification outbox
-- from 0017). Independent of 0043–0069. Idempotent — paste it twice.
--
-- Decisions (instructor):
--   · one W per classmate per DAY (Manila date); you can take it back that day
--   · the COUNT is public, WHO gave it is visible only to the receiver
--   · receiving one pushes a notification (type 'space_person_w')
--   · social only — nothing here touches point_events or the leaderboard
--
-- SHAPE
--   person_ws (giver_id, receiver_id, given_on) is the primary key, so a day can
--   hold one row per pair. Taking a W back sets revoked_at instead of deleting
--   the row: a re-give the same day then reuses the row and does NOT push a
--   second time — otherwise tapping W on/off would spam someone's phone.
--   A W "counts" while revoked_at is null.
--
-- ACCESS
--   The table has RLS on and NO policy and NO grant for the API roles: every
--   read and write goes through the three definer functions below, which is
--   what keeps "who gave it" private to the receiver.
-- ============================================================================

create table if not exists public.person_ws (
  giver_id    uuid not null references public.students(id) on delete cascade,
  receiver_id uuid not null references public.students(id) on delete cascade,
  given_on    date not null default ((now() at time zone 'Asia/Manila')::date),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  primary key (giver_id, receiver_id, given_on),
  constraint person_ws_not_self check (giver_id <> receiver_id)
);
create index if not exists person_ws_receiver_idx
  on public.person_ws (receiver_id) where revoked_at is null;

alter table public.person_ws enable row level security;
revoke all on public.person_ws from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- give_person_w(target) — toggles TODAY's W from you to them.
-- ----------------------------------------------------------------------------
drop function if exists public.give_person_w(uuid);
create function public.give_person_w(p_target uuid)
returns table (given_today boolean, total int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_target  public.students%rowtype;
  v_today   date := (now() at time zone 'Asia/Manila')::date;
  v_row     public.person_ws%rowtype;
  v_given   boolean;
begin
  -- Same gate as posting: Space open, not paused, not timed out.
  v_student := public.cp_lounge_author();

  select * into v_target from public.students s where s.id = p_target and s.archived_at is null;
  if not found then
    raise exception 'That classmate is not on the roster.';
  end if;
  if v_target.id = v_student.id then
    raise exception 'Give a W to someone else.';
  end if;

  select * into v_row
    from public.person_ws w
   where w.giver_id = v_student.id and w.receiver_id = v_target.id and w.given_on = v_today
   for update;

  if not found then
    insert into public.person_ws (giver_id, receiver_id, given_on)
         values (v_student.id, v_target.id, v_today);
    v_given := true;
    -- First W of the day from this person → one push. Never on a re-give.
    perform public.cp_push_dispatch(array[
      public.cp_queue_notification(
        v_target.id, 'space_person_w',
        v_student.display_name || ' gave you a W',
        'Someone in Space thinks you''re doing great.',
        '/app/space/people'
      )
    ]);
  elsif v_row.revoked_at is null then
    update public.person_ws w set revoked_at = now()
     where w.giver_id = v_student.id and w.receiver_id = v_target.id and w.given_on = v_today;
    v_given := false;
  else
    update public.person_ws w set revoked_at = null
     where w.giver_id = v_student.id and w.receiver_id = v_target.id and w.given_on = v_today;
    v_given := true;
  end if;

  return query
    select v_given,
           (select count(*)::int from public.person_ws w2
             where w2.receiver_id = v_target.id and w2.revoked_at is null);
end;
$$;

revoke execute on function public.give_person_w(uuid) from public, anon;
grant  execute on function public.give_person_w(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- get_people_ws() — per person in Space: their public count, and whether YOU
-- gave them a W today. Never says who else did.
-- ----------------------------------------------------------------------------
drop function if exists public.get_people_ws();
create function public.get_people_ws()
returns table (student_id uuid, total int, i_gave_today boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me    uuid := public.cp_my_student_id();
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if not public.is_instructor() and public.cp_space_state() <> 'open' then
    raise exception 'Student Space is not open right now.';
  end if;

  return query
    select w.receiver_id,
           count(*)::int,
           bool_or(w.giver_id = v_me and w.given_on = v_today)
      from public.person_ws w
     where w.revoked_at is null
     group by w.receiver_id;
end;
$$;

revoke execute on function public.get_people_ws() from public, anon;
grant  execute on function public.get_people_ws() to authenticated;

-- ----------------------------------------------------------------------------
-- list_my_person_ws() — the receiver's own list of who gave them a W.
-- ----------------------------------------------------------------------------
drop function if exists public.list_my_person_ws();
create function public.list_my_person_ws()
returns table (student_id uuid, display_name text, avatar_url text, given_on date)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := public.cp_my_student_id();
begin
  if v_me is null then
    return;
  end if;
  return query
    select s.id, s.display_name, s.avatar_url, w.given_on
      from public.person_ws w
      join public.students s on s.id = w.giver_id
     where w.receiver_id = v_me and w.revoked_at is null
     order by w.given_on desc, w.created_at desc
     limit 200;
end;
$$;

revoke execute on function public.list_my_person_ws() from public, anon;
grant  execute on function public.list_my_person_ws() to authenticated;

-- ============================================================================
-- VERIFY (SQL editor). Every row should read `true`.
-- ============================================================================
-- select 'table locked to API roles' as check,
--        not has_table_privilege('authenticated', 'public.person_ws', 'select')
-- union all
-- select 'give_person_w callable', has_function_privilege('authenticated', 'public.give_person_w(uuid)', 'execute')
-- union all
-- select 'anon cannot', not has_function_privilege('anon', 'public.give_person_w(uuid)', 'execute');
-- ============================================================================
