/**
 * ClassPoint · tiny sound-effects player.
 *
 * Plays short audio clips for in-app events (point gained / deducted, level up,
 * rank change). Designed to be safe and silent-by-default:
 *
 *  - Browsers block audio until the user has interacted with the page once, so
 *    we "unlock" on the first pointer/key/touch and lazily preload the clips.
 *  - If a file is missing or playback is rejected, we no-op (never throw) — the
 *    visual toast still carries the message.
 *  - A per-user mute flag is persisted in localStorage so students can silence
 *    the app without losing the toasts.
 *
 * Drop the actual audio files into `public/sounds/` (see SOUND_FILES below).
 * Any missing file simply plays nothing.
 */

export type SoundKey = 'point' | 'deduct' | 'levelup' | 'rank'

/** Maps each event to a file under `public/sounds/`. Swap these names freely. */
const SOUND_FILES: Record<SoundKey, string> = {
  point: '/sounds/point.mp3',
  deduct: '/sounds/deduct.mp3',
  levelup: '/sounds/levelup.mp3',
  rank: '/sounds/rank.mp3',
}

const MUTE_KEY = 'cp_sound_muted'

const cache = new Map<SoundKey, HTMLAudioElement>()
let unlocked = false

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
    el = new Audio(SOUND_FILES[key])
    el.preload = 'auto'
    el.volume = key === 'levelup' ? 0.9 : 0.7
    cache.set(key, el)
  }
  return el
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
    // Prime each clip so the first real play() isn't blocked.
    for (const key of Object.keys(SOUND_FILES) as SoundKey[]) {
      const el = getAudio(key)
      if (!el) continue
      const prevMuted = el.muted
      el.muted = true
      el.play()
        .then(() => {
          el.pause()
          el.currentTime = 0
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

/** Play a sound effect. No-ops if muted, locked, missing, or blocked. */
export function playSound(key: SoundKey): void {
  if (isMuted()) return
  const el = getAudio(key)
  if (!el) return
  try {
    el.currentTime = 0
    // play() returns a promise that rejects if autoplay is still blocked.
    void el.play().catch(() => {})
  } catch {
    /* ignore */
  }
}
