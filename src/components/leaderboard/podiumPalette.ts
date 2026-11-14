/*
 * The space podium's literals, shared by the live podium, the share image and the empty
 * board so a screenshot, the app and the day-one screen cannot drift apart. Every value is a
 * literal on purpose: these are fixed dark objects that do not follow the theme.
 */
export type Place = 1 | 2 | 3

export const SKY = '#090912'

export interface Body {
  cardTop: string
  cardBot: string
  border: string
  standTop: string
  standBot: string
  ink: string
  foil: string
  foilRest: number
  foilHot: number
}

export const BODY: Record<Place, Body> = {
  1: {
    cardTop: '#2b1d08',
    cardBot: '#13100b',
    border: 'rgba(255,209,102,0.6)',
    standTop: '#4a3410',
    standBot: '#1d1508',
    ink: '#ffd166',
    foil: 'linear-gradient(115deg, rgba(255,209,102,0) 16%, rgba(255,140,190,0.5) 36%, rgba(140,225,255,0.5) 56%, rgba(255,209,102,0) 78%)',
    foilRest: 0.4,
    foilHot: 0.85,
  },
  2: {
    cardTop: '#171b36',
    cardBot: '#0f1020',
    border: 'rgba(170,179,255,0.5)',
    standTop: '#262b57',
    standBot: '#111329',
    ink: '#aab3ff',
    foil: 'linear-gradient(115deg, rgba(170,179,255,0) 20%, rgba(200,208,255,0.55) 42%, rgba(120,230,255,0.4) 58%, rgba(170,179,255,0) 80%)',
    foilRest: 0.3,
    foilHot: 0.7,
  },
  3: {
    cardTop: '#10231f',
    cardBot: '#0b1514',
    border: 'rgba(159,227,214,0.45)',
    standTop: '#1b3a35',
    standBot: '#0d1a18',
    ink: '#9fe3d6',
    foil: 'linear-gradient(115deg, rgba(159,227,214,0) 30%, rgba(214,246,240,0.24) 50%, rgba(159,227,214,0) 70%)',
    foilRest: 0.22,
    foilHot: 0.45,
  },
}

/** Riser heights (Tailwind classes) so the empty board stands the same way the live one does. */
export const RISER_H: Record<Place, string> = {
  1: 'h-14 sm:h-20',
  2: 'h-10 sm:h-12',
  3: 'h-7 sm:h-8',
}
