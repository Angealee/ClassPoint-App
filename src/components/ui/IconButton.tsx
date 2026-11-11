import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

type IconButtonSize = 'sm' | 'md' | 'lg'
type IconButtonVariant = 'ghost' | 'outline' | 'danger' | 'accent' | 'solid'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string
  icon: ReactNode
  size?: IconButtonSize
  variant?: IconButtonVariant
  /** Circular rather than rounded-square. */
  round?: boolean
  expandHitArea?: boolean
}

const SIZES: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
}

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: 'text-muted hover:bg-card-2 hover:text-ink',
  outline: 'border border-line text-muted hover:text-ink',
  danger: 'text-muted hover:bg-danger-solid/10 hover:text-danger',
  accent: 'text-accent hover:bg-accent-solid/10',
  solid: 'bg-accent-solid text-white hover:brightness-110',
}

export function IconButton({
  label,
  icon,
  size = 'md',
  variant = 'ghost',
  round = false,
  expandHitArea = true,
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        'transition-colors active:scale-95',
        'disabled:pointer-events-none disabled:opacity-50',
        round ? 'rounded-full' : 'rounded-lg',
        SIZES[size],
        VARIANTS[variant],
        expandHitArea && size !== 'lg' && 'cp-tap-44',
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  )
}
