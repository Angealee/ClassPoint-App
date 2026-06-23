# ClassPoint sound effects

Audio files for in-app events. The app maps each event to a file in
`src/lib/sound.ts`. If a file is **missing**, the app falls back to a short
*synthesized* chime (Web Audio), so sound always works — drop in a file to
override the synth.

| Event                          | File                  |
| ------------------------------ | --------------------- |
| Student **gains** points       | `tuturu-notif.mp3`    |
| Points **deducted** (penalty)  | _(none — synth tone)_ |
| Student **levels up**          | `levelup.mp3`         |
| Leaderboard **rank changes**   | `leaderboard.mp3`     |

Tips
- Short clips (≈0.3–1.5 s) feel best for frequent events like points.
- `.mp3` is the safest cross-browser format.
- Keep them small so they load instantly on mobile (`levelup.mp3` is ~870 KB —
  consider trimming it for slower phones).
- To change which file an event uses, edit `SOUND_FILES` in `src/lib/sound.ts`.
