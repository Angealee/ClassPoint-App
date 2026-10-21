import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'

const DURATION_MS = 2000
export function AuthTransition({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, DURATION_MS)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <motion.div
      aria-hidden
      className="fixed inset-0 z-100 flex flex-col items-center justify-center gap-5 bg-canvas"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 1, 0] }}
      transition={{ duration: DURATION_MS / 1000, times: [0, 0.15, 0.5, 0.82, 1], ease: 'easeInOut' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}

        animate={{ opacity: 1, scale: [0.8, 1, 1.05, 1] }}
        transition={{ duration: 1.4, times: [0, 0.4, 0.75, 1], ease: 'easeOut' }}
      >
        <Logo className="h-20 w-20" />
      </motion.div>
      <motion.p
        className="font-display text-lg font-bold tracking-tight text-ink"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5, ease: 'easeOut' }}
      >
        ClassPoint
      </motion.p>
    </motion.div>
  )
}

export function useAuthTransition() {
  const navigate = useNavigate()
  const [dest, setDest] = useState<string | null>(null)

  const start = useCallback((to: string) => setDest(to), [])
  const onDone = useCallback(() => {
    if (dest) navigate(dest, { replace: true })
  }, [dest, navigate])

  return {
    start,
    active: dest !== null,
    overlay: dest ? <AuthTransition onDone={onDone} /> : null,
  }
}
