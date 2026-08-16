# ClassPoint — How It Works

> A guided tour of the ideas behind the app, written to be read top to bottom.
>
> This is the **tutorial**. It explains *why* things are shaped the way they are
> and walks data end to end. For lookup — the migration list, the route table,
> the module inventory — use [README.md](README.md). For the rules you must
> follow when changing code, use [CLAUDE.md](CLAUDE.md).

---

## Table of contents

1. [The mental model](#1-the-mental-model)
2. [Nine ideas that explain most of the code](#2-nine-ideas-that-explain-most-of-the-code)
3. [Walkthrough: the instructor awards points](#3-walkthrough-the-instructor-awards-points)
4. [Walkthrough: a student checks in](#4-walkthrough-a-student-checks-in)
5. [Walkthrough: checking in with no signal](#5-walkthrough-checking-in-with-no-signal)
6. [Walkthrough: a student spends points](#6-walkthrough-a-student-spends-points)
7. [Walkthrough: the semester rolls over](#7-walkthrough-the-semester-rolls-over)
8. [How security actually works](#8-how-security-actually-works)
9. [Realtime, and the rule that keeps it working](#9-realtime-and-the-rule-that-keeps-it-working)
10. [Traps this codebase has already fallen into](#10-traps-this-codebase-has-already-fallen-into)

---

## 1. The mental model

There is no backend server. The React app talks straight to Postgres through
Supabase's REST layer, and **Postgres itself enforces every rule** through
row-level security and `SECURITY DEFINER` functions.

That single fact explains most of the architecture:

- There is no place to "check permissions" in JavaScript, because JavaScript is
  not trusted. Anyone can open devtools and call the API directly.
- Anything that must be *guaranteed* — a penalty applied, a balance debited, a
  QR code verified — is a Postgres function, not client code.
- The client's job is to be a good **presenter** of data it is allowed to read,
  and a good **requester** of changes it is allowed to make.

```
┌─────────────────────────────────────────────┐
│  React SPA (browser)                        │
│  · renders, animates, requests              │
│  · holds NO secrets, enforces NO rules      │
└───────────────┬─────────────────────────────┘
                │  anon key + a signed JWT
                ▼
┌─────────────────────────────────────────────┐
│  Supabase                                   │
│  ├─ PostgREST  → RLS policies decide reads  │
│  ├─ RPCs       → SECURITY DEFINER functions │
│  ├─ Realtime   → RLS-respecting WebSockets  │
│  └─ Edge fns   → the few unauthenticated    │
│                  paths (claim, reset)       │
└───────────────┬─────────────────────────────┘
                ▼
         Postgres — the actual authority
```

---

## 2. Nine ideas that explain most of the code

### a) Totals are never written; they are derived

You will never see `UPDATE students SET points = points + 3`. Every award,
penalty and purchase is a row in **`point_events`**, and a trigger recomputes
the cached totals from the ledger.

```
point_events (the truth)  ──trigger──▶  students.lifetime_points  (cache)
                                    └─▶  students.semester_points (cache)
```

Why: a ledger can be audited, corrected and replayed. A running total that drifts
is unfixable, because nothing remembers how it got there.

### b) Two totals, two meanings

- **`semester_points`** is *the app's "points"* — XP, level, rank, and the
  balance you can spend. It resets every semester.
- **`lifetime_points`** is the career total. **Achievements read this one**, by
  the instructor's decision.

So a returning student can legitimately show "Level 1" this semester while
holding a "Reach Level 3" badge. That badge is a trophy from an earlier term, not
a bug.

### c) Roles are detected, not stored

There is no `role` column. A user is an instructor if their email is in the
`instructors` table, checked by the `is_instructor()` function that every
instructor-only policy and RPC calls. Students are identified by
`students.user_id = auth.uid()`.

### d) Live dashboard, frozen leaderboard

Your own points update **instantly** over Realtime. The leaderboard is a
**snapshot** rebuilt twice a day (12:30 and 19:30 Manila).

Why freeze it: a live ranking of 208 students would flicker constantly during
class, and "watching yourself drop in real time while someone else recites" is a
worse experience than a settled board with a moment of drama twice a day.

### e) Neutral statuses

`excused` and `irregular` mean *this class doesn't count for this student*. No
penalty, excluded from streaks, from show-up rate, and from every achievement
metric. They are neutral **everywhere** — if you add a new statistic, exclude
them too.

### f) Archive, don't delete

Deleting a student would orphan their history and silently change everyone else's
statistics. `archive_student` sets `archived_at`; they vanish from rosters and the
leaderboard but keep their record. A hard delete refuses unless the student is
already archived, and the app makes you type their name.

### g) Attendance status has exactly one door

Every status change goes through **`set_attendance_status`**. It reconciles the
points ledger — removing a penalty when you excuse someone, applying one when you
mark them absent.

A direct `.update({ status })` would change the letter on the screen and leave a
stale penalty in the ledger forever. The only exceptions are the live-session
upserts, where nothing has been committed yet.

### h) Time is a semester, a term, and a week

`src/lib/term.ts` converts dates into "week 9" and "midterm". It is **DB-driven
but synchronous**: `configureTermCalendar()` loads the real dates once, and every
function after that is a pure lookup. Term dates are *stored and editable*
because holidays move them — six-week arithmetic is only the seeded default.

### i) The QR code is a rotating HMAC

The projector shows a code that changes every 15 seconds. It encodes the session
id, a window number, and an HMAC of both signed with a secret only the instructor
can read. A screenshot forwarded to an absent friend stops working in under a
minute.

---

## 3. Walkthrough: the instructor awards points

The instructor opens a section, ticks four students, and taps `+3`.

```
[Students.tsx — tap avatars to tick, AwardBar slides up]
         │
         ▼
[AwardBar: "Award +3 to 4" — or "Deduct −5 from 4", in red,
 behind a ConfirmDialog if it's a bulk penalty]
         │
         ▼
[awardPoints({ studentIds, points: 3, category: 'recitation' })]
         │   src/lib/api/core.ts
         ▼
[INSERT INTO point_events — one row per student]
         │
         ├──▶ [trg_stamp_semester]  BEFORE INSERT
         │     fills semester_id from cp_active_semester_id()
         │
         ├──▶ [cp_recompute_points] AFTER INSERT
         │     rebuilds BOTH cached totals from the ledger
         │
         └──▶ [cp_notify_point_event] AFTER INSERT
               queues a notification row, then pg_net calls send-push
         │
         ▼
[Realtime: UPDATE on students → the student's WebSocket]
         │
         ▼
[StudentData.tsx: postgres_changes handler]
         │   translates lifetime_points → all_time_points
         │   calls considerLevelUp(semester_points)
         ▼
[Dashboard: XP bar animates, feed prepends, sound + haptic fire]
         │
         └─▶ if a level threshold was crossed: full-screen burst
```

Two details worth noticing:

- The **trigger stamps the semester**, not a column default. `awardPoints`
  inserts an explicit null, and a default is skipped on an explicit null.
- If the app is backgrounded, the client shows an OS notification instead of a
  toast — and the push arrives anyway, from the separate outbox.

---

## 4. Walkthrough: a student checks in

```
[Instructor: Attendance → pick subject → Start class]
         │
         ▼
[start_class_session RPC]
   · validates the section is in the ACTIVE semester
   · requires a subject only if the section HAS subjects assigned
     (a setup gap must never block a live class)
   · generates the QR secret, stored in class_session_secrets
         │
         ▼
[Projector: QR regenerating every 15 seconds]
         │
         │   Meanwhile, on the student's phone:
         │   class_sessions is in the realtime publication (0033),
         │   so LiveClassBanner appears the moment class starts.
         ▼
[Student taps "Scan now" → camera opens]
         │
         ▼
[qr.ts parsePayload() → { sessionId, windowIndex, code }]
         │
         ▼
[scan_attendance RPC]
   · are you a claimed, non-archived student?          → else reject
   · is the session active, and is it YOUR section?    → else reject
   · is the section in the ACTIVE semester?  (0035)    → else reject
   · is the window within ±1 of now?                   → else "expired"
   · recompute the HMAC and compare                    → else reject
   · already checked in? return that status, no-op
   · otherwise compute present / late / absent from elapsed minutes
         │
         ▼
[INSERT attendance_records ... ON CONFLICT DO NOTHING]
         │
         ▼
[Realtime → both screens: the instructor's roster and the student's history]
```

The `±1 window` tolerance is deliberate: "previous" absorbs scan latency,
"next" tolerates the projector's clock running slightly fast.

---

## 5. Walkthrough: checking in with no signal

The classroom wifi drops. This is the flow the design cares most about, because
the student did nothing wrong.

```
[Camera decodes the QR]
         │
         ▼
[enqueue() writes the proof to localStorage FIRST]     ◀── capture-first
         │                                                  cp_offline_scans_v1
         ▼
[Try scan_attendance over the network]
         │
    ┌────┴────────────────────────┐
    │                             │
[server answered]        [transport failed]
    │                             │
    ▼                             ▼
[dismiss() the queued     [KEEP the queued proof]
 proof — resolved]         "Saved — it'll sync"
                                  │
                                  ▼
             [on app start, on 'online', on Attendance mount:
              syncOfflineScans() replays the queue]
                                  │
                                  ▼
             [submit_offline_scan re-verifies the HMAC and
              computes status from the CAPTURE time, not now]
```

Three rules make this safe:

1. **Capture before network.** A crash mid-request can never lose the proof.
2. **A transport failure keeps the proof.** This is the load-bearing case in
   `offline-scans.test.ts` — the one test most worth not breaking.
3. **Status comes from when you scanned**, not when it synced. It also only ever
   *upgrades* (absent → late → present) and never overwrites excused or irregular.

---

## 6. Walkthrough: a student spends points

```
[UsePoints: catalog grid — unaffordable items greyed with "N more to go"]
         │
         ▼
[Tap an item → pre-fills request_point_redemption]
         │
         ▼
[request_point_redemption RPC]
   · SELECT students ... FOR UPDATE        ◀── lock the student row
   · available = semester_points − (pending requests)
   · refuse if it overspends
   · INSERT point_redemptions (status 'pending')
         │
         ▼
[Instructor: Requests → Points tab → Approve]
         │
         ▼
[decide_point_redemption RPC]
   · SELECT students ... FOR UPDATE        ◀── SAME lock order
   · re-check the balance (it may have changed)
   · INSERT a NEGATIVE point_events row (category 'redeem')
   · queue one richer notification
```

Both functions lock the **student row first**, in the same order, which is why
they cannot deadlock against each other. And because spending is just a negative
ledger row, it lowers XP, level and rank exactly like any other loss — that was a
deliberate decision, not a side effect.

---

## 7. Walkthrough: the semester rolls over

The most destructive operation in the app, and the one with the most guard rails.

```
[Semesters → Next semester → Create]           nothing changes for students yet
         │
         ▼
[Wizard step 1: sections]      names start blank — you type them
[Wizard step 2: subjects]      create new, or one-tap copy last semester's
[Wizard step 3: students]      tick who moves; everyone is ticked by default
         │                     ── each step COMMITS as you go, so the whole
         │                        wizard is resumable across days
         ▼
[Wizard step 4: pre-flight]
   BLOCK: a class is still live
   BLOCK: a redemption is pending    ← would debit the WRONG semester
   BLOCK: an excuse is pending
   BLOCK: the new semester has no sections
   WARN : penalties never committed
   WARN : students left unplaced     ← often deliberate; your call
         │
         ▼
[Type the semester name to confirm]
         │
         ▼
[set_active_semester RPC]
   · re-runs the BLOCKING checks server-side (a stale UI can't slip past)
   · two-step is_active flip — clear, then set
     (one UPDATE would violate the partial unique index mid-statement)
   · BULK RECOMPUTES semester_points for every student   ◀── the critical line
   · rebuilds the leaderboard snapshot
   · writes an audit row
```

**Why the bulk recompute is critical.** `cp_recompute_points` runs only when a
point row changes, and it computes against whatever semester is active *at that
moment*. It physically cannot notice that the semester itself changed. Without
those lines, every student would carry last semester's balance forward as their
new spendable points.

Students who weren't moved keep everything — points, badges, attendance record,
final rank — and become read-only. `scan_attendance` refuses their check-ins
server-side, and the app hides the scan button so they aren't walked into an
error.

---

## 8. How security actually works

**RLS is the boundary.** Every table has policies. The client's anon key grants
nothing by itself; what you can see depends on the JWT you carry.

```
Student JWT  → can read: own row, own attendance, own notifications,
                         public profiles, the leaderboard snapshot
             → can write: nothing directly. Only through RPCs.

Instructor JWT (email in `instructors`)
             → can read/write rosters, sessions, points, decisions

Service role → never present in the browser. Lives in Supabase Vault and in
               edge function secrets.
```

**The unauthenticated surface is two edge functions**, and they are the ones
hardened hardest:

- Claim tokens are 16 hex characters (64 bits of entropy).
- Per-IP rate limit: 30 failures per 15 minutes — generous because a whole class
  shares one NAT address.
- Error messages are **uniform**: "not valid **or** already used" so a guesser
  can't distinguish a real token from a spent one.
- Every attempt is logged to `auth_events`, which is simultaneously the audit
  trail and the rate-limit counter.
- All of it **fails open** on infrastructure errors. A logging outage must never
  stop a real student from claiming their account.

**`send-push` rejects anything that isn't the service role.** The API gateway's
`verify_jwt` is satisfied by *any* valid token, including a student's — so
gateway auth alone would have let any signed-in student send push notifications.

---

## 9. Realtime, and the rule that keeps it working

Each student holds **one durable channel**, `student-self-<id>`, carrying every
subscription they need: their own row, their attendance records, their point
events, their leaderboard rank, notifications, achievements, and their section's
class sessions.

Two rules, both learned the hard way:

**Never key a channel effect on an object.** Depend on the stable *id*.

```js
// WRONG — setMe runs on every award, so this tears down and re-subscribes
// the same topic constantly. removeChannel races the new subscribe, the
// channel dies, and only a page refresh brings points back.
useEffect(() => { /* subscribe */ }, [me])

// RIGHT
const studentId = me?.id
useEffect(() => { /* subscribe */ }, [studentId])
```

**Page-scoped channels must use `uniqueChannel()`.** Plain `supabase.channel(topic)`
returns an *existing* channel for a repeated topic, and calling `.on()` after
that channel has subscribed throws. This bites whenever a component mounts twice
— notably anything in the Shell's `actions` slot, which renders in both the
desktop sidebar and the mobile header.

Which is also why **a component in `actions` must never own a subscription**.
Hoist the state to the layout, which mounts once, and pass it down.

---

## 10. Traps this codebase has already fallen into

Each of these was a real bug. They're recorded so nobody rediscovers them.

**PostgREST truncates at 1000 rows, silently.** No error, no flag — just a short
array. A two-subject section crosses it in `attendance_records` around week 12,
which meant attendance statistics on the screen used for academic decisions were
quietly wrong. Fixed by moving tallies into SQL aggregates and paging the true
row matrices with `fetchAllPages`.

**Ticked students survived a section switch.** The award bar stayed docked over a
*different* roster and awarded the previous section's student ids, with nothing
on screen showing it. Selection is now cleared on every section change.

**Two migrations owning one function.** If a function's return type changes,
`create or replace` cannot do it — and two migrations both recreating it clash on
re-run with `ERROR 42P13`. Every function has exactly **one owning migration**;
changing a signature means `drop function if exists` first, then recreating its
dependents, then re-granting.

**A `RETURNS TABLE` column named `count`.** The OUT column is a plpgsql variable,
so it shadows the aggregate and `count(*)` stops parsing as a function call.

**A loop variable named `id`.** `where students.id = id` becomes a
self-comparison that matches *every row*. In a bulk promote or archive, that is
the entire student table.

**Timestamps compared against dates.** `started_at` is `timestamptz`; term bounds
are plain dates. A naive comparison casts at the server's timezone (UTC) and
pushes a 7am Manila class out of its own term. Compare
`(started_at at time zone 'Asia/Manila')::date`.

**A filter in the wrong place in a LEFT JOIN.** Putting the term filter in the
`WHERE` clause instead of inside the joined subquery drops any student with no
classes that term — which is precisely the row the instructor needed to see.

**Students saw "you have no record" on a failed fetch.** An empty array from a
network error rendered identically to genuinely having nothing. Every student
screen now distinguishes empty from broken, and offers a retry.

**pg_net is fire-and-forget.** `http_post` returns immediately and tells you
nothing about delivery. Never mark push work "sent" from SQL — only the
`send-push` edge function transitions `notifications.push_status`.

---

## Where to go next

- **Change something?** Read [CLAUDE.md](CLAUDE.md) first — it holds the
  conventions, the migration workflow, and the decisions that are *not* open for
  revisiting (the leveling curve, most notably).
- **Look something up?** [README.md](README.md) has the migration ledger, the
  route table and the module inventory.
- **Trust something?** Read the SQL. It is the only layer that enforces anything.
