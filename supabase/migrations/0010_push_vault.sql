-- ============================================================================
-- ClassPoint · 0010 · Push config via Vault (replaces the app.settings GUCs)
-- Run after 0009. Safe to re-run.
--
-- WHY: Supabase's hosted `postgres` role can't run
--   `alter database postgres set app.settings.* = ...`  → ERROR 42501.
-- So migration 0008's GUC approach can't be configured. Instead we:
--   • hardcode the (public, non-secret) Edge Functions URL, and
--   • read the service-role key from Supabase Vault at trigger time.
--
-- ── ONE-TIME SETUP (run once, before this matters) ──────────────────────────
--   Store the service-role key in Vault under the name 'edge_service_key':
--
--     select vault.create_secret(
--       '<SERVICE_ROLE_KEY>',            -- Settings → API Keys → service_role
--       'edge_service_key',
--       'Bearer token the push triggers use to call send-push');
--
--   To rotate it later: delete the old secret, then create_secret again:
--     delete from vault.secrets where name = 'edge_service_key';
--
--   Both functions below degrade gracefully: if Vault isn't enabled or the
--   secret is missing, awarding points still works — only the push is skipped.
-- ============================================================================

-- Point events -> push --------------------------------------------------------
create or replace function public.cp_notify_point_event()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url       text := 'https://cxfxstazlwjijozkglgx.functions.supabase.co';
  v_key       text;
  v_new       integer;
  v_prev      integer;
  v_new_level integer;
  v_old_level integer;
begin
  -- Read the key from Vault; never let a config problem block the award.
  begin
    select decrypted_secret into v_key
      from vault.decrypted_secrets
     where name = 'edge_service_key'
     limit 1;
  exception when others then
    v_key := null;
  end;
  if v_key is null then
    return null; -- push not configured yet; in-app notifications still work
  end if;

  select coalesce(sum(points), 0) into v_new
    from public.point_events where student_id = NEW.student_id;
  v_prev      := v_new - NEW.points;
  v_new_level := public.cp_level(v_new);
  v_old_level := public.cp_level(v_prev);

  perform net.http_post(
    url     := v_url || '/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'type',       case when NEW.points >= 0 then 'point' else 'deduct' end,
      'student_id', NEW.student_id,
      'points',     NEW.points,
      'note',       NEW.note,
      'level',      case when v_new_level > v_old_level then v_new_level else null end
    )
  );
  return null;
end;
$$;

-- Twice-daily rank changes -> push -------------------------------------------
create or replace function public.refresh_leaderboard_snapshot_notify()
returns void
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url text := 'https://cxfxstazlwjijozkglgx.functions.supabase.co';
  v_key text;
  r     record;
begin
  create temp table _old_ranks on commit drop as
    select student_id, rank from public.leaderboard_snapshot;

  perform public.refresh_leaderboard_snapshot();

  begin
    select decrypted_secret into v_key
      from vault.decrypted_secrets
     where name = 'edge_service_key'
     limit 1;
  exception when others then
    v_key := null;
  end;
  if v_key is null then
    return; -- snapshot refreshed above; push just not sent
  end if;

  for r in
    select n.student_id, n.rank as new_rank, o.rank as old_rank
      from public.leaderboard_snapshot n
      join _old_ranks o on o.student_id = n.student_id
     where o.rank is distinct from n.rank
  loop
    perform net.http_post(
      url     := v_url || '/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'type', 'rank',
        'student_id', r.student_id,
        'rank', r.new_rank,
        'prev_rank', r.old_rank
      )
    );
  end loop;
end;
$$;
