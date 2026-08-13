# ClassPoint — Project Context

Mobile-first gamified classroom PWA. An instructor awards points; students level up,
climb a leaderboard, check in to class via rotating HMAC QR codes, and collect
achievements. Single instructor (the user), students at DCT. Classes started
**June 15, 2026** (a Monday — week numbering derives from this, see `src/lib/term.ts`).

## Stack

- **Frontend:** React 19 SPA (no SSR) · TypeScript · Vite 8 · react-router-dom 7
  (`createBrowserRouter`, every screen lazy-loaded in `src/router.tsx`) ·
  Tailwind CSS v4 (CSS-first config — NO tailwind.config.js; tokens live in
  `src/styles/index.css`: `--canvas/--card/--card-2/--ink/--muted/--line`, brand red
  `#e11d2a`, gold scale) · framer-motion 12 · custom UI primitives (NOT shadcn).
  Heavy/optional libs are dynamic-import only: `xlsx` (exports),
  `modern-screenshot` (leaderboard share image).
- **Backend:** Supabase only (project ref `cxfxstazlwjijozkglgx`) — Postgres + RLS +
  Realtime + Edge Functions (Deno) + pg_cron + pg_net + Vault + Storage (`avatars` bucket).
- **PWA:** vite-plugin-pwa (Workbox, `registerType: 'prompt'`). Custom push logic in
  `public/push-sw.js`, pulled into the generated SW via `workbox.importScripts`.
- **Deploy:** Vercel (SPA rewrite in `vercel.json`). Migrations are pasted manually
  into the Supabase SQL editor; edge functions deployed via `supabase functions deploy`.

## Conventions (follow these exactly)

- **Data layer:** ALL Supabase calls live in `src/lib/api.ts` (throw on error; map
  snake_case rows → camelCase app types). Domain types in `src/lib/types.ts`.
  Components never call `.from()` directly — except Realtime subscriptions.
- **State:** no react-query/zustand. Plain Context + async functions. Student-side
  state is centralized in `src/features/student/StudentData.tsx` (realtime channel
  `student-self-${studentId}`, optimistic updates, celebration queues). Instructor
  screens fetch ad-hoc in the component.
- **UI:** modals = `src/components/ui/Sheet.tsx` (bottom sheet). Toasts = `useToast()`.
  Confirmations = `src/components/ui/ConfirmDialog.tsx` — **every destructive or
  hard-to-undo action must go through it** (deletes, bulk marks, end session, commit
  penalties). The one exception: single-student taps during a LIVE attendance session
  stay one-tap for speed.
- **Components:** function components, named exports, PascalCase files. Lazy imports
  destructure the named export: `.then(m => ({ default: m.Foo }))`.
- **Verify:** `npm run lint` (= `tsc --noEmit`) before every commit. `npm run build`
  for bundle checks. Heavy libs (`xlsx`, capture libs) only via dynamic `import()`.
- **Realtime channel discipline:** one durable channel per student
  (`student-self-*`); page-scoped channels subscribe on mount and are removed on
  unmount; NEVER key channel effects on object identity (use the stable id — see the
  comment in StudentData.tsx).
  **Page-scoped channels MUST use `uniqueChannel()` from `lib/supabase.ts`, not
  `supabase.channel()`.** `channel(topic)` returns an EXISTING channel for a
  repeated topic, and `.on()` on an already-subscribed channel throws
  ("cannot add `postgres_changes` callbacks … after `subscribe()`"). This bites
  whenever a component mounts twice — notably anything passed to Shell's
  `actions`, which renders in BOTH the desktop sidebar and the mobile header.
  For that reason, **a component in `actions` must never own a subscription**:
  hoist state to the layout (mounts once) and pass it down as a prop.

## Changelog workflow

Every user-facing change is announced via `src/lib/changelog.ts` (drives the
"What's new" sheet; version-gated by localStorage). **Current mode: the 4.0.0
"Semesters & Subjects" draft** (3.0.0 shipped 2026-07-19). During overhaul phases,
accumulate sections into the exported `DRAFT_4_0_0` entry (NOT in the `CHANGELOG`
array — `LATEST_VERSION` reads `CHANGELOG[0]`, so a draft is invisible to users) and
only move it into the array as `4.0.0` when the user says the era is ready to announce.

## Migration workflow

- One idempotent file per feature, numbered `supabase/migrations/00NN_*.sql`:
  `create table if not exists`, `drop policy if exists` + recreate,
  `create or replace function`, publication adds guarded by `pg_publication_tables`
  checks, `cron.schedule` upserts by job name.
- **Return-type changes require `drop function if exists` first** (the 0014 lesson),
  then re-`grant execute`.
- Keep existing constraint names when widening CHECKs (`point_events_points_check`,
  `point_events_category_check` — see 0007/0011 precedent).
- Manual dashboard steps go in a `── ONE-TIME SETUP ──` header comment (0010 pattern).
  Current manual state: Vault secret `edge_service_key` exists; VAPID keys are set as
  edge function secrets; pg_cron + pg_net enabled. **Pending since 0026:** set the
  `ALLOWED_ORIGINS` edge-function secret (comma-separated origins, no trailing slash)
  and redeploy `claim-token`, `reset-pin`, `send-push`. Until it is set the two public
  functions stay on the old permissive CORS — by design, so a missing secret can never
  take the app down.
- The user pastes migrations whole into the SQL editor — test idempotency by running twice.

## DB map (migrations 0001–0016 are the source of truth)

Tables: `sections`, `students` (cached `lifetime_points` = trigger-maintained
`greatest(0, SUM(point_events.points))`), `student_secrets`, `point_events` (the
ledger — awards, penalties, and future spending all flow through it), `instructors`
(allowlist, checked via `is_instructor()`), `leaderboard_snapshot` + `leaderboard_meta`
(frozen rank, pg_cron refresh 12:30 + 19:30 Manila), `push_subscriptions`,
`class_sessions` + `class_session_secrets` + `attendance_records`, `profile_views`,
`achievements` + `student_achievements`.

Since 0026 (Security): `auth_events` — every claim / PIN-reset attempt (`kind`,
`success`, `ip`, `user_agent`, `student_id` with no FK, coarse `detail`). It is BOTH
the audit trail and the rate-limit counter: the two public edge functions count an
IP's recent failures before touching a token (**30 per 15 min** — deliberately
generous because a whole class shares one NAT IP; rows with `detail = 'rate_limited'`
are excluded from the count so retries can't extend a lockout). Instructor-select
only, no write policy — the functions insert with the service role. Weekly prune cron
`classpoint-auth-events-prune` (180-day retention). **Ownership move:
`cp_generate_token` 0002 → 0026** — claim/reset tokens are now 16 hex chars (64 bits);
EXISTING shorter tokens stay valid, so mixed lengths in `student_secrets` are expected.
Shared edge helpers live in `supabase/functions/_shared/security.ts` (CORS allowlist
via the `ALLOWED_ORIGINS` secret, rate limit, logging) — all of it fails OPEN on
infrastructure errors so a logging or counter failure never blocks a real student.
`send-push` now rejects any caller that isn't the service role (it previously accepted
any signed-in student's JWT, since the gateway's `verify_jwt` is satisfied by any valid
token); it accepts an exact service-key match OR a `service_role` JWT so a rotated
Vault secret can't silently kill push. Claim/reset error messages are uniform
("not valid **or** already used/expired") so a guesser can't distinguish token states;
the archived-student message stays specific because it is only reachable after a valid
unclaimed token matched. `vercel.json` serves HSTS, `X-Frame-Options: DENY`, nosniff,
`Referrer-Policy`, and `Permissions-Policy` (`camera=(self)` — the QR scanner needs it).
**No CSP yet** — deferred by the user; adding one requires moving the inline
`beforeinstallprompt` script out of `index.html` and allowlisting the Google Fonts and
Supabase (https + wss) origins.

Since 0024: `attendance_records.synced_late` (offline check-in flag). Offline
check-in: the QR now encodes `{origin}/scan#CP1|…` so native cameras work (public
`/scan` route captures the proof, then routes by auth); `parsePayload` accepts both
the URL and legacy `CP1|…` forms. Proofs queue in localStorage (`cp_offline_scans_v1`,
`lib/offline-scans.ts`, capture-first), sync on app-start/`online`/Attendance-mount.
`submit_offline_scan` re-validates the HMAC, computes status from the CAPTURE window
(48h expiry), and UPGRADES to a better status (present>late>absent) via the shared
`cp_apply_attendance_status` core — never worsens, never overwrites excused/irregular.
**Ownership move: `set_attendance_status` 0018 → 0024** (now a thin instructor-gate
over `cp_apply_attendance_status`, which is revoked from all API roles). `vite.config`
gained `navigateFallback: '/index.html'` (offline deep links) with a REST/functions/auth
denylist.

Phase C (frontend-only, no migration): instructor per-student record page at
`/teach/student/:id` (`StudentRecord`) — reached via the "View ›" button on each
roster row; reuses `listMyAttendance`/`listStudentEvents`/`listMyRedemptions`/
`getMyAchievements`/`getMyRank` (all instructor-RLS-readable) + new `getStudent`
(joins `sections(name)`). Printable "Attendance Record" at
`/teach/student/:id/report` (`StudentReport`) is registered UNDER the `/teach`
RequireRole node but OUTSIDE `InstructorLayout` (no Shell/tabs); it renders
hardcoded light styles (no theme tokens → dark mode can't leak) + a `print:hidden`
toolbar and `@page { size: A4 }`. Never call it "Parent Report" in UI. Register
matrix export (`exportSectionRegister`, P/L/A/E/I cells via `aoa_to_sheet`) and
"Backup all" workbook (`lib/export-all.ts` → `fetchFullBackup`, paged `.range`)
both dynamic-import xlsx. Award deep-link: `/teach/award?student=<id>` preselects
via a ref that applies once the section's roster loads.

Since 0023 (Reliability Era): `audit_log` (full-JSON record of every destructive
action; instructor-select only, written by the `cp_audit_delete` AFTER DELETE trigger
on students/point_events/attendance_records/class_sessions + by the archive RPCs).
`backup` schema (one table per critical source, `snapshot_date`-keyed; nightly
`cp_nightly_backup()` at 02:00 Manila, 14-day retention, self-heals on schema drift;
no API-role grants). `students.archived_at` (archive-instead-of-delete): archive via
`archive_student`/`restore_student`/`hard_delete_student` RPCs (hard delete refuses
unless already archived; the app double-confirms with a typed-name challenge).
**Ownership moved to 0023 (all same-signature `create or replace`):**
`refresh_leaderboard_snapshot` (0006→0023, `where archived_at is null`),
`end_class_session` + `scan_attendance` (0014→0023, archived guards),
`get_achievement_rarity` (0021→0023, archived denominator). Client reads of active
rosters filter `.is('archived_at', null)`; `listSessionAttendance` instead keeps an
archived student's row ONLY when they have a record in that session (history stays
truthful). `deleteSection` counts archived students too. `claim-token` edge function
rejects archived roster rows (redeploy after 0023).

Since 0025: `absence_excuses` (DCT-CCS admission-slip flow) — student
`request_absence_excuse` (own absent record, 7-day window, absent-only,
`has_slip` flag) / `set_excuse_slip_status` / `cancel_absence_excuse`; instructor
`decide_absence_excuse` (approve → `set_attendance_status(record,'excused')`
reconciles the penalty; queues one `'excuse'` notification). **Ownership move:
`cp_notify_point_event` 0017 → 0025** (absence penalty push gains the
admission-slip line; still ONE push). Instructor inbox is the ONE tabbed
`/teach/redemptions` "Requests" page (Points | Excuses); badge = pending
redemptions + pending excuses, both counts + channels hoisted in InstructorLayout
(`uniqueChannel('redemptions-badge')` + `'excuses-badge'`). Student surface:
`AbsenceExcuses` above the attendance history (guidance card, per-record dismiss
in localStorage `cp_excuse_guide_dismissed_v1`, request sheet + slip toggle).

Since 0017–0020: `notifications` (the push outbox AND the in-app bell's history),
`point_redemptions` (spend requests), `leaderboard_comments` +
`leaderboard_banned_words` (24h flying comments). Attendance statuses are
`present|late|absent|excused|irregular`. `point_events.category` is
`recitation|activity|penalty|redeem`.

Gotchas:
- `cp_achievement_metrics` has ONE owner: migration **0021** (drops + recreates it).
  0018 deliberately does NOT recreate it — two migrations recreating a function
  whose return type changes clash on re-run (`ERROR 42P13: cannot change return
  type`, since `create or replace` can't change the signature). Any future change
  goes in a single new migration that does `drop function if exists` first, then
  recreates dependents `sync_achievements` + `get_achievement_progress` (also
  drop-first) and re-grants. Never let two migrations own it.
- Event-granted badges (`town_crier`, `window_shopper`) are set by TRIGGERS
  (`trg_town_crier` on leaderboard_comments, `trg_window_shopper` on
  point_redemptions), NOT by `sync_achievements` — they're not in its satisfied
  list. `granted_by='system'` but no metric. Don't add them to sync.
- pg_net `http_post` is fire-and-forget — never mark push work "sent" from SQL.
  Only the `send-push` edge function transitions `notifications.push_status`.
- `end_class_session` inserts absents with `on conflict do nothing` — records that
  already exist (any status) are never overwritten. Intentional; don't "fix".
- **Every attendance status change must go through `set_attendance_status`** (via
  `updateAttendanceStatus` in api.ts). A direct `.update({status})` bypasses penalty
  reconciliation and leaves a stale penalty in the ledger. The direct upserts
  (`markAttendanceManually`/`markAttendanceBulk`/`resetAttendance`) are LIVE-SESSION
  ONLY, where nothing is committed yet.
- `commit_attendance_penalties` deliberately queues no notifications: its
  `point_events` insert already fires `cp_notify_point_event`. Adding one = double push.
- 'excused'/'irregular' are NEUTRAL everywhere: no penalty, excluded from streaks,
  show-up rate, and achievement metrics (`NEUTRAL_STATUSES` in types.ts).
- **Spending = ONE BALANCE** (user's decision): an approved redemption inserts a
  negative `point_events` row (category `redeem`), so it lowers XP/level/rank like
  any loss. Overspend prevention = `select students … for update` in BOTH
  `request_point_redemption` and `decide_point_redemption` (same lock order —
  student row first — so they can't deadlock); available = `lifetime_points` minus
  pending. Validating against `lifetime_points` is safe because it's
  `greatest(0, sum)` and therefore always ≥ the raw sum.
- `listRecentAwards` filters out `redeem` events: deleting one there would refund
  the points while the redemption still reads "approved" (a silent desync).
- `cp_notify_point_event` skips `redeem`; `decide_point_redemption` sends the
  single richer notification instead. Don't add a second.
- `leaderboard_comments` denormalizes `display_name`/`avatar_url` at post time so
  a realtime INSERT payload can render a pill with no extra fetch. Rows live 24h,
  so staleness is a non-issue. `student_id is null` ⇒ posted by the instructor.
- The danmaku keyframe (`.cp-fly`) needs `container-type: inline-size` on the
  deck — `cqw` resolves against it. Without it pills start mid-board instead of
  off the right edge. Never swap `cqw` for `vw`: the deck is a centred column.
  The deck is a `sticky top-[52px]` band ABOVE the podium (not an absolute
  overlay on it) so it never covers the crown and stays visible while scrolling
  the rankings. Tapping a student pill fires `onOpenProfile` up to the leaderboard
  (which owns the profile sheet); instructor moderation lives only in the Recent
  comments list.
- `get_profile_visitors` (0022) returns the viewer's `student_id` + section/points/
  rank so a tapped visitor row opens their profile. VisitorsSheet bubbles the row
  up via `onOpenViewer` (Profile owns the preview) to avoid a component→feature
  import cycle.
- `npm run lint` (`tsc --noEmit`) misses unused locals; **`npm run build` (`tsc -b`)
  is the stricter gate** — run it before declaring done.

## Auth model

Students: username + PIN → synthetic email `@students.classpoint.app`; onboard via
claim tokens (edge function `claim-token`). Instructors: real email + `is_instructor()`
allowlist check; sign-in lives at the unlisted route `/macalesideauth`. Student area
`/app` (`AppLayout`), instructor area `/teach` (`InstructorLayout`); RLS is the real
security boundary. Since 0026 **all four** auth forms wire `useLockout` (5 failures →
60s, doubling, 15m cap): `cp_instr_login`, `cp_student_login`, `cp_claim`,
`cp_reset_pin`. Only SERVER rejections call `registerFailure()` — a local `validate()`
typo must not count. This is a speed bump, not a boundary (localStorage is clearable);
for claim/reset the server-side per-IP limit in `auth_events` is the real gate, and
failed PASSWORD sign-ins are not server-observable at all (they go straight to GoTrue),
which is why there is deliberately no server-side failed-login log.

## Working agreements with the user

- **Per-phase decision checkpoints (HARD RULE, never skip):** before implementing any
  overhaul phase or large feature, present its real design forks via AskUserQuestion —
  copy/tone, layout variants, limits, colors, placement. The user decides; never
  silently pick defaults on user-visible choices.
- **Warn on everything risky:** any new destructive action gets a ConfirmDialog.
- **Playful tone:** game content (achievements, flavor text, notification copy) should
  be playful/inside-joke flavored, not sanitized corporate copy — but the user reviews
  drafts (see decision checkpoints).
- **Keep this file updated** whenever architecture, conventions, or agreements change.
- The approved overhaul master plan lives at
  `C:\Users\kobym\.claude\plans\this-is-planning-phase-swift-wilkes.md` (6 phases,
  one migration per phase, 0017+).
