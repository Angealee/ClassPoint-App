import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { StickyBar } from '@/components/ui/StickyBar'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { XIcon } from '@/components/ui/icons'
import { MessageRow } from '@/components/space/MessageRow'
import { ReportSheet } from '@/components/space/ReportSheet'
import { useStudentDataOptional } from '@/features/student/StudentData'
import {
  deleteMyMessage,
  getRoomMessages,
  getRoomPostBlock,
  listMyRooms,
  listSpacePeople,
  startDm,
  reactToMessage,
  sendMessage,
  setRoomMuted,
  type MessageCursor,
} from '@/lib/api'
import { supabase, uniqueChannel } from '@/lib/supabase'
import { errorText } from '@/lib/errors'
import { resolveMentions, type MentionCandidate } from '@/lib/mentions'
import { getLastRead, markRead, unreadDividerIndex } from '@/lib/unread'
import { getLevelProgress } from '@/lib/leveling'
import { noteTyping, shouldBroadcast, typingLabel, type TypingEntry } from '@/lib/typing'
import { Sheet } from '@/components/ui/Sheet'
import { Avatar } from '@/components/ui/Avatar'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'
import {
  MAX_MESSAGE_LENGTH,
  type ReactionCode,
  type SpaceMessage,
  type SpacePerson,
  type SpaceRoom,
} from '@/lib/types'

const PAGE = 40
/** A new group starts after this long, even from the same person. */
const GROUP_GAP_MS = 5 * 60 * 1000
/** How close to the bottom still counts as "at the bottom". */
const AT_BOTTOM_PX = 120
/** A quiet time divider is printed when this much passes between messages. */
const TIME_GAP_MS = 30 * 60 * 1000

/**
 * One conversation. Mounted at `/app/space/chat/:roomId` for students, and
 * under `/teach/space` for the instructor — `basePath` is the only difference.
 *
 * ── THE LAYOUT, AND WHY THERE ARE NO MAGIC NUMBERS ─────────────────────────
 * The composer clears the fixed mobile tab bar via `StickyBar`
 * (`sticky bottom-19 md:bottom-4`), which already owns that height in one
 * place. The HEADER is sticky for the mirror-image reason: in a long room it
 * scrolled away and took the back button with it, which is how you end up
 * stuck inside a conversation with no way out.
 */

function timeOf(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toDateString()
}

/** "Today" / "Yesterday" / "Tue, 2 Sep" — a clock time alone carries no date. */
function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function ChatRoom({ basePath = '/app/space' }: { basePath?: string }) {
  const { roomId = '' } = useParams()
  const { toast } = useToast()
  const navigate = useNavigate()
  // OPTIONAL: this screen is also mounted in the instructor area, which has no
  // StudentDataProvider. Undefined there — and that is how "mine" is decided.
  const student = useStudentDataOptional()
  const myStudentId = student?.me?.id ?? null

  const [room, setRoom] = useState<SpaceRoom | null>(null)
  const [messages, setMessages] = useState<SpaceMessage[]>([])
  const [block, setBlock] = useState<string | null>(null)
  const [people, setPeople] = useState<SpacePerson[]>([])
  const [personTarget, setPersonTarget] = useState<SpaceMessage | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<SpaceMessage | null>(null)
  const [sending, setSending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SpaceMessage | null>(null)
  const [reportTarget, setReportTarget] = useState<SpaceMessage | null>(null)
  const [busy, setBusy] = useState(false)
  const [entryLastRead, setEntryLastRead] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [missed, setMissed] = useState(0)
  const [typers, setTypers] = useState<TypingEntry[]>([])
  const [, forceTick] = useState(0)

  const areaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<ReturnType<typeof uniqueChannel> | null>(null)
  const lastTypingSentRef = useRef<number | null>(null)
  // A ref as well as state: the realtime handler reads it, and must not have to
  // re-subscribe to see a new value.
  const atBottomRef = useRef(true)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setEntryLastRead(getLastRead(roomId))
      const [rooms, page, why] = await Promise.all([
        listMyRooms(),
        getRoomMessages(roomId, { limit: PAGE }),
        getRoomPostBlock(roomId),
      ])
      setRoom(rooms.find((r) => r.id === roomId) ?? null)
      setMessages([...page].reverse())
      setBlock(why)
      setExhausted(page.length < PAGE)
      if (page.length > 0) markRead(roomId, page[0].createdAt)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [roomId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  // ONE roster fetch per room. It feeds the XP ring, the level, the rank
  // medal, the section dot AND mention resolution — the alternative was four
  // sources for four badges beside one name.
  useEffect(() => {
    void listSpacePeople()
      .then(setPeople)
      .catch(() => {
        /* badges and mentions degrade to nothing */
      })
  }, [])

  useEffect(() => {
    const onScroll = () => {
      const gap = document.documentElement.scrollHeight - window.scrollY - window.innerHeight
      const near = gap < AT_BOTTOM_PX
      atBottomRef.current = near
      setAtBottom(near)
      if (near) setMissed(0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [loading])

  // Land at the newest message, or at the unread divider when there is one.
  useEffect(() => {
    if (loading) return
    ;(dividerRef.current ?? bottomRef.current)?.scrollIntoView({ block: 'center' })
  }, [loading])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [body])

  // Re-render once a second while anyone is typing, so a stale name disappears
  // on time rather than when the next message happens to arrive.
  useEffect(() => {
    if (typers.length === 0) return
    const t = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [typers.length])

  const refreshNewest = useCallback(
    async (opts?: { fromRemote?: boolean }) => {
      try {
        const page = await getRoomMessages(roomId, { limit: PAGE })
        setMessages([...page].reverse())
        if (page.length > 0) markRead(roomId, page[0].createdAt)
        if (opts?.fromRemote) {
          if (atBottomRef.current) {
            requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
          } else {
            // Follow along ONLY when they were already at the bottom. Yanking
            // the view while someone reads older messages is the single most
            // irritating thing a chat can do.
            setMissed((n) => n + 1)
          }
        }
      } catch {
        /* keep what we had */
      }
    },
    [roomId],
  )

  // Page-scoped realtime, filtered to THIS room. Typing rides the same channel
  // as a BROADCAST — ephemeral, no table, nothing persisted.
  useEffect(() => {
    if (!roomId) return
    const channel = uniqueChannel(`room-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'space_messages', filter: `room_id=eq.${roomId}` },
        () => void refreshNewest({ fromRemote: true }),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'space_message_reactions',
          filter: `room_id=eq.${roomId}`,
        },
        () => void refreshNewest(),
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        const name = (payload?.payload as { name?: string } | undefined)?.name
        if (!name) return
        setTypers((cur) => noteTyping(cur, name))
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [roomId, refreshNewest])

  function announceTyping() {
    const now = Date.now()
    if (!shouldBroadcast(lastTypingSentRef.current, now)) return
    lastTypingSentRef.current = now
    const name = student?.me?.display_name ?? 'Instructor'
    void channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { name } })
  }

  async function loadOlder() {
    const first = messages[0]
    if (!first || loadingMore || exhausted) return
    setLoadingMore(true)
    try {
      const cursor: MessageCursor = { createdAt: first.createdAt, id: first.id }
      const older = await getRoomMessages(roomId, { limit: PAGE, before: cursor })
      setMessages((m) => [...[...older].reverse(), ...m])
      if (older.length < PAGE) setExhausted(true)
    } catch (e) {
      toast(errorText(e, 'Could not load older messages.'), 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  async function send() {
    const text = body.trim()
    if (!text || sending || text.length > MAX_MESSAGE_LENGTH) return
    setSending(true)
    try {
      await sendMessage(roomId, text, {
        replyTo: replyTo?.id ?? null,
        mentions: resolveMentions(text, mentionCandidates),
      })
      setBody('')
      setReplyTo(null)
      await refreshNewest()
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      setBlock(await getRoomPostBlock(roomId))
    } catch (e) {
      // The text stays — a failed send must not eat it.
      toast(errorText(e, 'Could not send that.'), 'error')
    } finally {
      setSending(false)
    }
  }

  async function react(m: SpaceMessage, code: ReactionCode) {
    try {
      await reactToMessage(m.id, code)
      await refreshNewest()
    } catch (e) {
      toast(errorText(e, 'Could not react.'), 'error')
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteMyMessage(deleteTarget.id)
      await refreshNewest()
      setDeleteTarget(null)
    } catch (e) {
      toast(errorText(e, 'Could not delete that.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggleMute() {
    if (!room) return
    try {
      const next = await setRoomMuted(room.id, !room.muted)
      setRoom({ ...room, muted: next })
      toast(next ? 'Muted. You will not be notified.' : 'Unmuted.', 'success')
    } catch (e) {
      toast(errorText(e, 'Could not change that.'), 'error')
    }
  }

  function jumpToParent(id: string) {
    const el = document.getElementById(`msg-${id}`)
    if (!el) {
      toast('That message is further back — load older to reach it.', 'info')
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-accent-solid/60')
    window.setTimeout(() => el.classList.remove('ring-2', 'ring-accent-solid/60'), 1400)
  }

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const mentionCandidates: MentionCandidate[] = useMemo(
    () => people.map((p) => ({ id: p.id, displayName: p.displayName })),
    [people],
  )

  const divider = useMemo(
    () => unreadDividerIndex(messages, entryLastRead),
    [messages, entryLastRead],
  )
  const typing = typingLabel(typers)
  const over = body.length > MAX_MESSAGE_LENGTH
  const canSend = body.trim().length > 0 && !over && !sending && block === null

  return (
    <div className="space-y-3">
      {/* Sticky: in a long room this scrolled away and took the back button with
          it, which is how you get stuck inside a conversation. The negative
          margins let the blurred bar span the full content width. */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur-md md:-mx-8 md:px-8">
        <PageHeader
          title={room?.name ?? 'Chat'}
          subtitle={
            room
              ? room.kind === 'dm'
                ? 'Private · your instructor can review reported threads'
                : `${room.memberCount} ${room.memberCount === 1 ? 'person' : 'people'}`
              : undefined
          }
          fallback={`${basePath}/chats`}
          actions={
            room ? (
              <button
                type="button"
                onClick={() => void toggleMute()}
                className="shrink-0 rounded-full border border-line px-2.5 py-1 text-2xs font-semibold text-muted transition-colors hover:text-ink"
              >
                {room.muted ? 'Unmute' : 'Mute'}
              </button>
            ) : undefined
          }
        />
      </div>

      {room?.announceOnly && (
        <p className="rounded-xl border border-warn-solid/30 bg-warn-solid/8 px-3 py-2 text-xs font-medium text-warn">
          Announcements only — the instructor is the only one posting here right now.
        </p>
      )}

      {loading ? (
        <ListSkeleton rows={5} />
      ) : failed ? (
        <ErrorState onRetry={() => void load()}>Could not open this room.</ErrorState>
      ) : (
        <>
          {!exhausted && messages.length > 0 && (
            <Button
              variant="ghost"
              className="w-full"
              loading={loadingMore}
              onClick={() => void loadOlder()}
            >
              Load older
            </Button>
          )}

          {messages.length === 0 ? (
            <EmptyState description="Say something first.">Nothing here yet.</EmptyState>
          ) : (
            <div>
              {messages.map((m, i) => {
                const prev = messages[i - 1]
                const next = messages[i + 1]
                const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)
                // A time divider also breaks a run: two messages either side of
                // a 30-minute gap are not one utterance.
                const gapBefore =
                  !!prev && Date.parse(m.createdAt) - Date.parse(prev.createdAt) >= TIME_GAP_MS
                const showTime = newDay || gapBefore

                const sameAs = (a?: SpaceMessage, b?: SpaceMessage) =>
                  !!a &&
                  !!b &&
                  a.authorStudentId === b.authorStudentId &&
                  a.displayName === b.displayName &&
                  Math.abs(Date.parse(a.createdAt) - Date.parse(b.createdAt)) < GROUP_GAP_MS

                const joinsPrev = !showTime && i !== divider && sameAs(prev, m)
                const joinsNext =
                  sameAs(m, next) &&
                  !!next &&
                  dayKey(next.createdAt) === dayKey(m.createdAt) &&
                  Date.parse(next.createdAt) - Date.parse(m.createdAt) < TIME_GAP_MS &&
                  i + 1 !== divider
                const runPosition = joinsPrev
                  ? joinsNext
                    ? ('middle' as const)
                    : ('last' as const)
                  : joinsNext
                    ? ('first' as const)
                    : ('only' as const)

                // For the instructor there is no student id — their own
                // messages are the ones with a null author (0020's convention).
                const mine =
                  myStudentId !== null
                    ? m.authorStudentId === myStudentId
                    : m.authorStudentId === null

                return (
                  <div key={m.id}>
                    {showTime && (
                      // Centred, quiet, and the ONLY timestamp in the thread —
                      // per-message clock times were most of the remaining
                      // chrome once the action rows went.
                      <p className="my-3 text-center text-2xs font-medium text-muted">
                        {newDay ? `${dayLabel(m.createdAt)} · ` : ''}
                        {timeOf(m.createdAt)}
                      </p>
                    )}
                    {i === divider && (
                      <div
                        ref={dividerRef}
                        className="my-3 flex items-center gap-2"
                        aria-label="New messages"
                      >
                        <span className="h-px flex-1 bg-accent-solid/40" />
                        <span className="text-2xs font-semibold text-accent">New messages</span>
                        <span className="h-px flex-1 bg-accent-solid/40" />
                      </div>
                    )}
                    <MessageRow
                      message={m}
                      person={
                        m.authorStudentId ? peopleById.get(m.authorStudentId) : undefined
                      }
                      runPosition={runPosition}
                      mine={mine}
                      isInstructor={m.authorStudentId === null}
                      showSectionDot={room?.kind === 'global'}
                      canReact={block === null}
                      onReact={react}
                      onReply={setReplyTo}
                      onDelete={setDeleteTarget}
                      onReport={setReportTarget}
                      onJumpToParent={jumpToParent}
                      onOpenPerson={setPersonTarget}
                    />
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}

          <StickyBar>
            {/* Above the composer, so it never covers the input. */}
            {!atBottom && (
              <button
                type="button"
                onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="mx-auto mb-2 flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-2xs font-semibold text-ink shadow-lg"
              >
                {missed > 0 ? `${missed} new message${missed === 1 ? '' : 's'}` : 'Jump to latest'}
                <span aria-hidden="true">↓</span>
              </button>
            )}

            <Card pad="tight" className="shadow-lg">
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-card-2 px-2.5 py-1.5">
                  <span className="shrink-0 text-2xs font-semibold text-muted">Replying to</span>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {replyTo.displayName}: {replyTo.body ?? 'message removed'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    aria-label="Cancel reply"
                    className="shrink-0 text-muted transition-colors hover:text-ink"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
              )}

              {typing && <p className="mb-1 truncate px-1 text-2xs italic text-muted">{typing}</p>}

              {block ? (
                <p className="px-1 py-1.5 text-xs font-medium text-warn">{block}</p>
              ) : (
                <div className="flex items-end gap-2">
                  <textarea
                    ref={areaRef}
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value)
                      if (e.target.value.trim()) announceTyping()
                    }}
                    onKeyDown={(e) => {
                      // Enter sends; Shift+Enter is a newline. The usual chat
                      // contract — and on a phone the on-screen Return key
                      // still inserts a newline, because it does not report
                      // shiftKey and IME composition is not interrupted.
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        void send()
                      }
                    }}
                    rows={1}
                    placeholder="Message…"
                    // text-base: below 16px iOS Safari zooms on focus and never
                    // zooms back.
                    className={cn(
                      'min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border bg-canvas px-3 py-2 text-base text-ink',
                      'placeholder:text-muted/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30',
                      over ? 'border-danger' : 'border-line',
                    )}
                  />
                  <Button
                    size="sm"
                    className="shrink-0"
                    loading={sending}
                    disabled={!canSend}
                    onClick={() => void send()}
                  >
                    Send
                  </Button>
                </div>
              )}

              {over && (
                <p className="mt-1 px-1 text-2xs font-semibold text-danger">
                  {body.length}/{MAX_MESSAGE_LENGTH}
                </p>
              )}
            </Card>
          </StickyBar>
        </>
      )}

      {/* Tapping an avatar. Three things, all of which already exist elsewhere —
          this is a shortcut, not a new feature. */}
      <Sheet
        open={!!personTarget}
        onClose={() => setPersonTarget(null)}
        title={personTarget?.displayName ?? 'Person'}
      >
        <div className="space-y-3 pb-2">
          {(() => {
            const t = personTarget
            const person = t?.authorStudentId ? peopleById.get(t.authorStudentId) : undefined
            if (!t) return null
            return (
              <>
                <div className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
                  <Avatar
                    name={t.displayName}
                    url={t.avatarUrl}
                    className="h-12 w-12"
                    textClassName="text-base"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-bold">{t.displayName}</p>
                    <p className="text-xs text-muted">
                      {person
                        ? `Lv ${getLevelProgress(person.semesterPoints).level}${
                            person.rank ? ` · #${person.rank}` : ''
                          }`
                        : 'Instructor'}
                    </p>
                  </div>
                </div>

                {t.authorStudentId && (
                  <>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setPersonTarget(null)
                        navigate(`/app/profile`)
                      }}
                      disabled={!myStudentId}
                    >
                      View profile
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        const id = t.authorStudentId
                        setPersonTarget(null)
                        if (!id) return
                        void startDm(id)
                          .then((room) => navigate(`${basePath}/chat/${room}`))
                          .catch((e) =>
                            toast(errorText(e, 'Could not open that conversation.'), 'error'),
                          )
                      }}
                    >
                      Message
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    // Drops "@Name " into the composer rather than opening an
                    // autocomplete — the mention resolver matches on the name,
                    // so typing it by hand and tapping here are the same thing.
                    setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}@${t.displayName} `)
                    setPersonTarget(null)
                    areaRef.current?.focus()
                  }}
                >
                  Mention
                </Button>
              </>
            )
          })()}
        </div>
      </Sheet>

      <ReportSheet
        open={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetType="message"
        targetId={reportTarget?.id ?? null}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this message?"
        message="It leaves a “message removed” marker so replies still make sense."
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
