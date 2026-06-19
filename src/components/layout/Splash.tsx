import { motion } from 'framer-motion'
import { Logo } from '@/components/ui/Logo'

/** Full-screen loading state shown while auth resolves. */
export function Splash() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4">
      <motion.div
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Logo className="h-14 w-14" />
      </motion.div>
      <p className="font-display text-sm font-medium text-muted">Loading ClassPoint…</p>
    </div>
  )
}
