
const BASE_REQUIREMENT = 50
const GROWTH = 1.5

const requirementCache: number[] = [BASE_REQUIREMENT] // index 0 => requirement to clear level 1

export function requirementForLevel(level: number): number {
  const index = Math.max(1, Math.floor(level)) - 1
  for (let i = requirementCache.length; i <= index; i++) {
    requirementCache[i] = Math.round(requirementCache[i - 1] * GROWTH)
  }
  return requirementCache[index]
}

export interface LevelProgress {
  /** Current level (1-based). */
  level: number
  /** Total lifetime EXP (= lifetime points). */
  totalExp: number
  /** EXP accumulated within the current level. */
  expIntoLevel: number
  /** EXP needed to clear the current level. */
  expForLevel: number
  /** EXP remaining until the next level-up. */
  expToNext: number
  /** Progress through the current level, 0–100. */
  progressPct: number
}

export function getLevelProgress(totalExp: number): LevelProgress {
  let level = 1
  let remaining = Math.max(0, Math.floor(totalExp))

  while (remaining >= requirementForLevel(level)) {
    remaining -= requirementForLevel(level)
    level++
  }

  const expForLevel = requirementForLevel(level)
  return {
    level,
    totalExp: Math.max(0, Math.floor(totalExp)),
    expIntoLevel: remaining,
    expForLevel,
    expToNext: expForLevel - remaining,
    progressPct: expForLevel === 0 ? 0 : Math.min(100, (remaining / expForLevel) * 100),
  }
}
