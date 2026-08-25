/**
 * Saved class-session settings.
 *
 * Deliberately localStorage, not a table. There is exactly one instructor, the
 * values are a personal convenience rather than shared data, and a preset lost
 * when the browser is cleared costs seconds to recreate — none of which
 * justifies a migration, an RLS policy and a round trip before every class.
 *
 * The subject and topic are NOT part of a preset: those change every session,
 * while the thresholds and penalties are the thing you set once and reuse.
 */

const KEY = 'cp_session_presets_v1'
const MAX = 6

export interface SessionPreset {
  id: string
  name: string
  lateAfterMin: number
  absentAfterMin: number
  latePenalty: number
  absentPenalty: number
  applyPenalties: boolean
}

/** Every saved preset, oldest first. Never throws — a broken store reads empty. */
export function loadPresets(): SessionPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    // Validate shape rather than trusting the store: a half-written or
    // hand-edited entry would otherwise put NaN into a live session's config.
    return raw.filter(
      (p): p is SessionPreset =>
        !!p &&
        typeof p.id === 'string' &&
        typeof p.name === 'string' &&
        Number.isFinite(p.lateAfterMin) &&
        Number.isFinite(p.absentAfterMin) &&
        Number.isFinite(p.latePenalty) &&
        Number.isFinite(p.absentPenalty) &&
        typeof p.applyPenalties === 'boolean',
    )
  } catch {
    return []
  }
}

function persist(list: SessionPreset[]): SessionPreset[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable (private mode) — the in-memory list still works */
  }
  return list
}

/**
 * Save a preset under `name`, replacing any existing one with that name so
 * re-saving is an update rather than a duplicate. Oldest is dropped past MAX.
 */
export function savePreset(preset: Omit<SessionPreset, 'id'>): SessionPreset[] {
  const name = preset.name.trim()
  if (!name) return loadPresets()
  const rest = loadPresets().filter((p) => p.name.toLowerCase() !== name.toLowerCase())
  const next = [...rest, { ...preset, name, id: crypto.randomUUID() }]
  return persist(next.slice(-MAX))
}

export function deletePreset(id: string): SessionPreset[] {
  return persist(loadPresets().filter((p) => p.id !== id))
}
