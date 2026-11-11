/**
 * ClassPoint · tiny sound-effects player.
 *
 * Plays short audio clips for in-app events (point gained / deducted, level up,
 * rank change). Designed to be safe and silent-by-default:
 *
 *  - Browsers block audio until the user has interacted with the page once, so
 *    we "unlock" on the first pointer/key/touch and preload the small clips. The
 *    large one (`levelup`) is unlocked with a silent placeholder and fetched on
 *    first use — see LAZY below.
 *  - If a file is missing or playback is rejected, we no-op (never throw) — the
 *    visual toast still carries the message.
 *  - A per-user mute flag is persisted in localStorage so students can silence
 *    the app without losing the toasts.
 *  - If an `.mp3` file is missing, we fall back to a short *synthesized* chime
 *    via the Web Audio API, so sound works out of the box. Drop nicer clips
 *    into `public/sounds/` (see SOUND_FILES below) to override the synth.
 */

export type SoundKey = 'point' | 'deduct' | 'levelup' | 'rank'

/**
 * Maps each event to a file under `public/sounds/`. Swap these names freely.
 * `deduct` has no shipped clip on purpose — it uses the synth fallback (a soft
 * falling tone), which suits a penalty better than a cheery chime.
 */
const SOUND_FILES: Record<SoundKey, string> = {
  point: '/sounds/tuturu-notif.mp3',
  deduct: '/sounds/deduct.mp3',
  levelup: '/sounds/levelup.mp3',
  rank: '/sounds/leaderboard.mp3',
}

const MUTE_KEY = 'cp_sound_muted'

/**
 * Clips too large to be worth fetching on the first tap.
 *
 * `levelup.mp3` is 888KB — about forty times the other clips combined — and the
 * unlock below used to prime EVERY clip with a muted `play()` on the first tap
 * anywhere in the app, which made each student's phone download it whether or
 * not they ever levelled up. (It is not precached by the service worker, so this
 * was a real network cost on every cold launch.)
 *
 * A lazy clip is unlocked with a tiny SILENT clip instead, and its real file is
 * attached the first time it is actually played.
 *
 * ⚠ IT HAS TO BE THE SAME ELEMENT. iOS Safari lets an audio element play only
 *   once that element has been started inside a user gesture, so creating the
 *   element later — at the moment of the level-up, which is not a gesture —
 *   would leave the sound silently blocked on exactly the phones most students
 *   have. Changing `src` on an element that was already unlocked keeps it
 *   unlocked, which is the whole trick.
 *
 * The cost is that the FIRST level-up plays a moment late on a slow connection,
 * while the file arrives. That was the instructor's call (2026-11-09) against
 * re-encoding the clip, which would have changed how it sounds.
 */
const LAZY: ReadonlySet<SoundKey> = new Set<SoundKey>(['levelup'])

/** A valid, empty WAV — 44 bytes of header. Enough to unlock an element. */
const SILENCE =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

const cache = new Map<SoundKey, HTMLAudioElement>()
/** Keys whose mp3 failed to load — they use the synthesized fallback instead. */
const failed = new Set<SoundKey>()
let unlocked = false

// ── Web Audio fallback ───────────────────────────────────────────────────────
// A shared AudioContext synthesizes a short chime when the mp3 is missing.
let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) {
    try {
      audioCtx = new Ctor()
    } catch {
      return null
    }
  }
  return audioCtx
}

/** Note sequences (Hz + seconds) per event — the synth's voice for each cue. */
const TONES: Record<SoundKey, { freq: number; dur: number }[]> = {
  point: [
    { freq: 880, dur: 0.1 },
    { freq: 1320, dur: 0.12 },
  ], // bright rising chirp
  deduct: [
    { freq: 440, dur: 0.12 },
    { freq: 311, dur: 0.16 },
  ], // soft falling tone
  levelup: [
    { freq: 660, dur: 0.11 },
    { freq: 880, dur: 0.11 },
    { freq: 1320, dur: 0.22 },
  ], // little fanfare
  rank: [
    { freq: 988, dur: 0.09 },
    { freq: 1245, dur: 0.16 },
  ], // two-note ping
}

/** Play a synthesized chime for the key. No-ops if Web Audio is unavailable. */
function synth(key: SoundKey): void {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  const peak = key === 'levelup' ? 0.18 : 0.12
  let t = ctx.currentTime
  for (const note of TONES[key]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(note.freq, t)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + note.dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + note.dur + 0.02)
    t += note.dur
  }
}

function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

/** Read/persist the user's mute preference. */
export function getSoundMuted(): boolean {
  return isMuted()
}
export function setSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* storage unavailable — ignore */
  }
}

function getAudio(key: SoundKey): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null
  let el = cache.get(key)
  if (!el) {
    const lazy = LAZY.has(key)
    const audio = new Audio(lazy ? SILENCE : SOUND_FILES[key])
    audio.preload = lazy ? 'none' : 'auto'
    audio.volume = key === 'levelup' ? 0.9 : 0.7
    // If the file can't be loaded (e.g. not shipped), remember it and use the
    // synthesized fallback from then on. A lazy clip is only "missing" once its
    // REAL file has been attached — the silent placeholder cannot fail.
    audio.addEventListener('error', () => {
      if (!lazy || audio.dataset.real === '1') failed.add(key)
    })
    cache.set(key, audio)
    el = audio
  }
  return el
}

/** Attach a lazy clip's real file, once, the first time it is wanted. */
function attachReal(key: SoundKey, el: HTMLAudioElement): void {
  if (!LAZY.has(key) || el.dataset.real === '1') return
  el.dataset.real = '1'
  el.src = SOUND_FILES[key]
  el.preload = 'auto'
  el.load()
}

/**
 * Unlock audio playback on the first user gesture. Some browsers also need the
 * elements "primed" by a muted play() during the gesture; we do that quietly.
 * Safe to call multiple times — it only runs once.
 */
export function initSound(): void {
  if (unlocked || typeof window === 'undefined') return
  const unlock = () => {
    if (unlocked) return
    unlocked = true
    // Resume the Web Audio context (the synth fallback) within the gesture.
    void getCtx()?.resume().catch(() => {})
    // Prime each clip so the first real play() isn't blocked.
    for (const key of Object.keys(SOUND_FILES) as SoundKey[]) {
      const el = getAudio(key)
      if (!el) continue
      const prevMuted = el.muted
      el.muted = true
      el.play()
        .then(() => {
          // A lazy clip may have had its real file attached while this was in
          // flight (a level-up in the first moments after the first tap). Do not
          // pause that — it is meant to be playing.
          if (el.dataset.real !== '1') {
            el.pause()
            el.currentTime = 0
          }
          el.muted = prevMuted
        })
        .catch(() => {
          el.muted = prevMuted
        })
    }
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    window.removeEventListener('touchstart', unlock)
  }
  window.addEventListener('pointerdown', unlock, { once: false })
  window.addEventListener('keydown', unlock, { once: false })
  window.addEventListener('touchstart', unlock, { once: false })
}

/** Play a sound effect. No-ops if muted; falls back to a synth chime if the
 * mp3 is missing or playback is blocked. */
export function playSound(key: SoundKey): void {
  if (isMuted()) return
  const el = getAudio(key)
  // No <audio> support, or this clip already failed to load → synthesize.
  if (!el || failed.has(key)) {
    synth(key)
    return
  }
  try {
    attachReal(key, el)
    el.currentTime = 0
    // play() rejects if the file can't load or autoplay is still blocked. Only
    // synthesize when the file genuinely failed (el.error is set on a load
    // failure but null when merely autoplay-blocked, where synth no-ops too).
    void el.play().catch(() => {
      if (failed.has(key) || el.error) synth(key)
    })
  } catch {
    synth(key)
  }
}
