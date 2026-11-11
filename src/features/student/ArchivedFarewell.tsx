import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Logo } from '@/components/ui/Logo'

const TAP_GUARD_MS = 700

export function ArchivedFarewell({
  semesterName,
  message,
  onDone,
}: {
  semesterName: string | null
  message: string | null
  onDone: () => void
}) {
  const [armed, setArmed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const doneRef = useRef(onDone)
  useEffect(() => {
    doneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    const guard = setTimeout(() => setArmed(true), TAP_GUARD_MS)
    return () => clearTimeout(guard)
  }, [])

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  return (
    <motion.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="A message from your instructor"
      tabIndex={-1}
      onClick={() => armed && onDone()}
      onKeyDown={(e) => {
        if (armed && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) {
          e.preventDefault()
          onDone()
        }
      }}
      className="fixed inset-0 z-[90] flex cursor-pointer flex-col items-center justify-center gap-6 bg-canvas px-7 text-center outline-none"
      initial={{ opacity: 0 }}
      // In, then HOLD — nothing here ends it but the student.
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.86 }}
        animate={{ opacity: 1, scale: [0.86, 1, 1.04, 1] }}
        transition={{ duration: 1.6, times: [0, 0.4, 0.75, 1], ease: 'easeOut' }}
      >
        <Logo className="h-16 w-16" />
      </motion.div>

      {semesterName && (
        <motion.p
          className="text-2xs font-semibold uppercase tracking-widest text-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          {semesterName}
        </motion.p>
      )}

      <motion.p
        className="max-w-sm font-display text-xl font-bold leading-relaxed text-ink [overflow-wrap:break-word]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.9, ease: 'easeOut' }}
      >
        {message?.trim() || 'That is a wrap on your semester. Thanks for playing along.'}
      </motion.p>

      <motion.p
        className="text-xs text-muted"
        initial={{ opacity: 0 }}
        animate={{ opacity: armed ? 1 : 0 }}
        transition={{ duration: 0.5 }}
      >
        Tap to continue
      </motion.p>
    </motion.div>
  )
}
