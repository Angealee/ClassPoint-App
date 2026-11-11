
export type ToneName =
  | 'success'
  | 'warn'
  | 'danger'
  | 'info'
  | 'reward'
  | 'accent'
  | 'neutral'

export interface ToneClasses {
  chip: string
  dot: string
  solid: string
  text: string
}

export const TONE: Record<ToneName, ToneClasses> = {
  success: {
    chip: 'bg-success-solid/10 text-success',
    dot: 'bg-success-solid',
    solid: 'bg-success-solid text-white',
    text: 'text-success',
  },
  warn: {
    chip: 'bg-warn-solid/15 text-warn',
    dot: 'bg-warn-solid',
    solid: 'bg-warn-solid text-brand-950',
    text: 'text-warn',
  },
  danger: {
    chip: 'bg-danger-solid/10 text-danger',
    dot: 'bg-danger-solid',
    solid: 'bg-danger-solid text-white',
    text: 'text-danger',
  },
  info: {
    chip: 'bg-info-solid/10 text-info',
    dot: 'bg-info-solid',
    solid: 'bg-info-solid text-white',
    text: 'text-info',
  },
  reward: {
    chip: 'bg-reward-solid/15 text-reward',
    dot: 'bg-reward-solid',
    solid: 'bg-reward-solid text-brand-950',
    text: 'text-reward',
  },
  accent: {
    chip: 'bg-accent-solid/10 text-accent',
    dot: 'bg-accent-solid',
    solid: 'bg-accent-solid text-white',
    text: 'text-accent',
  },
  neutral: {
    chip: 'bg-card-2 text-muted',
    dot: 'bg-muted',
    solid: 'bg-muted text-canvas',
    text: 'text-muted',
  },
}
