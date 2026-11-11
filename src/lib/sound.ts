
export type SoundKey = 'point' | 'deduct' | 'levelup' | 'rank'

const SOUND_FILES: Record<SoundKey, string> = {
  point: '/sounds/tuturu-notif.mp3',
  deduct: '/sounds/deduct.mp3',
  levelup: '/sounds/levelup.mp3',
  rank: '/sounds/leaderboard.mp3',
}

const MUTE_KEY = 'cp_sound_muted'

const LAZY: ReadonlySet<SoundKey> = new Set<SoundKey>(['levelup'])

const SILENCE =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

const cache = new Map<SoundKey, HTMLAudioElement>()
const failed = new Set<SoundKey>()
let unlocked = false

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
    audio.addEventListener('error', () => {
      if (!lazy || audio.dataset.real === '1') failed.add(key)
    })
    cache.set(key, audio)
    el = audio
  }
  return el
}

function attachReal(key: SoundKey, el: HTMLAudioElement): void {
  if (!LAZY.has(key) || el.dataset.real === '1') return
  el.dataset.real = '1'
  el.src = SOUND_FILES[key]
  el.preload = 'auto'
  el.load()
}

export function initSound(): void {
  if (unlocked || typeof window === 'undefined') return
  const unlock = () => {
    if (unlocked) return
    unlocked = true
    void getCtx()?.resume().catch(() => {})
    // Prime each clip so the first real play() isn't blocked.
    for (const key of Object.keys(SOUND_FILES) as SoundKey[]) {
      const el = getAudio(key)
      if (!el) continue
      const prevMuted = el.muted
      el.muted = true
      el.play()
        .then(() => {
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

export function playSound(key: SoundKey): void {
  if (isMuted()) return
  const el = getAudio(key)
  if (!el || failed.has(key)) {
    synth(key)
    return
  }
  try {
    attachReal(key, el)
    el.currentTime = 0
    void el.play().catch(() => {
      if (failed.has(key) || el.error) synth(key)
    })
  } catch {
    synth(key)
  }
}
