import { useCallback, useEffect, useMemo, useState } from 'react'
import { SpaceGlow } from '@/components/space/SpaceGlow'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PageHeader } from '@/components/ui/PageHeader'
import { Rows } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import { PencilIcon } from '@/components/ui/icons'
import { Avatar } from '@/components/ui/Avatar'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { BetaBanner } from '@/components/space/BetaBanner'
import { listMyRooms, listSpacePeople, startDm } from '@/lib/api'
import { useStudentDataOptional } from '@/features/student/StudentData'
import { errorText } from '@/lib/errors'
import { isRoomUnread } from '@/lib/unread'
import { timeAgo } from '@/lib/time'
import { noteTyping, typingLabel, type TypingEntry } from '@/lib/typing'
import { joinTypingChannel } from '@/lib/typing-channel'
import { cn } from '@/lib/cn'
import type { SpaceRoom } from '@/lib/types'

/** A message this recently counts as the room being warm. */
const RECENT_MS = 10 * 60 * 1000

function isRecent(iso: string | null): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  return Number.isFinite(t) && Date.now() - t < RECENT_MS
}

/** Three dots, the same ones the chat composer shows. */
function TypingDots() {
  return (
    <span aria-hidden="true" className="flex shrink-0 items-end gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1 w-1 rounded-full bg-accent-solid"
          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
        />
      ))}
    </span>
  )
}

export function Chats({ basePath = '/app/space' }: { basePath?: string }) {
  const navigate = useNavigate()
  const myStudentId = useStudentDataOptional()?.me?.id ?? null
  const { toast } = useToast()

  const [rooms, setRooms] = useState<SpaceRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [people, setPeople] = useState<
    { id: string; displayName: string; avatarUrl: string | null }[]
  >([])
  const [search, setSearch] = useState('')
  const [starting, setStarting] = useState(false)
  const [typers, setTypers] = useState<Record<string, TypingEntry[]>>({})
  const [, forceTick] = useState(0)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setRooms(await listMyRooms())
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const roomIds = useMemo(() => rooms.map((r) => r.id).join(','), [rooms])

  useEffect(() => {
    if (!roomIds) return
    const ids = roomIds.split(',')
    const handles = ids.map((id) =>
      joinTypingChannel(id, (name) =>
        setTypers((cur) => ({ ...cur, [id]: noteTyping(cur[id] ?? [], name) })),
      ),
    )
    return () => handles.forEach((h) => h.leave())
  }, [roomIds])

  const anyTyping = Object.values(typers).some((t) => t.length > 0)
  useEffect(() => {
    if (!anyTyping) return
    const t = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [anyTyping])

  useEffect(() => {
    if (!pickerOpen || people.length > 0) return
    void listSpacePeople()
      .then((rows) => setPeople(rows.filter((r) => r.id !== myStudentId)))
      .catch(() => {
        /* the picker stays empty */
      })
  }, [pickerOpen, people.length, myStudentId])

  async function openDm(targetId: string | null) {
    setStarting(true)
    try {
      const id = await startDm(targetId)
      setPickerOpen(false)
      setSearch('')
      navigate(`${basePath}/chat/${id}`)
    } catch (e) {
      toast(errorText(e, 'Could not open that conversation.'), 'error')
    } finally {
      setStarting(false)
    }
  }

  const isStudentView = basePath.startsWith('/app')

  const groups = rooms.filter((r) => r.kind !== 'dm')
  const dms = rooms.filter((r) => r.kind === 'dm')
  const filtered = search.trim()
    ? people.filter((p) => p.displayName.toLowerCase().includes(search.trim().toLowerCase()))
    : people

  function RoomCard({ room }: { room: SpaceRoom }) {
    const unread = isRoomUnread(room)
    const typing = typingLabel(typers[room.id] ?? [])
    const warm = isRecent(room.lastMessageAt)

    return (
      <Link
        to={`${basePath}/chat/${room.id}`}
        className={cn(
          'group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-card-2',
          unread && 'bg-accent-solid/5',
        )}
      >
        <span className="relative shrink-0">
          <Avatar
            name={room.name}
            className={cn('h-12 w-12', room.kind !== 'dm' && 'rounded-2xl')}
            textClassName="text-sm"
          />
          {warm && (
            <span
              aria-label="Active in the last 10 minutes"
              className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success-solid ring-2 ring-canvas"
            />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'min-w-0 truncate text-sm',
                unread ? 'font-bold text-ink' : 'font-semibold',
              )}
            >
              {room.name}
            </span>
            {room.announceOnly && (
              <Chip tone="warn" size="sm">
                Announce
              </Chip>
            )}
            {room.muted && <span className="shrink-0 text-2xs text-muted">muted</span>}
          </div>

          {typing ? (
            <p className="flex items-center gap-1.5 truncate text-xs font-medium text-accent">
              <TypingDots />
              {typing}
            </p>
          ) : (
            <p className={cn('truncate text-sm', unread ? 'font-medium text-ink' : 'text-muted')}>
              {room.lastMessageBody
                ? `${room.lastMessageBy}: ${room.lastMessageBody}`
                : 'No messages yet'}
            </p>
          )}

        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {room.lastMessageAt && (
            <span className={cn('text-2xs', unread ? 'font-semibold text-accent' : 'text-muted')}>
              {timeAgo(room.lastMessageAt)}
            </span>
          )}
          {unread && (
            <span className="h-2.5 w-2.5 rounded-full bg-accent-solid" aria-label="Unread" />
          )}
        </div>
      </Link>
    )
  }

  return (
    <div className="relative space-y-4">
      <SpaceGlow />
      <PageHeader
        title="Chats"
        fallback={basePath}
        actions={
          <IconButton
            label="New message"
            variant="outline"
            round
            onClick={() => setPickerOpen(true)}
            icon={<PencilIcon className="h-4.5 w-4.5" />}
          />
        }
      />
      <BetaBanner />

      {loading ? (
        <ListSkeleton rows={4} />
      ) : failed ? (
        <ErrorState onRetry={() => void load()}>Could not load your chats.</ErrorState>
      ) : (
        <>
          <section>
            <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Rooms
            </h2>
            {groups.length === 0 ? (
              <EmptyState compact>No rooms yet.</EmptyState>
            ) : (
              <Rows>
                {groups.map((r) => (
                  <RoomCard key={r.id} room={r} />
                ))}
              </Rows>
            )}
          </section>

          <section>
            <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Direct messages
            </h2>
            {dms.length === 0 ? (
              <EmptyState compact>
                No direct messages yet. Tap the pencil to start one.
              </EmptyState>
            ) : (
              <Rows>
                {dms.map((r) => (
                  <RoomCard key={r.id} room={r} />
                ))}
              </Rows>
            )}
          </section>
        </>
      )}

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="New message">
        <div className="space-y-3 pb-2">
          <Input
            placeholder="Search the roster"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {isStudentView && !search.trim() && (
              <button
                type="button"
                disabled={starting}
                onClick={() => void openDm(null)}
                className="flex w-full items-center gap-3 bg-accent-solid/5 px-4 py-3 text-left transition-colors hover:bg-card-2 disabled:opacity-60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-solid/15 text-2xs font-bold text-accent">
                  IN
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">Instructor</span>
                  <span className="block text-2xs text-muted">Private, always available</span>
                </span>
              </button>
            )}
            {filtered.length === 0 ? (
              <EmptyState compact>Nobody by that name.</EmptyState>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={starting}
                  onClick={() => void openDm(p.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-card-2 disabled:opacity-60"
                >
                  <Avatar
                    name={p.displayName}
                    url={p.avatarUrl}
                    className="h-8 w-8"
                    textClassName="text-2xs"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {p.displayName}
                  </span>
                </button>
              ))
            )}
          </div>
          <p className="px-1 text-xs text-muted">
            DMs are private. Your instructor can review a thread if it is reported.
          </p>
        </div>
      </Sheet>
    </div>
  )
}
