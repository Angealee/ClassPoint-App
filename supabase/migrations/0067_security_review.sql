-- ============================================================================
-- 0067 — Security review fixes (2026-11-11)
--
-- Paste AFTER every earlier file you have applied. Depends only on objects that
-- exist since 0045 (lounge_events) and 0023 (students.archived_at); it does not
-- care whether 0059 was applied. Idempotent — paste it twice.
--
-- ── ONE-TIME SETUP (dashboard, not SQL) ─────────────────────────────────────
--   Authentication → Sign In / Providers → Email → turn OFF
--   "Allow new users to sign up".
--   A live probe on 2026-11-11 read `disable_signup: false` from
--   /auth/v1/settings. With signup open, ANYONE with a real email address can
--   create an account, become `authenticated`, and read every policy written
--   `to authenticated using (true)` — the whole student roster (full names,
--   sections, points), sections, semesters, the leaderboard. Students are not
--   affected by turning it off: the claim-token edge function creates their
--   accounts through the admin API, which ignores this switch.
--
-- ── WHAT THIS FILE FIXES ────────────────────────────────────────────────────
--   1. CRITICAL — a student could rewrite their own `semester_points`
--      (and `archived_at`) from the browser console.
--      `cp_guard_student_update` was a DENYLIST written in 0009, and the two
--      columns added later (0023 archived_at, 0029 semester_points) were never
--      added to it. `semester_points` IS the spendable balance, the level, the
--      rank, and — through request_grade_boost — a route to raising a GRADE:
--        supabase.from('students').update({ semester_points: 9999 })
--          .eq('user_id', <own uid>)
--      then file points-assist requests the RPC validates against that number.
--      `archived_at = null` let an archived student un-archive themselves.
--      Rewritten as an ALLOWLIST: a student may change only the profile fields
--      the app actually writes, and any column added in future is denied by
--      default. Lengths the client already enforces (display name 2–40, bio
--      160, interests 120, ≤3 showcase photos) are now enforced here too, and
--      photo URLs must point into the student's OWN folder of the avatars
--      bucket (otherwise a third-party URL is a tracking pixel that logs the
--      IP of everyone — the instructor included — who opens that profile).
--      The 0056 event-award GUC bypass and the instructor / service-role
--      bypass are carried forward unchanged.
--
--   2. HIGH — Random Event answer keys were readable before the event closed.
--      0045 says "the events table is not granted at all", but on Supabase the
--      schema's DEFAULT PRIVILEGES grant every new table to anon/authenticated
--      (confirmed live: an anon select on lounge_events returns 200, not a
--      permission error). The select policy then lets any student read
--      `answer_key` while the Space is open. Column-level grant: everything
--      except answer_key. Nothing in the client selects this table directly
--      (every read is a definer RPC), and it is not in the realtime
--      publication, so nothing else changes.
--
--   3. HIGH — anonymous callers could execute SECURITY DEFINER functions.
--      Postgres grants EXECUTE to PUBLIC on every new function and Supabase
--      additionally grants it to anon. Confirmed live with only the public anon
--      key: get_semester_leaderboard, public_point_events, get_achievement_rarity
--      and cp_active_semester_id all answer 200 — i.e. anyone on the internet
--      can fetch the active semester id and then the full board (names +
--      points), and could call refresh_leaderboard_snapshot() at will, which
--      defeats the twice-daily freeze and fires the Class Pulse podium trigger.
--      Every non-extension function in `public` loses PUBLIC/anon EXECUTE,
--      EXCEPT the two that are genuinely called without a session:
--        cp_level (0003)             — harmless arithmetic
--        replace_push_subscription   — called by the service worker on
--                                      pushsubscriptionchange, which has no JWT
--      Authenticated access is PRESERVED exactly: before revoking PUBLIC, any
--      function `authenticated` could execute gets an explicit grant, so no
--      screen loses an RPC. Then two internals lose authenticated too:
--        refresh_leaderboard_snapshot() — only pg_cron and definer RPCs call it
--        cp_achievement_metrics(uuid)   — only definer RPCs call it; direct
--                                         calls read any student's metrics
--      Default privileges are changed so FUTURE functions are not anon-callable.
--
-- NOT fixed here (see the security review write-up): hidden lounge post /
-- message bodies are still readable by a direct table select (the masking is
-- only in the feed RPCs), and the offline-scan 48h window.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. cp_guard_student_update  0056/0059 → 0067  (denylist → allowlist)
-- ----------------------------------------------------------------------------
create or replace function public.cp_guard_student_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The ONLY columns a student may change on their own row. Everything else —
  -- including any column added after this file — is refused.
  c_allowed constant text[] := array[
    'display_name', 'bio', 'interests', 'avatar_url', 'banner_urls',
    'header_url', 'header_pos', 'display_title', 'pinned_achievements'
  ];
  -- Public URL prefix of the student's own folder in the avatars bucket.
  -- Hard-coded to this project's origin (supabase/config.toml project_id). If a
  -- custom domain is ever put in front of Storage, update it here.
  c_bucket constant text :=
    'https://cxfxstazlwjijozkglgx.supabase.co/storage/v1/object/public/avatars/';
  v_prefix text;
  v_url    text;
begin
  -- 0056: a student's own event check-in raises this transaction-local flag so
  -- cp_recompute_points may write lifetime/semester points through the guard.
  -- PostgREST does not expose set_config, so a client cannot raise it.
  if current_setting('cp.event_award', true) = 'on' then
    return NEW;
  end if;
  -- Instructor edits anything; service role / cron (auth.uid() is null) too.
  if public.is_instructor() or auth.uid() is null then
    return NEW;
  end if;

  if OLD.archived_at is not null then
    raise exception 'This account has been archived — talk to your instructor.';
  end if;

  if (to_jsonb(NEW) - c_allowed) is distinct from (to_jsonb(OLD) - c_allowed) then
    raise exception 'You can only update your photo, bio and interests.';
  end if;

  if NEW.display_name is distinct from OLD.display_name
     and char_length(btrim(coalesce(NEW.display_name, ''))) not between 2 and 40 then
    raise exception 'Display name must be 2–40 characters.';
  end if;
  if NEW.bio is distinct from OLD.bio and char_length(coalesce(NEW.bio, '')) > 160 then
    raise exception 'Keep your bio under 160 characters.';
  end if;
  if NEW.interests is distinct from OLD.interests
     and char_length(coalesce(NEW.interests, '')) > 120 then
    raise exception 'Keep your interests under 120 characters.';
  end if;

  v_prefix := c_bucket || auth.uid()::text || '/';

  if NEW.avatar_url is distinct from OLD.avatar_url and NEW.avatar_url is not null
     and left(NEW.avatar_url, char_length(v_prefix)) <> v_prefix then
    raise exception 'Photos must be uploaded through the app.';
  end if;
  if NEW.header_url is distinct from OLD.header_url and NEW.header_url is not null
     and left(NEW.header_url, char_length(v_prefix)) <> v_prefix then
    raise exception 'Photos must be uploaded through the app.';
  end if;
  if NEW.banner_urls is distinct from OLD.banner_urls and NEW.banner_urls is not null then
    if coalesce(array_length(NEW.banner_urls, 1), 0) > 3 then
      raise exception 'You can show at most three photos.';
    end if;
    foreach v_url in array NEW.banner_urls loop
      if v_url is null or left(v_url, char_length(v_prefix)) <> v_prefix then
        raise exception 'Photos must be uploaded through the app.';
      end if;
    end loop;
  end if;

  return NEW;
end;
$$;

-- The trigger itself (trg_guard_student_update, 0009) already points at this
-- function by name; create or replace swaps the body under it.


-- ----------------------------------------------------------------------------
-- 2. lounge_events.answer_key — no column grant for API roles
-- ----------------------------------------------------------------------------
revoke select on public.lounge_events from anon, authenticated;
grant select (id, semester_id, question, points, winner_cap, closes_at,
              status, closed_at, created_at)
  on public.lounge_events to authenticated;


-- ----------------------------------------------------------------------------
-- 3. Function EXECUTE: nothing anon-callable except the two that must be
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid, p.oid::regprocedure as sig, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       -- Leave functions that belong to an installed extension alone.
       and not exists (select 1 from pg_depend d
                        where d.objid = p.oid and d.deptype = 'e')
  loop
    -- Preserve what authenticated / service_role can do today, explicitly,
    -- before PUBLIC (which they may have been inheriting through) goes.
    if has_function_privilege('authenticated', r.oid, 'execute') then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
    if has_function_privilege('service_role', r.oid, 'execute') then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;

    if r.proname not in ('cp_level', 'replace_push_subscription') then
      execute format('revoke execute on function %s from public, anon', r.sig);
    end if;
  end loop;
end;
$$;

revoke execute on function public.refresh_leaderboard_snapshot() from public, anon, authenticated;
revoke execute on function public.cp_achievement_metrics(uuid)  from public, anon, authenticated;

-- Future functions: no implicit PUBLIC execute, and no Supabase anon grant.
-- (Functions still get `authenticated` through Supabase's own schema default.)
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;


-- ============================================================================
-- VERIFY (SQL editor). Every row should read `true`.
-- ============================================================================
-- select 'guard is allowlist' as check,
--        pg_get_functiondef('public.cp_guard_student_update'::regproc) like '%c_allowed%'
-- union all
-- select 'anon cannot run leaderboard',
--        not has_function_privilege('anon', 'public.get_semester_leaderboard(uuid)', 'execute')
-- union all
-- select 'authenticated still can',
--        has_function_privilege('authenticated', 'public.get_semester_leaderboard(uuid)', 'execute')
-- union all
-- select 'nobody refreshes the board by hand',
--        not has_function_privilege('authenticated', 'public.refresh_leaderboard_snapshot()', 'execute')
-- union all
-- select 'answer_key hidden',
--        not has_column_privilege('authenticated', 'public.lounge_events', 'answer_key', 'select')
-- union all
-- select 'question still readable',
--        has_column_privilege('authenticated', 'public.lounge_events', 'question', 'select')
-- union all
-- select 'service worker path kept',
--        has_function_privilege('anon', 'public.replace_push_subscription(text,text,text,text)', 'execute');
--
-- Then, as a STUDENT in the browser console on the live app (expect an error):
--   await supabase.from('students').update({ semester_points: 9999 }).eq('user_id', (await supabase.auth.getUser()).data.user.id)
--   → "You can only update your photo, bio and interests."
-- And editing your bio / photo in Profile must still save.
-- ============================================================================
