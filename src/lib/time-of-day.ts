export type DayPart = 'dawn' | 'day' | 'dusk' | 'night'

/**
 * Which part of the day an hour (0-23) belongs to. One definition, used by the
 * Home scene for BOTH the sky and the greeting so they can never disagree.
 * 5-8 dawn, 8-16 day, 16-19 dusk, everything else night.
 */
export function dayPart(hour: number): DayPart {
  const h = ((Math.floor(hour) % 24) + 24) % 24
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 16) return 'day'
  if (h >= 16 && h < 19) return 'dusk'
  return 'night'
}

/** The Filipino greeting for the hour: umaga / tanghali / hapon / gabi. */
export function greetingFor(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24
  if (h >= 5 && h < 11) return 'Magandang umaga'
  if (h >= 11 && h < 13) return 'Magandang tanghali'
  if (h >= 13 && h < 18) return 'Magandang hapon'
  return 'Magandang gabi'
}
