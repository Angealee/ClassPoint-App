import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { ListSkeleton } from '@/components/ui/Skeleton'
import {
  BellIcon,
  BoltIcon,
  StarIcon,
  TicketIcon,
  TrophyIcon,
  WarningIcon,
} from '@/components/ui/icons'
import { listNotifications } from '@/lib/api'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import { useStudentData } from './StudentData'
import type { AppNotification } from '@/lib/types'
import type { ComponentType, SVGProps } from 'react'

const PAGE_SIZE = 30

/** Icon + accent per notification type; unknown types fall back to the bell. */
const TYPE_META: Record<
  string,
  { Icon: ComponentType<SVGProps<SVGSVGElement>>; cls: string }
> = {
  point: { Icon: BoltIcon, cls: 'bg-gold-400/15 text-gold-600 dark:text-gold-400' },
  deduct: { Icon: BoltIcon, cls: 'bg-brand-500/10 text-brand-500' },
  level: { Icon: StarIcon, cls: 'bg-gold-400/15 text-gold-600 dark:text-gold-400' },
  rank: { Icon: TrophyIcon, cls: 'bg-brand-500/10 text-brand-500' },
  achievement: { Icon: TrophyIcon, cls: 'bg-gold-400/15 text-gold-600 dark:text-gold-400' },
  redemption: { Icon: TicketIcon, cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  attendance_penalty: { Icon: WarningIcon, cls: 'bg-brand-500/10 text-brand-500' },
}
const DEFAULT_META = { Icon: BellIcon, cls: 'bg-card-2 text-muted' }

/**
 * The bell's notification history. Opening it marks everything read
 * server-side (clears the badge), but this open's batch keeps its visual
 * unread highlight — the fetched snapshot still carries the old readAt.
 */
export function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, markAllRead } = useStudentData()
  const navigate = useNavigate()
  const studentId = me?.id

  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open || !studentId) return
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

  async function loadMore() {
    if (!studentId || items.length === 0) return
    setLoadingMore(true)
    try {
      const older = await listNotifications(studentId, {
        before: items[items.length - 1].createdAt,
        limit: PAGE_SIZE,
      })
      setItems((prev) => [...prev, ...older])
      setHasMore(older.length === PAGE_SIZE)
    } catch {
      /* the button stays — tapping retries */
    } finally {
      setLoadingMore(false)
    }
  }

  function openTarget(n: AppNotification) {
    onClose()
    if (n.url && n.url !== window.location.pathname) navigate(n.url)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Notifications">
      {loading ? (
        <ListSkeleton rows={5} />
      ) : error ? (
        <p className="py-8 text-center text-sm text-brand-500">
          Could not load notifications. Close and try again.
        </p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <BellIcon className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">
            Nothing yet — points, level-ups and rank moves land here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            <AnimatePresence initial={false}>
              {items.map((n) => {
                const meta = TYPE_META[n.type] ?? DEFAULT_META
                const unread = !n.readAt
                return (
                  <motion.li
                    key={n.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={cn(unread && 'bg-brand-500/5')}
                  >
                    <button
                      type="button"
                      onClick={() => openTarget(n)}
                      className="flex w-full items-start gap-3 p-3.5 text-left transition-colors hover:bg-card-2"
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
                          <span
                            className={cn(
                              'truncate text-sm',
                              unread ? 'font-semibold' : 'font-medium',
                            )}
                          >
                            {n.title}
                          </span>
                          <span className="shrink-0 text-[0.7rem] text-muted">
                            {timeAgo(n.createdAt)}
                          </span>
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block truncate text-xs text-muted">{n.body}</span>
                        )}
                      </span>
                      {unread && (
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                          aria-label="Unread"
                        />
                      )}
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
          {hasMore && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : 'Load older'}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  )
}
