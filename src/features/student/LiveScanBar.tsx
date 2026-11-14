import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { QrIcon } from '@/components/ui/icons'
import { timeAgo } from '@/lib/time'
import { useStudentData } from './StudentData'

/*
 * "Class is live: scan now." It exists only while a class is running and you have not scanned
 * yet, and on a phone it sits above the tab bar in the thumb zone; on a desktop it is the first
 * thing in the page flow. Once you are in (or the class is not live) it is not on screen and the
 * hero's quiet Scan button takes over, so the one big action appears only on the day it matters.
 * It renders UI only (no subscription), so mounting it twice, once per breakpoint, is safe.
 */
export function LiveScanBar({ onScan }: { onScan: () => void }) {
  const { liveSession, liveStatus } = useStudentData()
  if (!liveSession || liveStatus !== null) return null
  const subject = liveSession.subjectCode ?? 'Class'

  const bar = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5 pl-4 shadow-lg shadow-black/20"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-solid/60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success-solid" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{subject} is live</p>
        <p className="truncate text-xs text-muted">Started {timeAgo(liveSession.startedAt)}</p>
      </div>
      <Button size="lg" className="shrink-0" onClick={onScan}>
        <QrIcon className="h-5 w-5" /> Scan
      </Button>
    </motion.div>
  )

  return (
    <>
      <div className="hidden md:block">{bar}</div>
      <div className="fixed inset-x-0 bottom-19 z-20 px-4 md:hidden">
        <div className="mx-auto max-w-2xl">{bar}</div>
      </div>
    </>
  )
}
