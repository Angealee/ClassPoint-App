import type { DayPart } from './time-of-day'

/**
 * The one line under the Home greeting. It reacts to what is actually true about
 * the student (rank, then streak) and falls back to a tagline for the hour.
 * "Points to the next level or rank" is NOT here on purpose: the hero shows the level
 * gap and the rank card carries the rank gap, so saying it here is noise.
 */
export function homeMessage(input: {
  rank: number | null
  streak: number | null
  part: DayPart
}): string {
  const { rank, streak, part } = input
  if (rank === 1) return 'Ikaw ang #1. Ingat sa trono.'
  if (rank !== null && rank <= 3) return 'Nasa podium ka. Konting push pa.'
  if (rank !== null && rank <= 10) return 'Top 10 ka na!'
  if (streak !== null && streak >= 3) return `${streak} classes in a row. Ayos!`
  switch (part) {
    case 'dawn':
      return 'Maaga ka ngayon. Solid.'
    case 'day':
      return 'Grind lang, kaya mo yan.'
    case 'dusk':
      return 'Konting hataw bago matapos ang araw.'
    case 'night':
      return 'Pahinga rin paminsan, ha.'
  }
}
