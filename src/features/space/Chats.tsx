import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { SectionLabel } from '@/components/ui/SectionLabel'
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

/**
 * `/app/space/chats` — every room you are in, as cards with live presence.
 *
 * ── WHAT "PRESENCE" MEANS HERE, EXACTLY ────────────────────────────────────
 * Two different facts, and they are deliberately not blurred together:
 *
 *   TYPING — real presence, live. Each room's typing broadcast is subscribed
 *   from this screen, so "Maria is typing…" appears on the card before you
 *   open the room. This is only possible because typing moved to a SHARED
 *   topic (lib/typing-channel.ts); on the old per-subscription topic nobody
 *   could hear anybody.
 *
 *   RECENT — the room had a message in the last 10 minutes. That is message
 *   recency, NOT "people are online", and this app has no way to know the
 *   latter. So it is drawn as a quiet ring on the room's glyph and named
 *   honestly in the label, rather than as a green "online" dot that would be
 *   claiming something untrue.
 *
 * The unread dot is still computed ENTIRELY on this device: `isRoomUnread`
 * compares `last_message_at` against a localStorage pointer. Nothing about
 * what you have read is ever sent, which is what makes "no seen feature" a
 * property of the system rather than a promise. See lib/unread.ts.
 */

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

  // A stable key, so the effect below does not resubscribe on every refetch of
  // the same rooms — the same stable-id rule the realtime channels follow.
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

  // Re-render once a second while anyone is typing, so a stale name clears on
  // time rather than when the next broadcast happens to arrive.
  const anyTyping = Object.values(typers).some((t) => t.length > 0)
  useEffect(() => {
    if (!anyTyping) return
    const t = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [anyTyping])

  useEffect(() => {
    if (!pickerOpen || people.length > 0) return
    void listSpacePeople()
      // The picker is for messaging SOMEONE ELSE. The RPC includes the caller
      // because chat needs their own badges; here they are filtered out.
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

  // The instructor mounts this too; "message your instructor" would then be
  // an invitation to DM themselves.
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
          'group flex items-center gap-3 rounded-2xl border p-3 transition-colors',
          unread ? 'border-accent-solid/35 bg-accent-solid/6' : 'border-line bg-card hover:bg-card-2',
        )}
      >
        <span className="relative shrink-0">
          <Avatar
            name={room.name}
            className={cn('h-12 w-12', room.kind !== 'dm' && 'rounded-2xl')}
            textClassName="text-sm"
          />
          {/* A DOT at the corner, not a ring around the whole glyph: the ring
              fought the unread card's own accent border, and two coloured
              outlines on one 48px avatar is noise. The dot is the position
              every messaging app already uses for this. */}
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
          </div>

          {/* Typing WINS over the last message: it is the newer fact, and it is
              the one that makes the list feel alive. */}
          {typing ? (
            <p className="flex items-center gap-1.5 truncate text-xs font-medium text-accent">
              <TypingDots />
              {typing}
            </p>
          ) : (
            <p className="truncate text-xs text-muted">
              {room.lastMessageBody
                ? `${room.lastMessageBy}: ${room.lastMessageBody}`
                : 'No messages yet'}
            </p>
          )}

          <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted">
            <span>
              {room.memberCount} {room.memberCount === 1 ? 'person' : 'people'}
            </span>
            {room.muted && (
              <>
                <span aria-hidden="true">·</span>
                <span>muted</span>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {room.lastMessageAt && (
            <span className="text-2xs text-muted">{timeAgo(room.lastMessageAt)}</span>
          )}
          {/* Muted rooms still show a dot: mute is about notifications, not
              about pretending nothing happened. */}
          {unread && (
            <span className="h-2.5 w-2.5 rounded-full bg-accent-solid" aria-label="Unread" />
          )}
        </div>
      </Link>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Chats" fallback={basePath} />
      <BetaBanner />

      {loading ? (
        <ListSkeleton rows={4} />
      ) : failed ? (
        <ErrorState onRetry={() => void load()}>Could not load your chats.</ErrorState>
      ) : (
        <>
          <div>
            <SectionLabel>Rooms</SectionLabel>
            {groups.length === 0 ? (
              <EmptyState>No rooms yet.</EmptyState>
            ) : (
              <div className="space-y-2">
                {groups.map((r) => (
                  <RoomCard key={r.id} room={r} />
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionLabel
              action={
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="shrink-0 text-xs font-semibold text-accent"
                >
                  New
                </button>
              }
            >
              Direct messages
            </SectionLabel>
            {dms.length === 0 ? (
              <EmptyState description="Start one from someone's profile, or with New above.">
                No direct messages yet.
              </EmptyState>
            ) : (
              <div className="space-y-2">
                {dms.map((r) => (
                  <RoomCard key={r.id} room={r} />
                ))}
              </div>
            )}
          </div>

          {/* Messaging the instructor is its own row, not buried in the people
              picker — it is the one conversation a muted student can still
              start, and it should never be hard to find. */}
          {isStudentView && (
            <Card interactive pad="roomy" onClick={() => void openDm(null)} className="cursor-pointer">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-solid/12 text-xs font-bold text-accent">
                  IN
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Message your instructor</p>
                  <p className="text-xs text-muted">Private, and always available.</p>
                </div>
                <span className="shrink-0 text-lg text-muted">›</span>
              </div>
            </Card>
          )}
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
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Nobody by that name.</p>
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
