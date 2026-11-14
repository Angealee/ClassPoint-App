-- ============================================================================
-- 0071 — The instructor's profile (2026-11-14)
-- ----------------------------------------------------------------------------
-- Decision (instructor): TWO IDENTITIES. "ClassPoint" is the official voice (logo as the
-- avatar; broadcasts, events and system posts), and the instructor is a person with a
-- profile of their own (name, title, short bio, photo) that students can tap wherever the
-- instructor speaks. The ClassPoint identity needs no storage (it is fixed in the client);
-- this file stores the PERSON.
--
-- Shape:
--   * four nullable columns on public.instructors (an allowlist keyed by email until now);
--   * get_instructor_profile()   - any signed-in user may READ the public four fields, and
--                                  nothing else on that row (the email never leaves);
--   * update_instructor_profile  - instructor-only write, validated on the server.
--
-- Both functions return jsonb on purpose. A RETURNS TABLE function turns every column name
-- into an OUT variable in scope, which is exactly how 0069 had to repair three functions
-- ("column reference is ambiguous"); a jsonb return has no OUT names to collide with.
--
-- The avatar needs NO storage change: the avatars bucket already lets a signed-in user write
-- inside their own uid folder (0007), and the instructor is a signed-in user.
--
-- ── ONE-TIME SETUP ── none. Paste the whole file, then paste it a second time to prove it
-- is idempotent, then run the VERIFY block at the foot.
-- ============================================================================

alter table public.instructors
  add column if not exists display_name text
    check (display_name is null or char_length(btrim(display_name)) between 2 and 40),
  add column if not exists title text
    check (title is null or char_length(btrim(title)) <= 40),
  add column if not exists bio text
    check (bio is null or char_length(bio) <= 160),
  add column if not exists avatar_url text
    check (avatar_url is null or char_length(avatar_url) <= 500);

-- ── get_instructor_profile ────────────────────────────────────────────────────
create or replace function public.get_instructor_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  -- One instructor today; if there were ever two, the one with a name set wins.
  select jsonb_build_object(
           'displayName', i.display_name,
           'title',       i.title,
           'bio',         i.bio,
           'avatarUrl',   i.avatar_url
         )
    into v
    from public.instructors i
   order by (i.display_name is null), i.email
   limit 1;
  return v;
end;
$$;

-- ── update_instructor_profile ─────────────────────────────────────────────────
create or replace function public.update_instructor_profile(
  p_display_name text,
  p_title        text,
  p_bio          text,
  p_avatar_url   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_name  text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_bio   text := nullif(btrim(coalesce(p_bio, '')), '');
  v_url   text := nullif(btrim(coalesce(p_avatar_url, '')), '');
  v       jsonb;
begin
  if not public.is_instructor() then
    raise exception 'Only the instructor can edit this profile.';
  end if;

  if v_name is not null and char_length(v_name) not between 2 and 40 then
    raise exception 'Your name needs 2 to 40 characters.';
  end if;
  if v_title is not null and char_length(v_title) > 40 then
    raise exception 'Your title can be up to 40 characters.';
  end if;
  if v_bio is not null and char_length(v_bio) > 160 then
    raise exception 'Your bio can be up to 160 characters.';
  end if;
  if v_url is not null and (char_length(v_url) > 500 or v_url !~* '^https?://') then
    raise exception 'That photo address is not valid.';
  end if;

  -- WHERE is present, so pg_safeupdate (the API roles) accepts it.
  update public.instructors i
     set display_name = v_name,
         title        = v_title,
         bio          = v_bio,
         avatar_url   = v_url
   where lower(i.email) = v_email;

  select jsonb_build_object(
           'displayName', i.display_name,
           'title',       i.title,
           'bio',         i.bio,
           'avatarUrl',   i.avatar_url
         )
    into v
    from public.instructors i
   where lower(i.email) = v_email;
  return v;
end;
$$;

-- Supabase's default privileges grant every new function to anon too (see 0067), so the
-- revoke is explicit rather than assumed.
revoke execute on function public.get_instructor_profile() from public, anon;
revoke execute on function public.update_instructor_profile(text, text, text, text) from public, anon;
grant  execute on function public.get_instructor_profile() to authenticated;
grant  execute on function public.update_instructor_profile(text, text, text, text) to authenticated;

-- ── VERIFY (run in the SQL editor after pasting, twice) ───────────────────────
-- 1. The four columns exist (expect 4 rows):
--      select column_name from information_schema.columns
--       where table_schema = 'public' and table_name = 'instructors'
--         and column_name in ('display_name', 'title', 'bio', 'avatar_url');
-- 2. Both functions exist and anon cannot run them (expect two rows, both false):
--      select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_can
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public'
--         and p.proname in ('get_instructor_profile', 'update_instructor_profile');
-- 3. In the app, signed in as the instructor, save a name on /teach/profile, then as a
--    student open the instructor from chat: the same name and photo appear. A student calling
--    update_instructor_profile must fail with "Only the instructor can edit this profile."
