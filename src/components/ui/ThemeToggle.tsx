import { motion } from 'framer-motion'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/cn'

/** Sun/moon theme switch with a sliding knob. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      aria-pressed={isDark}
      className={cn(
        'relative inline-flex h-9 w-16 items-center rounded-full border border-line',
        'bg-card-2 px-1 transition-colors',
        className,
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full text-sm shadow-sm',
          isDark ? 'ml-auto bg-brand-500 text-white' : 'mr-auto bg-gold-400 text-brand-950',
        )}
      >
        {isDark ? '🌙' : '☀️'}
      </motion.span>
    </button>
  )
}
