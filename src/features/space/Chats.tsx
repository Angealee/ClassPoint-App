import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, Rows } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { BetaBanner } from '@/components/space/BetaBanner'
import { listLoungeClassmates, listMyRooms, startDm } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { isRoomUnread } from '@/lib/unread'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { SpaceRoom } from '@/lib/types'

/**
 * `/app/space/chats` — every room you are in.
 *
 * The unread dot is computed ENTIRELY on this device: `isRoomUnread` compares
 * the room's `last_message_at` against a localStorage pointer. Nothing about
 * what you have read is ever sent, which is what makes "no seen feature" a
 * property of the system rather than a promise. See lib/unread.ts.
 */
export function Chats() {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [rooms, setRooms] = useState<SpaceRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [people, setPeople] = useState<{ id: string; displayName: string; avatarUrl: string | null }[]>([])
  const [search, setSearch] = useState('')
  const [starting, setStarting] = useState(false)

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

  useEffect(() => {
    if (!pickerOpen || people.length > 0) return
    void listLoungeClassmates()
      .then(setPeople)
      .catch(() => {
        /* the picker stays empty */
      })
  }, [pickerOpen, people.length])

  async function openDm(targetId: string | null) {
    setStarting(true)
    try {
      const id = await startDm(targetId)
      setPickerOpen(false)
      setSearch('')
      navigate(`/app/space/chat/${id}`)
    } catch (e) {
      toast(errorText(e, 'Could not open that conversation.'), 'error')
    } finally {
      setStarting(false)
    }
  }

  const groups = rooms.filter((r) => r.kind !== 'dm')
  const dms = rooms.filter((r) => r.kind === 'dm')
  const filtered = search.trim()
    ? people.filter((p) => p.displayName.toLowerCase().includes(search.trim().toLowerCase()))
    : people

  function RoomRow({ room }: { room: SpaceRoom }) {
    const unread = isRoomUnread(room)
    return (
      <Link
        to={`/app/space/chat/${room.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-card-2"
      >
        <Avatar
          name={room.name}
          className={cn('h-10 w-10', room.kind !== 'dm' && 'rounded-xl')}
          textClassName="text-xs"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold">{room.name}</span>
            {room.announceOnly && (
              <Chip tone="warn" size="sm">
                Announce
              </Chip>
            )}
            {room.muted && <span className="shrink-0 text-2xs text-muted">muted</span>}
          </div>
          <p className="truncate text-xs text-muted">
            {room.lastMessageBody
              ? `${room.lastMessageBy}: ${room.lastMessageBody}`
              : 'No messages yet'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {room.lastMessageAt && (
            <span className="text-2xs text-muted">{timeAgo(room.lastMessageAt)}</span>
          )}
          {/* Muted rooms still show a dot: mute is about notifications, not
              about pretending nothing happened. */}
          {unread && <span className="h-2 w-2 rounded-full bg-accent-solid" aria-label="Unread" />}
        </div>
      </Link>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Chats" fallback="/app/space" />
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
              <Rows>
                {groups.map((r) => (
                  <RoomRow key={r.id} room={r} />
                ))}
              </Rows>
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
              <Rows>
                {dms.map((r) => (
                  <RoomRow key={r.id} room={r} />
                ))}
              </Rows>
            )}
          </div>

          {/* Messaging the instructor is its own row, not buried in the people
              picker — it is the one conversation a muted student can still
              start, and it should never be hard to find. */}
          <Card
            interactive
            pad="roomy"
            onClick={() => void openDm(null)}
            className="cursor-pointer"
          >
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
