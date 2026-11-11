import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type CardPad = 'none' | 'tight' | 'default' | 'roomy'

type CardElevation = 'flat' | 'raised' | 'floating'

const ELEVATIONS: Record<CardElevation, string> = {
  flat: 'shadow-sm shadow-black/5 dark:shadow-black/30',
  raised: 'cp-elev-2 cp-lit',
  floating: 'cp-elev-3 cp-lit',
}

const PADS: Record<CardPad, string> = {
  none: '',
  tight: 'p-3',
  default: 'p-4',
  roomy: 'p-5',
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  pad?: CardPad
  interactive?: boolean
  elevation?: CardElevation
}

export function Card({
  className,
  pad = 'default',
  interactive,
  elevation = 'flat',
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'theme-transition rounded-2xl border border-line bg-card',
        ELEVATIONS[elevation],
        PADS[pad],
        interactive &&
          'cursor-pointer transition-[background-color,transform] hover:bg-card-2 active:scale-[0.99]',
        className,
      )}
      {...props}
    />
  )
}

export function Rows({ className, ...props }: Omit<CardProps, 'pad'>) {
  return <Card pad="none" className={cn('divide-y divide-line', className)} {...props} />
}
