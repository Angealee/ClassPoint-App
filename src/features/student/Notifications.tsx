import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { ListSkeleton } from '@/components/ui/Skeleton'
import {
  BellIcon,
  BoltIcon,
  CheckIcon,
  StarIcon,
  TicketIcon,
  TrophyIcon,
  XIcon,
} from '@/components/ui/icons'
import { listNotifications } from '@/lib/api'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import { TONE } from '@/lib/tone'
import { useStudentData } from './StudentData'
import type { AppNotification } from '@/lib/types'
import type { ComponentType, SVGProps } from 'react'

const PAGE_SIZE = 30
const SWIPE_THRESHOLD = 80

const TYPE_META: Record<
  string,
  { Icon: ComponentType<SVGProps<SVGSVGElement>>; cls: string }
> = {
  point: { Icon: BoltIcon, cls: TONE.reward.chip },
  deduct: { Icon: BoltIcon, cls: TONE.danger.chip },
  level: { Icon: StarIcon, cls: TONE.reward.chip },
  rank: { Icon: TrophyIcon, cls: TONE.accent.chip },
  achievement: { Icon: TrophyIcon, cls: TONE.reward.chip },
  redemption: { Icon: TicketIcon, cls: TONE.success.chip },
  excuse: { Icon: CheckIcon, cls: TONE.success.chip },
  broadcast: { Icon: BellIcon, cls: TONE.accent.chip },
}
const DEFAULT_META = { Icon: BellIcon, cls: TONE.neutral.chip }

function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function groupByDay(items: AppNotification[]) {
  const groups: { label: string; items: AppNotification[] }[] = []
  for (const item of items) {
    const label = getDateLabel(item.createdAt)
    const last = groups.at(-1)
    if (last && last.label === label) {
      last.items.push(item)
    } else {
      groups.push({ label, items: [item] })
    }
  }
  return groups
}

function EmptyIllustration() {
  return (
    <svg viewBox="0 0 120 120" fill="none" className="h-28 w-28 text-muted" aria-hidden>
      {/* Bell body */}
      <path
        d="M60 20C60 20 44 30 42 52C41 57 37 63 33 68H87C83 63 79 57 78 52C76 30 60 20 60 20Z"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Clapper */}
      <ellipse
        cx="60"
        cy="74"
        rx="8"
        ry="5"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.5"
      />
      {/* Hook */}
      <path
        d="M57 20C57 18 58.3 17 60 17C61.7 17 63 18 63 20"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Zs floating up-right */}
      <text x="74" y="56" fill="currentColor" fillOpacity="0.3" fontSize="10" fontWeight="700">
        z
      </text>
      <text x="82" y="45" fill="currentColor" fillOpacity="0.4" fontSize="13" fontWeight="700">
        z
      </text>
      <text x="91" y="32" fill="currentColor" fillOpacity="0.52" fontSize="16" fontWeight="700">
        z
      </text>
    </svg>
  )
}

interface SwipeRowProps {
  n: AppNotification
  allRead: boolean
  onDismiss: (id: string) => void
  onClick: (n: AppNotification) => void
}

function SwipeRow({ n, allRead, onDismiss, onClick }: SwipeRowProps) {
  const meta = TYPE_META[n.type] ?? DEFAULT_META
  const unread = !allRead && !n.readAt

  const x = useMotionValue(0)
  // Reveal the dismiss hint as the user drags
  const hintOpacity = useTransform(
    x,
    [-SWIPE_THRESHOLD, -24, 0, 24, SWIPE_THRESHOLD],
    [0.85, 0.4, 0, 0.4, 0.85],
  )

  function onDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (Math.abs(info.offset.x) > SWIPE_THRESHOLD) {
      onDismiss(n.id)
    }
  }

  return (
    <div className="relative">
      {/* Dismiss hint shown behind the row as it's dragged */}
      <motion.div
        className="absolute inset-0 flex items-center justify-between bg-danger/10 px-5"
        style={{ opacity: hintOpacity }}
        aria-hidden
      >
        <span className="text-2xs font-semibold text-danger">← Dismiss</span>
        <span className="text-2xs font-semibold text-danger">Dismiss →</span>
      </motion.div>

      {/* Draggable row */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -240, right: 240 }}
        dragElastic={0.12}
        onDragEnd={onDragEnd}
        style={{ x }}
        className={cn('relative touch-pan-y', unread && 'bg-accent-solid/[0.06]')}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => onClick(n)}
          className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-card-2 active:bg-card-2"
        >
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
              meta.cls,
            )}
          >
            <meta.Icon className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>
                {n.title}
              </span>
              <span className="shrink-0 text-xs text-muted">{timeAgo(n.createdAt)}</span>
            </span>
            {n.body && (
              <span className="mt-0.5 block truncate text-xs text-muted">{n.body}</span>
            )}
          </span>
          {unread && (
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-solid"
              aria-label="Unread"
            />
          )}
        </button>
      </motion.div>
    </div>
  )
}

/**
 * Center-modal notification panel.
 *
 * Opens as a card that scales up from the center of the screen (not a bottom
 * sheet). Items are grouped by day with sticky headers. Each row is
 * horizontally swipeable to dismiss it from the list.
 */
export function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, markAllRead, unreadCount } = useStudentData()
  const navigate = useNavigate()
  const studentId = me?.id

  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(false)
  const [dismissed, setDismissed] = useState(new Set<string>())
  const [allRead, setAllRead] = useState(false)
  const [openedUnread, setOpenedUnread] = useState(0)

  // Always-fresh ref so the open effect can read the current count without
  // adding it to the dependency array (we only want the value at open time).
  const latestUnreadRef = useRef(unreadCount)
  latestUnreadRef.current = unreadCount

  // Stable callback ref so the Escape handler doesn't re-register on every render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open || !studentId) return
    setOpenedUnread(latestUnreadRef.current)
    setDismissed(new Set())
    setAllRead(false)
    let cancelled = false
    setLoading(true)
    setError(false)
    listNotifications(studentId, { limit: PAGE_SIZE })
      .then((list) => {
        if (cancelled) return
        setItems(list)
        setHasMore(list.length === PAGE_SIZE)
        void markAllRead()
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, studentId, markAllRead])

  // Scroll lock while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Escape key
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  async function loadMore() {
    if (!studentId || items.length === 0) return
    setLoadingMore(true)
    try {
      const older = await listNotifications(studentId, {
        before: items.at(-1)!.createdAt,
        limit: PAGE_SIZE,
      })
      setItems((prev) => [...prev, ...older])
      setHasMore(older.length === PAGE_SIZE)
    } catch {
      /* retry on next tap */
    } finally {
      setLoadingMore(false)
    }
  }

  function openTarget(n: AppNotification) {
    onClose()
    if (n.url && n.url !== window.location.pathname) navigate(n.url)
  }

  function handleMarkAllRead() {
    setAllRead(true)
    setOpenedUnread(0)
    void markAllRead()
  }

  function handleDismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]))
  }

  const visibleItems = items.filter((n) => !dismissed.has(n.id))
  const groups = groupByDay(visibleItems)
  const showUnreadBadge = !loading && !allRead && openedUnread > 0

  return createPortal(
    <AnimatePresence>
      {open && (
        // Backdrop doubles as the centering flex container
        <motion.div
          key="notifications-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          {/* Card — scales up from center */}
          <motion.div
            role="dialog"
            aria-modal
            aria-label="Notifications"
            initial={{ scale: 0.92, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 6 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="flex h-full max-h-[82dvh] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-line bg-canvas shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3.5">
              <h2 className="min-w-0 flex-1 truncate text-base font-semibold">Notifications</h2>
              {showUnreadBadge && (
                <span className="shrink-0 rounded-full bg-accent-solid/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-accent">
                  {openedUnread > 99 ? '99+' : openedUnread}
                </span>
              )}
              {showUnreadBadge && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-solid/10"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close notifications"
                className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-card-2 hover:text-ink"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* ── Body ── */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {loading ? (
                <div className="px-4 py-4">
                  <ListSkeleton rows={6} />
                </div>
              ) : error ? (
                <p className="py-10 text-center text-sm text-danger">
                  Could not load. Close and try again.
                </p>
              ) : visibleItems.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <EmptyIllustration />
                  <p className="text-sm text-muted">
                    Nothing yet — points, level-ups
                    <br />
                    and rank moves land here.
                  </p>
                </div>
              ) : (
                <>
                  {groups.map((group) => (
                    <div key={group.label}>
                      {/* Sticky day header */}
                      <div className="sticky top-0 z-10 bg-canvas px-4 pb-1.5 pt-2.5">
                        <span className="text-2xs font-semibold uppercase tracking-widest text-muted">
                          {group.label}
                        </span>
                      </div>
                      {/* Items — AnimatePresence handles swipe-dismissed exits */}
                      <AnimatePresence initial={false}>
                        {group.items.map((n) => (
                          <motion.div
                            key={n.id}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden border-b border-line/50 last:border-b-0"
                          >
                            <SwipeRow
                              n={n}
                              allRead={allRead}
                              onDismiss={handleDismiss}
                              onClick={openTarget}
                            />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  ))}
                  {hasMore && (
                    <div className="px-4 py-3">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => void loadMore()}
                        disabled={loadingMore}
                      >
                        {loadingMore ? 'Loading…' : 'Load older'}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
