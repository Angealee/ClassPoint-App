-- ============================================================================
-- ClassPoint · 0026 · Security hardening (token entropy + auth audit trail)
-- Run after 0025. Safe to re-run.
--
-- WHY: the claim / reset-PIN endpoints are the only unauthenticated surface in
-- the app (JWT verification is off by design — a student claiming or resetting
-- is not logged in yet). Three gaps closed here:
--
--   1. Token entropy. `cp_generate_token()` truncated to 8 hex chars = 32 bits.
--      Now the full 8 random bytes = 16 hex chars = 64 bits. EXISTING tokens are
--      left untouched: lookup is by value, so already-printed slips keep working.
--      Only students created from now on get the longer token.
--   2. No rate limiting. `auth_events` below is both the audit trail AND the
--      counter the edge functions check before touching a token (30 failures per
--      IP per 15 minutes — see the note on classroom NAT).
--   3. No trail. Every claim / reset attempt is now recorded, so a brute-force
--      attempt is visible after the fact instead of invisible.
--
-- NOT covered on purpose: failed password sign-ins. Those go straight to GoTrue
-- and never reach our code, so there is nothing server-side to log. A
-- client-callable "log a failed login" RPC would be spammable and untrustworthy.
-- The client-side lockout (src/lib/useLockout.ts, now wired into the student
-- sign-in too) is the compensating control there.
--
-- ── ONE-TIME SETUP ──────────────────────────────────────────────────────────
--   a) Set the allowed browser origins for the two public functions, so a
--      random website can't POST to them from a student's browser. Supabase
--      dashboard → Edge Functions → Secrets:
--
--        ALLOWED_ORIGINS = https://ccs-classpoint.vercel.app,http://localhost:5173
--
--      Comma-separated, no trailing slash. Put YOUR REAL DOMAIN here — the
--      angle-bracket form below is documentation, never a value to paste:
--
--        ✗ https://<your-vercel-domain>     ← this exact string was saved once,
--                                              and it took claim + PIN reset
--                                              DOWN for every student. The
--                                              function echoed it back as
--                                              Access-Control-Allow-Origin,
--                                              which is not a legal header
--                                              value, so every browser failed
--                                              the preflight.
--
--      FAIL-SAFE (hardened after that incident): if the secret is unset — OR
--      if nothing in it parses as a real origin — the functions fall back to
--      today's permissive behaviour. A bad value can now only fail to TIGHTEN
--      CORS; it can no longer take the app down. See parseOrigin() in
--      supabase/functions/_shared/security.ts.
--
--   b) Redeploy all three functions after running this migration:
--        supabase functions deploy claim-token
--        supabase functions deploy reset-pin
--        supabase functions deploy send-push
--
--      claim-token / reset-pin gain the rate limit + logging; send-push gains a
--      service-role check (it previously accepted ANY signed-in student's JWT,
--      because the gateway's verify_jwt is satisfied by any valid token).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Longer claim / reset tokens
--    Ownership move: 0002 → 0026. Same signature (no args, returns text), so a
--    plain `create or replace` rebinds it; callers (create_student,
--    create_students in 0007, reset_student_pin in 0013) need no changes.
-- ----------------------------------------------------------------------------
create or replace function public.cp_generate_token()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  -- 8 random bytes rendered whole = 16 uppercase hex chars ("9F3A1C7B2D8E406A").
  -- 0002 truncated this to 8 chars; the substr is what's gone.
  select upper(encode(extensions.gen_random_bytes(8), 'hex'));
$$;

-- ----------------------------------------------------------------------------
-- 2. auth_events — the audit trail AND the rate-limit counter
-- ----------------------------------------------------------------------------
create table if not exists public.auth_events (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  kind       text not null check (kind in ('claim','pin_reset')),
  success    boolean not null,
  ip         text,
  user_agent text,
  -- Deliberately NO foreign key (same reasoning as audit_log in 0023): these
  -- rows must outlive the student they describe.
  student_id uuid,
  -- Coarse machine-readable reason: 'ok', 'token_not_found', 'token_used',
  -- 'expired', 'archived', 'username_taken', 'rate_limited', ...
  detail     text
);

create index if not exists auth_events_ip_idx on public.auth_events (ip, at desc);

create index if not exists auth_events_at_idx on public.auth_events (at desc);

alter table public.auth_events enable row level security;

drop policy if exists auth_events_select on public.auth_events;
create policy auth_events_select on public.auth_events
  for select to authenticated using (public.is_instructor());


grant select on public.auth_events to authenticated;
revoke insert, update, delete on public.auth_events from anon, authenticated;


select cron.schedule(
  'classpoint-auth-events-prune', '17 18 * * 0',
  $$delete from public.auth_events where at < now() - interval '180 days';$$
);