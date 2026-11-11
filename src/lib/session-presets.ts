
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

export function loadPresets(): SessionPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
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
  }
  return list
}

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
