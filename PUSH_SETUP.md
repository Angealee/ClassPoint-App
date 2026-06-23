# Notifications — how they work & how to finish setup

ClassPoint notifies students through **two paths**. The first works right now;
the second needs a one-time server deploy.

| Situation                                   | What fires                                  | Needs server? |
| ------------------------------------------- | ------------------------------------------- | ------------- |
| App **open** (looking at it)                | In-app toast + sound + vibration, live      | No            |
| App **backgrounded but still running**      | System pop-up (OS sound/vibration)          | No\*          |
| App **fully closed / phone locked**         | **Web Push** system notification            | **Yes**       |

\* The backgrounded pop-up uses the browser's Notification API from the live
page, so it only works while the OS hasn't suspended the app yet (seconds to a
few minutes on phones, indefinitely on a desktop PWA). For a guarantee when the
app is **completely closed**, you need Web Push — that's the deploy below.

## Live scores

The student dashboard subscribes to Supabase Realtime (`students` +
`point_events`). Points, level-ups, and rank changes update instantly with no
polling, and the dashboard shows a pulsing **"Live"** badge while connected. It
resyncs automatically when the tab regains focus or the connection drops, so a
score is never stale.

## Sounds

Files live in `public/sounds/` and are mapped in `src/lib/sound.ts`:

- points → `tuturu-notif.mp3`
- level up → `levelup.mp3`
- rank change → `leaderboard.mp3`
- deductions → synthesized falling tone (no file by design)

Custom sounds only play **in-app**. Background Web Push uses the device's
default notification sound — the OS does not let a web app pick the sound for a
lock-screen notification.

## Finishing Web Push (the "app fully closed" path)

A VAPID key pair is already generated. The **public** key is in `.env`
(`VITE_VAPID_PUBLIC_KEY`); the **private** key and copy-paste commands are in
`push-secrets.local` (gitignored). Run the steps there, summarized:

1. `npx supabase login` then `npx supabase link --project-ref cxfxstazlwjijozkglgx`
2. `npx supabase db push` — applies migrations, incl. `0008_push_notifications.sql`
   (the `push_subscriptions` table + the DB→Edge triggers). Skip if already applied.
3. `npx supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=…`
   then `npx supabase functions deploy send-push`
4. In the SQL editor, set `app.settings.edge_url` and `app.settings.service_key`
   (service-role key from Dashboard → Settings → API), then reconnect.
5. Redeploy the web app so the new `VITE_VAPID_PUBLIC_KEY` ships. In the app:
   **Profile → Push to this device → Turn on**, and allow the prompt.

### Platform notes (important)

- **iPhone/iPad:** Web Push only reaches a PWA **added to the Home Screen**
  (iOS 16.4+) — never a normal Safari tab. There's also **no JavaScript
  vibration** on iOS, so the in-app "Vibration" toggle is hidden there; iPhones
  still buzz for Web Push because the system handles it.
- **Android:** full support (Chrome/Edge/Firefox), foreground and background.
- Everything **degrades gracefully** — if push isn't set up or is blocked, the
  in-app notifications keep working.

### Quick test (no waiting for a real award)

See the `curl` snippet at the bottom of `push-secrets.local`. A `200` with
`{"sent":N}` where N≥1 means a device received it. `{"sent":0}` means no device
has subscribed yet (do step 5 on the actual phone first).
