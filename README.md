# ClassPoint

A mobile-first, gamified classroom PWA. The instructor awards points during class;
students level up, climb a leaderboard, check in via rotating HMAC QR codes, and
collect achievements. Built for one instructor and ~208 students at DCT-CCS.

This file is the **reference**: what exists, how to run it, and where everything
lives. For a guided walkthrough of *how it works and why*, read
[LEARN.md](LEARN.md). For the conventions you must follow when changing the code,
read [CLAUDE.md](CLAUDE.md) — that one is authoritative on process.

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Academic structure](#2-academic-structure)
3. [Tech stack](#3-tech-stack)
4. [Running it locally](#4-running-it-locally)
5. [Project layout](#5-project-layout)
6. [The data layer](#6-the-data-layer)
7. [Routes](#7-routes)
8. [Database](#8-database)
9. [Migration ledger](#9-migration-ledger)
10. [Edge functions](#10-edge-functions)
11. [Scheduled jobs](#11-scheduled-jobs)
12. [Auth model](#12-auth-model)
13. [Deploying](#13-deploying)
14. [Verification](#14-verification)
15. [Known gaps](#15-known-gaps)

---

## 1. What it does

**For students**

- See points, level and XP progress, updating live as they're awarded
- Check in to class by scanning a rotating QR code — works offline, syncs later
- A leaderboard that freezes twice daily, plus 24-hour flying comments
- Achievements, display titles, a public profile with banner photos
- Full points history with a per-week chart and category breakdown
- Attendance history grouped by term, with per-subject show-up rates
- Spend points on quiz/activity/exam credit from a priced rewards catalog
- File absence excuses (the DCT-CCS admission-slip flow) inside a 7-day window
- Push notifications for awards, level-ups, rank changes, decisions and announcements

**For the instructor**

- Four tabs: **Students · Attendance · History · Ranks**, plus Requests and Ops
  in the header
- Award points from the section roster — tick several students, award once
- Run a live class session with a rotating QR and a real-time check-in roster
- Per-subject attendance, class stats, and a printable per-student record
- Approve or reject point-spend requests and absence excuses from one inbox
- An ops screen: backup health, the audit log, auth events, leaderboard rebuild
- Broadcast announcements to one section or all
- A cross-section "needs attention" list tied to the excuse deadline
- Export the register, a per-term attendance workbook, or a full backup
- Roll over to a new semester with a resumable wizard

---

## 2. Academic structure

Data is organised **semester → term → subject → section**.

- A **semester** is 18 weeks. Exactly one is active at a time.
- A **term** is prelim / midterm / finals — six weeks each by default, but the
  dates are **stored and editable**, because holidays move them.
- **Subjects** belong to a semester and are assigned to sections through a link
  table. This semester: `IT 32 · Platform Technologies` and
  `Elective 1 · Event-driven Programming`.
- **Attendance is per subject.** **Points are one shared pool** spendable anywhere.
- Points, level and the leaderboard **reset each semester**. Achievements and the
  all-time total never do.

The first semester is *1st Sem AY 2026–2027*, starting **2026-06-15** (a Monday;
week 1 anchors there).

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| UI | React 19 SPA (no SSR), TypeScript, Vite 8 |
| Routing | react-router-dom 7, `createBrowserRouter`, every screen lazy |
| Styling | Tailwind CSS v4 — **CSS-first config, no `tailwind.config.js`** |
| Animation | framer-motion 12 |
| Components | Custom primitives in `src/components/ui` (**not** shadcn) |
| Backend | Supabase only — Postgres, RLS, Realtime, Edge Functions, pg_cron, pg_net, Vault, Storage |
| PWA | vite-plugin-pwa (Workbox), `registerType: 'prompt'` |
| Tests | Vitest — 77 tests over the five pure libs |
| Lint | ESLint flat config (typescript-eslint + react-hooks), warn-first |
| Hosting | Vercel (SPA rewrite in `vercel.json`) |

Design tokens live in `src/styles/index.css`: `--canvas`, `--card`, `--card-2`,
`--ink`, `--muted`, `--line`, brand red `#e11d2a`, and a gold scale.

Heavy libraries are **dynamic-import only**: `xlsx` (exports) and
`modern-screenshot` (leaderboard share image).

---

## 4. Running it locally

```bash
npm install
```

Create `.env.local`:

```bash
VITE_SUPABASE_URL=https://cxfxstazlwjijozkglgx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Missing or placeholder values **throw in production** (`src/lib/supabase.ts`) —
a typo'd Vercel env used to boot fine and then fail every request with an opaque
network error. Dev keeps a soft warning.

```bash
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b && vite build` — **the strict gate** |
| `npm run lint` | `tsc --noEmit` (misses unused locals) |
| `npm run lint:eslint` | ESLint over `src` |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run verify` | typecheck → eslint → tests → build, in that order |

**`npm run verify` is the gate before every commit.**

---

## 5. Project layout

```
src/
├── components/
│   ├── achievements/   badge art, unlock burst
│   ├── attendance/     QR scanner, status chips
│   ├── changelog/      "What's new" list
│   ├── layout/         Shell (nav + header), Splash
│   ├── leaderboard/    podium, flying comments, share sheet
│   ├── profile/        avatar, visitor sheet
│   ├── pwa/            install prompt, update toast
│   └── ui/             Button, Card, Sheet, Input, Select, Toast,
│                       ConfirmDialog, Skeleton, PullToRefresh, icons…
├── features/
│   ├── auth/           sign-in, claim, PIN reset
│   ├── instructor/     26 screens — see below
│   └── student/        21 screens — see below
├── lib/
│   ├── api/            the data layer (one module per domain)
│   ├── api.ts          barrel re-exporting all of api/
│   ├── types.ts        app-level domain types
│   ├── database.types.ts  hand-written DB row types
│   ├── term.ts         semester/term/week maths (DB-driven, synchronous)
│   ├── leveling.ts     the level curve — mirrors cp_level() in SQL
│   ├── qr.ts           HMAC payload encode/parse
│   ├── offline-scans.ts  the offline check-in queue
│   ├── changelog.ts    release notes + the unreleased draft
│   ├── errors.ts       errorText()
│   ├── images.ts       client-side downscale before upload
│   ├── auth.tsx        AuthContext
│   ├── supabase.ts     client + uniqueChannel()
│   └── …               sound, haptics, push, theme, time, pwa
└── styles/index.css    Tailwind v4 config + design tokens
```

**Instructor screens** — `Students` (roster + awarding), `AwardBar`,
`SectionGrid`, `ManageSections`, `ManageSemesters`, `SemesterRollover`,
`Attendance` / `AttendanceSession` / `AttendanceReview`, `SessionHistory`,
`SessionDetail`, `History` (Points | Attendance tabs), `AwardHistory`,
`InstructorLeaderboard`, `Redemptions` (Points | Excuses | Rewards),
`ExcusesInbox`, `RewardsCatalog`, `Ops`, `Broadcast`, `RiskOverview`,
`AttendanceWorkbook`, `StudentRecord`, `StudentReport`, `ArchivedStudentsSheet`,
`ResetPinSheet`, `InstructorLayout`.

**Student screens** — `Dashboard`, `Leaderboard`, `Attendance`, `PointsHistory`,
`UsePoints`, `Profile`, `Achievements`, `Notifications`, `AbsenceExcuses`,
`LiveClassBanner`, `StreakFlame`, `SemesterEndedBanner`, `PastSemesterBoard`,
`OfflineScanCards`, `AwayRecap`, `Onboarding`, `ScanLanding`,
`StudentProfilePreview`, `AchievementDetailSheet`, `StudentData` (the context).

---

## 6. The data layer

**Every Supabase call lives under `src/lib/api/`**, one module per domain, with
`src/lib/api.ts` as a barrel. Screens import from `@/lib/api` and never touch
`.from()` directly — the one exception is Realtime subscriptions.

| Module | Lines | Owns |
|---|---:|---|
| `core.ts` | 1003 | semesters, subjects, sections, students, points, profiles |
| `attendance.ts` | 781 | sessions, scanning, records, analytics, achievements |
| `ops.ts` | 187 | backup health, audit log, auth events, broadcast, risk |
| `redemptions.ts` | 149 | point-spend requests |
| `excuses.ts` | 139 | the admission-slip flow |
| `_internal.ts` | 106 | `rpc`, `withAuthRetry`, `oneEmbed`, `fetchAllPages` |
| `backup.ts` | 95 | full-backup fetch |
| `rewards.ts` | 94 | the catalog |
| `rollover.ts` | 83 | promote, archive, activate, past boards |
| `comments.ts` | 75 | leaderboard danmaku |
| `notifications.ts` | 70 | the bell |

Calls throw on error and map `snake_case` rows to `camelCase` app types. Add a
query to the module it belongs to, never to the barrel; import `_internal` only
from inside `api/`.

**Three helpers worth knowing:**

- `withAuthRetry` retries **only** auth-layer rejections (401 / PGRST301 / JWT /
  refresh). Those are rejected before PostgREST touches the table, so wrapping a
  non-idempotent insert cannot double-fire it.
- `fetchAllPages` loops `.range()` with a fresh builder per page. PostgREST caps
  every response at 1000 rows **and truncates silently** — a two-subject section
  crosses that in `attendance_records` around week 12.
- `oneEmbed` normalises a many-to-one embed, which supabase-js types as an array
  and PostgREST actually returns as an object.

**State** — no react-query or zustand. Plain Context plus async functions.
Student state is centralised in `features/student/StudentData.tsx`; instructor
screens fetch ad hoc.

---

## 7. Routes

| Path | Screen |
|---|---|
| `/` | Landing |
| `/signin` · `/claim` · `/reset` | Student auth |
| `/macalesideauth` | Instructor sign-in (unlisted) |
| `/scan` | Public QR landing — captures the proof, then routes by auth |
| `/app` | Student area (`AppLayout`) |
| `/app/leaderboard` · `/attendance` · `/points` · `/history` · `/profile` · `/achievements` | Student screens |
| `/teach` | Instructor area (`InstructorLayout`) |
| `/teach/attendance` · `/attendance/session/:id` | Live class |
| `/teach/history` | Points \| Attendance tabs |
| `/teach/leaderboard` · `/redemptions` · `/semesters` · `/ops` | Instructor screens |
| `/teach/student/:id` | Per-student record |
| `/teach/student/:id/report` | Printable record (outside the layout) |

Redirects keep old links alive: `/teach/award` → `/teach`,
`/teach/attendance/history` → `/teach/history?tab=attendance`.

---

## 8. Database

**Core tables** — `semesters`, `semester_terms`, `subjects`, `section_subjects`,
`sections`, `students`, `student_secrets`, `point_events`, `instructors`,
`leaderboard_snapshot`, `leaderboard_meta`, `class_sessions`,
`class_session_secrets`, `attendance_records`, `achievements`,
`student_achievements`, `notifications`, `push_subscriptions`,
`point_redemptions`, `reward_catalog_items`, `absence_excuses`,
`leaderboard_comments`, `leaderboard_banned_words`, `profile_views`,
`audit_log`, `auth_events`, plus a `backup` schema mirroring 13 tables.

**Rules that are easy to get wrong**

- `students.lifetime_points` is a trigger-maintained cache of
  `greatest(0, SUM(point_events.points))`. `semester_points` is the same for the
  active semester and is **the app's "points"** — XP, level, rank, spendable
  balance. Achievements still read `lifetime_points`, deliberately.
- **Points are never written directly to a total.** Everything — awards,
  penalties, spending — flows through `point_events`.
- **Every attendance status change goes through `set_attendance_status`.** A
  direct `.update({status})` skips penalty reconciliation and leaves a stale
  penalty in the ledger.
- `'excused'` and `'irregular'` are **neutral** everywhere: no penalty, excluded
  from streaks, show-up rate and achievement metrics.
- RLS is the real security boundary; the service role never reaches the browser.

---

## 9. Migration ledger

One idempotent file per feature in `supabase/migrations/`, pasted by hand into
the Supabase SQL editor. **Migration before client, always** — a migration adding
a column the client selects must land *before* the build that selects it.

| # | Name | Adds |
|---|---|---|
| 0001–0005 | schema, functions, security, realtime, seed | The foundation |
| 0006 | leaderboard_snapshot | Frozen board + `force_leaderboard_refresh` |
| 0007 | avatars_import_minus | Storage bucket, bulk import, penalties |
| 0008 / 0010 | push notifications, vault | Web push + `edge_service_key` |
| 0009 | public_profiles | Profile visibility |
| 0011 / 0012 | point range, noon settle | Custom points, midday refresh |
| 0013 | pin_reset | Reset tokens |
| 0014 | attendance | Sessions, rotating QR, records |
| 0015 | profile_social | Bio, interests, banners |
| 0016 / 0021 | achievements, social achievements | Badges + `cp_achievement_metrics` |
| 0017 | notifications | The push outbox and bell history |
| 0018 | attendance_v2 | Statuses, manual marking |
| 0019 | redemptions | Point-spend requests |
| 0020 | leaderboard_comments | 24-hour danmaku |
| 0022 | visitor_profile_tap | `get_profile_visitors` |
| 0023 | data_safety | `audit_log`, `backup` schema, archive-not-delete |
| 0024 | offline_checkin | `synced_late`, `submit_offline_scan` |
| 0025 | absence_excuses | The admission-slip flow |
| 0026 | security_hardening | `auth_events`, 16-char tokens, rate limits |
| 0027 | semesters | Semesters, terms, subjects, section_subjects |
| 0028 | subject_sessions | `class_sessions.subject_id` |
| 0029 | semester_points | Per-semester points; the rollover contract |
| 0030 | subject_metrics | Per-subject streaks and counts |
| 0031 | attendance_aggregates | SQL tallies — the 1000-row truncation fix |
| 0032 | rewards_catalog | The instructor's price list |
| 0033 | student_presence | `class_sessions` realtime + excuse nudge cron |
| 0034 | instructor_ops | Backup health, broadcast, risk, term attendance |
| 0035 | rollover | Promote, archive, activate, past leaderboards |
| 0036 | term_badges | Four badges won inside a single six-week term |

**Applied through 0032** (2026-08-14). **0033 through 0036 are written and not
yet applied** — see [CLAUDE.md](CLAUDE.md) for what breaks if you deploy without
them.

**Function ownership moves** (a function has exactly one owning migration):
`cp_generate_token` 0002→0026 · `cp_nightly_backup` 0023→0027→0032 ·
`start_class_session` 0014→0028 · `cp_recompute_points` 0007→0029 ·
`refresh_leaderboard_snapshot` 0023→0029 · redemption RPCs 0019→0029 ·
`cp_achievement_metrics` 0021→0030→0036 · `set_attendance_status` 0018→0024 ·
`cp_notify_point_event` 0017→0025 · `scan_attendance` 0023→0035.

A return-type change needs `drop function if exists` first, then re-`grant`.

---

## 10. Edge functions

Deployed with `supabase functions deploy <name>`.

| Function | Purpose |
|---|---|
| `claim-token` | Turns a claim token into an account (unauthenticated) |
| `reset-pin` | PIN reset via token (unauthenticated) |
| `send-push` | Delivers web push; **service-role callers only** |
| `_shared/security.ts` | CORS allowlist, rate limiting, auth-event logging |

Push delivery has its own guide: **[PUSH_SETUP.md](PUSH_SETUP.md)** covers the
three delivery paths (in-app, backgrounded, fully closed) and the one-time VAPID
setup.

The two public functions rate-limit per IP: **30 failures per 15 minutes**,
deliberately generous because a whole class shares one NAT address. Everything in
`_shared/security.ts` **fails open** on infrastructure errors, so a logging
failure can never block a real student.

CORS reads an `ALLOWED_ORIGINS` secret (comma-separated, no trailing slash). If
it's unset the functions stay on the old permissive behaviour — by design, so a
missing secret can't take the app down.

---

## 11. Scheduled jobs

pg_cron, all times UTC.

| Job | Schedule | Does |
|---|---|---|
| `classpoint-leaderboard-am` / `-noon` / `-pm` | 3×/day | Freeze the board (12:30 + 19:30 Manila) |
| `classpoint-push-sweep` | every 5 min | Re-dispatch undelivered pushes |
| `classpoint-comments-purge` | daily | Delete comments over 24h old |
| `classpoint-nightly-backup` | 18:00 (02:00 Manila) | Snapshot 13 tables, 14-day retention |
| `classpoint-auth-events-prune` | weekly | 180-day retention on `auth_events` |
| `classpoint-excuse-nudge` | 10:00 (18:00 Manila) | One reminder per expiring absence |

---

## 12. Auth model

**Students** sign in with a username and PIN, mapped to a synthetic email
`username@students.classpoint.app`. They onboard by claiming a token printed by
the instructor.

**Instructors** use a real email plus an `is_instructor()` allowlist check.
Sign-in is at the unlisted route `/macalesideauth`.

All four auth forms use `useLockout` — 5 failures → 60s, doubling, 15-minute cap.
**Only server rejections count**, so a local validation typo doesn't lock anyone
out. This is a speed bump, not a boundary (localStorage is clearable); for claim
and reset the server-side per-IP limit is the real gate. Failed password sign-ins
go straight to GoTrue and aren't observable from our code, which is why there's
deliberately no server-side failed-login log.

`vercel.json` serves HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`
and `Permissions-Policy` (`camera=(self)` — the scanner needs it). **No CSP yet**
— it needs the inline `beforeinstallprompt` script moved out of `index.html`.

---

## 13. Deploying

1. **Paste any unapplied migrations** into the Supabase SQL editor, in order.
   Run each **twice** to prove idempotency.
2. Deploy edge functions if they changed:
   `supabase functions deploy claim-token reset-pin send-push`
3. Push to `main`. Vercel builds and deploys.

Never invert steps 1 and 3.

**Manual dashboard state that already exists:** the `edge_service_key` Vault
secret, VAPID keys as function secrets, pg_cron and pg_net enabled.
**Still pending since 0026:** set `ALLOWED_ORIGINS`.

---

## 14. Verification

```bash
npm run verify
```

Runs typecheck → ESLint → 77 tests → build. Current state: **0 errors, 63
warnings** (mostly react-hooks v7 performance opinions about `set-state-in-effect`).

Tests are colocated beside the five **pure** libs — no React or Supabase mocking,
which is exactly why these five came first:

| Test | Guards |
|---|---|
| `qr.test.ts` | The HMAC, pinned against an independently computed value. Drift here rejects every scan. |
| `term.test.ts` | Local-vs-UTC date parsing, week and term boundaries |
| `leveling.test.ts` | The ladder, pinned. Changes in the **same commit** as any `cp_level` migration. |
| `offline-scans.test.ts` | The state machine — the load-bearing case is "a transport failure KEEPS the queued proof" |
| `changelog.test.ts` | Version compare, and that the draft stays out of the live array |

---

## 15. Known gaps

- **`database.types.ts` is hand-written.** Writes are typechecked; **reads are
  not** — `.from('nonexistent')` compiles clean. Run
  `npx supabase gen types typescript --project-id cxfxstazlwjijozkglgx` when you
  have CLI credentials and replace the file.
- **No CI.** `npm run verify` locally is the only gate.
- **No CSP** (see §12).
- **Scanner has no manual code entry.** The QR encodes a ~100-character URL plus
  an HMAC, so there's nothing on the projector a student could transcribe. It
  needs a short-code feature first.
- **ESLint is warn-only.** 63 warnings remain; tighten to errors once the backlog
  is read.
- Deferred from the polish phase: framer-motion off the critical path, StudentData
  context memoization, memoized `RosterRow` / `SessionClock`.
- Built but unwired: `get_section_overview()` — the backend for SectionGrid
  status signals.
