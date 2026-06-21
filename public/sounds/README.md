# ClassPoint sound effects

Drop your audio files here. The app references these exact names (see
`src/lib/sound.ts`). Any file that's missing simply plays nothing — the toast
still shows — so you can add them one at a time.

| File          | Plays when…                                  |
| ------------- | -------------------------------------------- |
| `point.mp3`   | the student **gains** points                 |
| `deduct.mp3`  | points are **deducted** (penalty / negative) |
| `levelup.mp3` | the student **levels up**                     |
| `rank.mp3`    | the student's **leaderboard rank changes**    |

Tips
- Short clips (≈0.3–1.5 s) feel best for frequent events like points.
- `.mp3` is the safest cross-browser format; `.ogg`/`.wav` also work if you
  update the filenames in `src/lib/sound.ts`.
- Keep them small (a few KB–tens of KB) so they load instantly on mobile.
