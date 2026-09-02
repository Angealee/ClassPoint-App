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
import {
  deleteMyMessage,
  getRoomMessages,
  getRoomPostBlock,
  listLoungeClassmates,
  listMyRooms,
  reactToMessage,
  sendMessage,
  setRoomMuted,
  type MessageCursor,
} from '@/lib/api'
import { supabase, uniqueChannel } from '@/lib/supabase'
import { errorText } from '@/lib/errors'
import { resolveMentions, type MentionCandidate } from '@/lib/mentions'
import { getLastRead, markRead, unreadDividerIndex } from '@/lib/unread'
import { cn } from '@/lib/cn'
import { MAX_MESSAGE_LENGTH, type ReactionCode, type SpaceMessage, type SpaceRoom } from '@/lib/types'

const PAGE = 40
/** A new group starts after this long, even from the same person. */
const GROUP_GAP_MS = 5 * 60 * 1000

/**
 * `/app/space/chat/:roomId` — one conversation.
 *
 * ── THE LAYOUT PROBLEM, AND WHY THERE ARE NO MAGIC NUMBERS HERE ────────────
 * A chat composer has to sit above the fixed mobile tab bar. The obvious fix is
 * a bounded flex column with `h-[calc(100dvh-…)]`, which needs a number that
 * has to agree with Shell's paddings on two breakpoints — exactly the kind of
 * number that goes stale. `StickyBar` already solves this: it is
 * `sticky bottom-19 md:bottom-4`, written when the same problem hit
 * AttendanceSession, and its own comment explains that the tab-bar height must
 * live in one place. So the page scrolls normally and the composer sticks.
 */
export function ChatRoom() {
  const { roomId = '' } = useParams()
  const { toast } = useToast()

  const [room, setRoom] = useState<SpaceRoom | null>(null)
  const [messages, setMessages] = useState<SpaceMessage[]>([])
  const [block, setBlock] = useState<string | null>(null)
  const [classmates, setClassmates] = useState<MentionCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<SpaceMessage | null>(null)
  const [sending, setSending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SpaceMessage | null>(null)
  const [busy, setBusy] = useState(false)
  const [reportTarget, setReportTarget] = useState<SpaceMessage | null>(null)

  const areaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLDivElement>(null)

  /**
   * The read pointer AS IT WAS when this room was opened.
   *
   * State, not a ref, and that distinction matters: it is read during render to
   * place the divider, so React has to know when it changes. It is also
   * captured exactly once per room — `markRead` moves the stored pointer
   * immediately afterwards, and if the divider tracked that it would slide down
   * to the bottom while you were still reading.
   */
  const [entryLastRead, setEntryLastRead] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const entry = getLastRead(roomId)
      setEntryLastRead(entry)
      const [rooms, page, why] = await Promise.all([
        listMyRooms(),
        getRoomMessages(roomId, { limit: PAGE }),
        getRoomPostBlock(roomId),
      ])
      const found = rooms.find((r) => r.id === roomId) ?? null
      setRoom(found)
      // The RPC returns newest-first for the cursor; display is oldest-first.
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

  useEffect(() => {
    void listLoungeClassmates()
      .then((rows) => setClassmates(rows.map((r) => ({ id: r.id, displayName: r.displayName }))))
      .catch(() => {
        /* mentions just stop resolving */
      })
  }, [])

  // Land at the newest message, or at the divider when there is one.
  useEffect(() => {
    if (loading) return
    const target = dividerRef.current ?? bottomRef.current
    target?.scrollIntoView({ block: 'center' })
  }, [loading])

  // Auto-grow, reset-to-auto first so the box can shrink again.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [body])

  // Page-scoped realtime, filtered to THIS room. Messages append at the bottom
  // where the reader already is, so unlike the Lounge feed there is nothing to
  // shift out from under them.
  useEffect(() => {
    if (!roomId) return
    const channel = uniqueChannel(`room-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'space_messages',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          // Refetch the newest page rather than patching from the payload: the
          // raw row has no reaction tallies, no `mentions_me` and no
          // `can_delete` — all computed per viewer by the RPC.
          void getRoomMessages(roomId, { limit: PAGE })
            .then((page) => {
              setMessages([...page].reverse())
              if (page.length > 0) markRead(roomId, page[0].createdAt)
            })
            .catch(() => {})
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'space_message_reactions',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void getRoomMessages(roomId, { limit: PAGE })
            .then((page) => setMessages([...page].reverse()))
            .catch(() => {})
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId])

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
        mentions: resolveMentions(text, classmates),
      })
      setBody('')
      setReplyTo(null)
      const page = await getRoomMessages(roomId, { limit: PAGE })
      setMessages([...page].reverse())
      if (page.length > 0) markRead(roomId, page[0].createdAt)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      // Slow mode may now be blocking; re-ask rather than guessing.
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
      const page = await getRoomMessages(roomId, { limit: PAGE })
      setMessages([...page].reverse())
    } catch (e) {
      toast(errorText(e, 'Could not react.'), 'error')
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await deleteMyMessage(deleteTarget.id)
      const page = await getRoomMessages(roomId, { limit: PAGE })
      setMessages([...page].reverse())
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

  const divider = useMemo(
    () => unreadDividerIndex(messages, entryLastRead),
    [messages, entryLastRead],
  )

  const over = body.length > MAX_MESSAGE_LENGTH
  const canSend = body.trim().length > 0 && !over && !sending && block === null

  return (
    <div className="space-y-3">
      <PageHeader
        title={room?.name ?? 'Chat'}
        subtitle={
          room
            ? room.kind === 'dm'
              ? 'Private · your instructor can review reported threads'
              : `${room.memberCount} ${room.memberCount === 1 ? 'person' : 'people'}`
            : undefined
        }
        fallback="/app/space/chats"
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
                const grouped =
                  !!prev &&
                  prev.authorStudentId === m.authorStudentId &&
                  prev.displayName === m.displayName &&
                  Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_GAP_MS &&
                  i !== divider
                return (
                  <div key={m.id}>
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
                      grouped={grouped}
                      canReact={block === null}
                      onReact={react}
                      onReply={setReplyTo}
                      onDelete={setDeleteTarget}
                      onReport={setReportTarget}
                    />
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}

          <StickyBar>
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

              {block ? (
                <p className="px-1 py-1.5 text-xs font-medium text-warn">{block}</p>
              ) : (
                <div className="flex items-end gap-2">
                  <textarea
                    ref={areaRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
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
