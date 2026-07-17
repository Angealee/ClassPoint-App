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

## Changelog workflow

Every user-facing change is announced via `src/lib/changelog.ts` (drives the
"What's new" sheet; version-gated by localStorage). **Current mode: the 3.0.0 overhaul
draft.** During overhaul phases, accumulate sections into the exported `DRAFT_3_0_0`
entry (NOT in the `CHANGELOG` array — invisible to users) and only move it into the
array as `3.0.0` when the user says the overhaul is ready to announce.

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
  edge function secrets; pg_cron + pg_net enabled.
- The user pastes migrations whole into the SQL editor — test idempotency by running twice.

## DB map (migrations 0001–0016 are the source of truth)

Tables: `sections`, `students` (cached `lifetime_points` = trigger-maintained
`greatest(0, SUM(point_events.points))`), `student_secrets`, `point_events` (the
ledger — awards, penalties, and future spending all flow through it), `instructors`
(allowlist, checked via `is_instructor()`), `leaderboard_snapshot` + `leaderboard_meta`
(frozen rank, pg_cron refresh 12:30 + 19:30 Manila), `push_subscriptions`,
`class_sessions` + `class_session_secrets` + `attendance_records`, `profile_views`,
`achievements` + `student_achievements`.

Since 0017/0018/0019: `notifications` (the push outbox AND the in-app bell's
history), `point_redemptions` (spend requests). Attendance statuses are
`present|late|absent|excused|irregular`. `point_events.category` is
`recitation|activity|penalty|redeem`.

Gotchas:
- `cp_achievement_metrics` (canonical body now in **0018**, not 0016) derives
  attendance streaks/counts from `attendance_records`. Copy the latest body forward
  when changing it — never fork it.
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
- `npm run lint` (`tsc --noEmit`) misses unused locals; **`npm run build` (`tsc -b`)
  is the stricter gate** — run it before declaring done.

## Auth model

Students: username + PIN → synthetic email `@students.classpoint.app`; onboard via
claim tokens (edge function `claim-token`). Instructors: real email + `is_instructor()`
allowlist check; sign-in lives at the unlisted route `/macalesideauth`. Student area
`/app` (`AppLayout`), instructor area `/teach` (`InstructorLayout`); RLS is the real
security boundary.

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
