import type { PeerScaleOption } from '@/lib/types'

export const SCALE_MIN_OPTIONS = 2
export const SCALE_MAX_OPTIONS = 10
export const SCALE_LABEL_MAX = 40
export const SCALE_VALUE_MIN = 0
export const SCALE_VALUE_MAX = 100

export const SCALE_PRESETS: { key: string; name: string; scale: PeerScaleOption[] }[] = [
  {
    key: 'five',
    name: '1 to 5 · Poor to Excellent',
    scale: [
      { value: 1, label: 'Poor' },
      { value: 2, label: 'Fair' },
      { value: 3, label: 'Good' },
      { value: 4, label: 'Very good' },
      { value: 5, label: 'Excellent' },
    ],
  },
  {
    key: 'ten',
    name: '1 to 10',
    scale: Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
  },
  {
    key: 'yesno',
    name: 'Yes or no',
    scale: [
      { value: 0, label: 'No' },
      { value: 1, label: 'Yes' },
    ],
  },
  {
    key: 'agree',
    name: 'Disagree to agree',
    scale: [
      { value: 1, label: 'Strongly disagree' },
      { value: 2, label: 'Disagree' },
      { value: 3, label: 'Neutral' },
      { value: 4, label: 'Agree' },
      { value: 5, label: 'Strongly agree' },
    ],
  },
]

export function scaleError(scale: PeerScaleOption[]): string | null {
  if (!Array.isArray(scale)) return 'A rating scale must be a list of options.'
  if (scale.length < SCALE_MIN_OPTIONS || scale.length > SCALE_MAX_OPTIONS) {
    return `A rating scale needs between ${SCALE_MIN_OPTIONS} and ${SCALE_MAX_OPTIONS} options.`
  }

  let prev: number | null = null
  for (const opt of scale) {
    if (!Number.isInteger(opt?.value)) return 'Every scale option needs a numeric value.'
    const label = (opt.label ?? '').trim()
    if (label.length === 0) return 'Every scale option needs a label.'
    if (label.length > SCALE_LABEL_MAX) {
      return `A scale label is at most ${SCALE_LABEL_MAX} characters.`
    }
    if (opt.value < SCALE_VALUE_MIN || opt.value > SCALE_VALUE_MAX) {
      return `Scale values must be between ${SCALE_VALUE_MIN} and ${SCALE_VALUE_MAX}.`
    }
    if (prev !== null && opt.value <= prev) return 'Scale values must go up, with no repeats.'
    prev = opt.value
  }

  return null
}

export function normalizeScale(scale: PeerScaleOption[]): PeerScaleOption[] {
  return scale.map((o) => ({ value: o.value, label: (o.label ?? '').trim() }))
}

export function isOnScale(scale: PeerScaleOption[], score: number): boolean {
  return scale.some((o) => o.value === score)
}

export function percentOf(scale: PeerScaleOption[], avg: number | null): number | null {
  if (avg === null || !Array.isArray(scale) || scale.length < 2) return null
  const lo = scale[0].value
  const hi = scale[scale.length - 1].value
  if (hi <= lo) return null
  return ((avg - lo) / (hi - lo)) * 100
}

export function roundTo(value: number, places: number): number {
  const f = 10 ** places
  return Math.round(value * f) / f
}

export function describeOption(scale: PeerScaleOption[], value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const opt = scale.find((o) => o.value === value)
  if (!opt) return null
  const label = opt.label.trim()
  if (label === String(opt.value)) return label
  const wordLabels = scale.some((o) => o.label.trim() !== String(o.value))
  if (wordLabels && scale.length === 2) return label
  return `${opt.value} · ${label}`
}
