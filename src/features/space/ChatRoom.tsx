import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
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
import { AstronautArt } from '@/components/space/AstronautArt'
import { RoomRail } from '@/components/space/RoomRail'
import { ReportSheet } from '@/components/space/ReportSheet'
import { IconButton } from '@/components/ui/IconButton'
import { MoreIcon, PanelIcon } from '@/components/ui/icons'
import { useStudentDataOptional } from '@/features/student/StudentData'
import {
  StudentProfilePreview,
  type PreviewTarget,
} from '@/features/student/StudentProfilePreview'
import {
  deleteMyMessage,
  getRoomAudience,
  getRoomLevel,
  getRoomMessages,
  getRoomPostBlock,
  listMyRooms,
  listRoomPins,
  listSpacePeople,
  pinMessage,
  startDm,
  reactToMessage,
  sendMessage,
  setRoomLevel,
  setRoomMuted,
  unpinMessage,
  type MessageCursor,
} from '@/lib/api'
import { supabase, uniqueChannel } from '@/lib/supabase'
import { errorText } from '@/lib/errors'
import {
  applyMention,
  matchMentions,
  mentionQuery,
  resolveMentions,
  type MentionCandidate,
  type MentionQuery,
} from '@/lib/mentions'
import { getLastRead, markRead, unreadDividerIndex } from '@/lib/unread'
import { getLevelProgress } from '@/lib/leveling'
import { noteTyping, shouldBroadcast, typingLabel, type TypingEntry } from '@/lib/typing'
import { joinTypingChannel, type TypingChannel } from '@/lib/typing-channel'
import { Sheet } from '@/components/ui/Sheet'
import { Avatar } from '@/components/ui/Avatar'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'
import {
  MAX_MESSAGE_LENGTH,
  type ReactionCode,
  type RoomAudience,
  type RoomNotifyLevel,
  type RoomPin,
  type SpaceMessage,
  type SpacePerson,
  type SpaceRoom,
} from '@/lib/types'

/** Remembered per device, so the rail does not reopen on every room. */
const RAIL_KEY = 'cp_room_rail_v1'

function readRailPref(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) !== '0'
  } catch {
    // A private window or blocked site data — default to showing it.
    return true
  }
}

/**
 * A half-typed message survives leaving the room.
 *
 * localStorage, not a table: a draft is per-device by definition, and the only
 * thing worse than losing one is the server having a copy of what you decided
 * not to send. Cleared on a successful send.
 */
const DRAFT_KEY = (roomId: string) => `cp_room_draft_v1:${roomId}`

function readDraft(roomId: string): string {
  try {
    return window.localStorage.getItem(DRAFT_KEY(roomId)) ?? ''
  } catch {
    return ''
  }
}

function writeDraft(roomId: string, text: string) {
  try {
    if (text.trim() === '') window.localStorage.removeItem(DRAFT_KEY(roomId))
    else window.localStorage.setItem(DRAFT_KEY(roomId), text)
  } catch {
    /* the composer still works; the draft just will not survive */
  }
}

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
 * ── THE LAYOUT ─────────────────────────────────────────────────────────────
 * The composer clears the fixed mobile tab bar via `StickyBar`
 * (`sticky bottom-19 md:bottom-4`), which already owns that height in one
 * place. The HEADER is sticky for the mirror-image reason: in a long room it
 * scrolled away and took the back button with it, which is how you end up
 * stuck inside a conversation with no way out.
 *
 * Everything from `Shell`'s <main> down to here is a COLUMN FLEX when the route
 * is `wide`, and the message list is the `flex-1` child. That is what keeps the
 * composer at the bottom of the viewport in a room with three messages in it —
 * the thread takes the slack instead of the composer floating up to meet the
 * last message. The height comes from the `min-h-[100dvh]` the shell already
 * has, so no `calc(100dvh - …)` has to agree with four paddings.
 *
 * ⚠ `lg:grid-rows-[minmax(0,1fr)]` is load-bearing. Without an explicit row the
 * grid sizes it to content, and the rail — which is capped at a viewport-
 * relative height — became the tallest thing in the row and pushed the PAGE
 * past the viewport in a room with two messages. The row now takes its height
 * from the grid, and the rail fills it.
 */

/**
 * Three dots that rise in sequence, beside "X is typing…".
 *
 * framer-motion rather than a CSS keyframe, unlike the leaderboard's flame:
 * exactly one of these exists at a time, so the forty-springs argument does not
 * apply — and `MotionConfig reducedMotion="user"` in App.tsx switches it off
 * without a second rule to remember.
 */
function TypingDots() {
  return (
    <span aria-hidden="true" className="flex shrink-0 items-end gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1 w-1 rounded-full bg-muted"
          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
        />
      ))}
    </span>
  )
}

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
  const [profileTarget, setProfileTarget] = useState<PreviewTarget | null>(null)
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
  const [pins, setPins] = useState<RoomPin[]>([])
  const [audience, setAudience] = useState<RoomAudience | null>(null)
  const [railOpen, setRailOpen] = useState(readRailPref)
  const [panelOpen, setPanelOpen] = useState(false)
  const [peopleError, setPeopleError] = useState<string | null>(null)
  const [level, setLevel] = useState<RoomNotifyLevel | undefined>(undefined)
  const [mention, setMention] = useState<MentionQuery | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  const areaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLDivElement>(null)
  const typingRef = useRef<TypingChannel | null>(null)
  const lastTypingSentRef = useRef<number | null>(null)
  // A ref as well as state: the realtime handler reads it, and must not have to
  // re-subscribe to see a new value.
  const atBottomRef = useRef(true)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      setBody(readDraft(roomId))
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
  // medal, the section dot, the People panel AND mention resolution — the
  // alternative was five sources for five things beside one name.
  //
  // ⚠ The failure is SURFACED, not swallowed. It used to be a bare
  // `.catch(() => {})`, and when `get_space_people` was missing from the
  // database the People panel calmly reported "Nobody else is in here yet" —
  // a lie, told to the one person who could have fixed it. Same class of bug
  // as the attendance screen that told a student they had no record at all.
  const loadPeople = useCallback(() => {
    setPeopleError(null)
    void listSpacePeople()
      .then(setPeople)
      .catch((e) => setPeopleError(errorText(e, 'Could not load who is in this room.')))
  }, [])

  useEffect(loadPeople, [loadPeople])

  /**
   * The panel's own two reads, off the critical path and each failing soft:
   * an empty People list or an empty Pinned tab is a worse outcome than a
   * blank rail, but neither is worth taking the thread down for. 0046 is the
   * migration behind `get_room_pins` — until it is applied this throws and the
   * Pinned tab is simply empty, exactly like the 0034 SectionGrid precedent.
   */
  const loadPanel = useCallback(() => {
    void listRoomPins(roomId)
      .then(setPins)
      .catch(() => setPins([]))
    void getRoomAudience(roomId)
      .then(setAudience)
      .catch(() => setAudience(null))
    void getRoomLevel(roomId)
      .then(setLevel)
      // Until 0048 lands this column does not exist; the control stays hidden
      // rather than offering a setting that cannot be saved.
      .catch(() => setLevel(undefined))
  }, [roomId])

  useEffect(loadPanel, [loadPanel])

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
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [roomId, refreshNewest])

  /**
   * Typing rides its OWN channel, on a SHARED topic.
   *
   * It used to ride the channel above — and that channel's topic carries a
   * random suffix, so two people in one room were on two different topics and
   * a broadcast could never reach the other. `postgres_changes` did not care
   * (those are server-side subscriptions), which is why everything else worked
   * and only this was dead. See lib/typing-channel.ts.
   */
  useEffect(() => {
    if (!roomId) return
    const ch = joinTypingChannel(roomId, (name) => setTypers((cur) => noteTyping(cur, name)))
    typingRef.current = ch
    return () => {
      typingRef.current = null
      ch.leave()
    }
  }, [roomId])

  function announceTyping() {
    const now = Date.now()
    if (!shouldBroadcast(lastTypingSentRef.current, now)) return
    lastTypingSentRef.current = now
    typingRef.current?.announce(student?.me?.display_name ?? 'Instructor')
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
      writeDraft(roomId, '')
      setMention(null)
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

  /**
   * The header's Mute pill and the panel's three-way control are ONE setting.
   *
   * Both land here, so `muted` on the room and `level` in the panel can never
   * show different answers — the same reason `space_room_prefs.muted` is a
   * generated column server-side.
   */
  async function changeLevel(next: RoomNotifyLevel) {
    if (!room) return
    const before = level
    setLevel(next)
    setRoom({ ...room, muted: next === 'none' })
    try {
      await setRoomLevel(room.id, next)
    } catch (e) {
      setLevel(before)
      setRoom({ ...room, muted: before === 'none' })
      toast(errorText(e, 'Could not change that.'), 'error')
    }
  }

  async function toggleMute() {
    if (!room) return
    // Before 0048 there is no `level` to read, so fall back to the boolean the
    // room already carries. Same call either way once it lands.
    if (level) return changeLevel(level === 'none' ? 'mentions' : 'none')
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
    // Closing the sheet first, or the jump scrolls a page nobody can see.
    setPanelOpen(false)
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-accent-solid/60')
    window.setTimeout(() => el.classList.remove('ring-2', 'ring-accent-solid/60'), 1400)
  }

  async function togglePin(m: SpaceMessage, next: boolean) {
    try {
      if (next) await pinMessage(roomId, m.id)
      else await unpinMessage(roomId, m.id)
      setPins(await listRoomPins(roomId))
      toast(next ? 'Pinned.' : 'Unpinned.', 'success')
    } catch (e) {
      toast(errorText(e, 'Could not change the pins.'), 'error')
    }
  }

  function toggleRail() {
    setRailOpen((v) => {
      try {
        window.localStorage.setItem(RAIL_KEY, v ? '0' : '1')
      } catch {
        /* the rail still toggles; it just will not be remembered */
      }
      return !v
    })
  }

  function jumpToUnread() {
    setPanelOpen(false)
    dividerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  /** Keep the @picker in step with what is under the caret. */
  function syncMention(value: string, caret: number) {
    const q = mentionQuery(value.slice(0, caret))
    setMention(q)
    setMentionIndex(0)
  }

  function chooseMention(c: MentionCandidate) {
    const el = areaRef.current
    if (!el || !mention) return
    const caret = el.selectionStart ?? body.length
    const next = applyMention(body, mention.start, caret, c.displayName)
    setBody(next.value)
    writeDraft(roomId, next.value)
    setMention(null)
    // Focus and caret restored in the same frame, or the picker closing steals
    // the cursor to the end of the message.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.caret, next.caret)
    })
  }

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const mentionCandidates: MentionCandidate[] = useMemo(
    () => people.map((p) => ({ id: p.id, displayName: p.displayName })),
    [people],
  )
  // The same roster, as names, for STYLING `@Name` in a rendered message. The
  // instructor has no row in `people`, so their name is added here or a mention
  // of them would be the one that never lights up.
  const mentionNames = useMemo(
    () => [...people.map((p) => p.displayName), 'Instructor'],
    [people],
  )
  const mentionMatches = useMemo(
    () => (mention ? matchMentions(mention.query, mentionCandidates) : []),
    [mention, mentionCandidates],
  )

  const divider = useMemo(
    () => unreadDividerIndex(messages, entryLastRead),
    [messages, entryLastRead],
  )
  const typing = typingLabel(typers)
  const over = body.length > MAX_MESSAGE_LENGTH
  const canSend = body.trim().length > 0 && !over && !sending && block === null

  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.messageId)), [pins])
  // `divider` is the index of the first unseen message, or -1 when there is
  // nothing to divide — so the count is everything from there on.
  const unreadCount = divider >= 0 ? messages.length - divider : 0

  const renderPanel = (variant: 'rail' | 'screen') => (
    <RoomRail
      room={room}
      audience={audience}
      people={people}
      messages={messages}
      pins={pins}
      myStudentId={myStudentId}
      unreadCount={unreadCount}
      variant={variant}
      peopleError={peopleError}
      onRetryPeople={loadPeople}
      level={level}
      onSetLevel={(next) => void changeLevel(next)}
      onToggleMute={variant === 'screen' ? () => void toggleMute() : undefined}
      onJump={jumpToParent}
      onJumpToUnread={jumpToUnread}
      // Close the panel sheet FIRST on mobile — two portalled overlays stacking
      // their focus traps is a bug this app has already shipped once.
      onOpenPerson={(m) => {
        setPanelOpen(false)
        setPersonTarget(m)
      }}
      onUnpin={(id) => void togglePin({ id } as SpaceMessage, false)}
    />
  )

  return (
    // A column, so the thread can take the slack and the composer can sit at
    // the bottom of the viewport when a room only has three messages in it.
    <div className="flex flex-1 flex-col gap-3">
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
              // gap-2 is the IconButton adjacency floor for `md`: two 36px
              // buttons with 8px between them have exactly touching 44px hit
              // areas, and any less means a tap near the seam hits the wrong one.
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggleMute()}
                  className="shrink-0 rounded-full border border-line px-2.5 py-1 text-2xs font-semibold text-muted transition-colors hover:text-ink"
                >
                  {room.muted ? 'Unmute' : 'Mute'}
                </button>
                {/* Two controls, one job, split by CSS rather than by a JS media
                    query: the sheet portals to <body>, so it cannot simply be
                    hidden at lg. Same reasoning as the account menu. */}
                <IconButton
                  label={railOpen ? 'Hide room panel' : 'Show room panel'}
                  className="hidden lg:inline-flex"
                  icon={<PanelIcon className="h-5 w-5" />}
                  onClick={toggleRail}
                />
                <IconButton
                  label="Room menu"
                  className="lg:hidden"
                  icon={<MoreIcon className="h-5 w-5" />}
                  onClick={() => setPanelOpen(true)}
                />
              </div>
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
        // The rail lives BESIDE the thread from lg up, and the whole grid
        // collapses to one column below it — where the same panel is one tap
        // away behind the ⋯ button instead.
        <div
          className={cn(
            'flex flex-1 flex-col lg:grid lg:grid-rows-[minmax(0,1fr)] lg:items-stretch lg:gap-4',
            // The rail grows with the screen rather than the thread taking all
            // of it: at 1024 a fixed 288px would leave the thread 400px, and at
            // 2560 a 288px rail beside a 2200px thread looks like an accident.
            railOpen &&
              'lg:grid-cols-[minmax(0,1fr)_15rem] xl:grid-cols-[minmax(0,1fr)_18rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]',
          )}
        >
          <div className="flex min-w-0 flex-1 flex-col">
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
            <EmptyState
              className="flex-1"
              icon={<AstronautArt variant="space" size="md" />}
              description="Say something first — somebody has to."
            >
              Nobody has said anything yet.
            </EmptyState>
          ) : (
            // `flex-1` is what pins the composer to the bottom of a nearly-empty
            // room: the thread takes the slack instead of the composer floating
            // up to meet the last message. `pb-3` keeps the newest message clear
            // of the composer's card when the two meet at full scroll.
            <div className="flex-1 pb-3">
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

                // A hairline wherever the speaker changes and nothing louder is
                // already being drawn. With no bubbles the column is one
                // continuous block of text, and in a busy room the eye needs
                // somewhere to break. Indented past the avatar gutter (28px +
                // the 8px gap) so it separates the TALK, not the whole row.
                const showRule = !!prev && !showTime && i !== divider && !joinsPrev

                return (
                  <div key={m.id}>
                    {showRule && <div aria-hidden="true" className="ml-9 mt-2 h-px bg-line" />}
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
                      mentionNames={mentionNames}
                      canReact={block === null}
                      onReact={react}
                      onReply={setReplyTo}
                      onDelete={setDeleteTarget}
                      onReport={setReportTarget}
                      onJumpToParent={jumpToParent}
                      onOpenPerson={setPersonTarget}
                      // Anyone who can POST can pin — the same one answer the
                      // composer reads, so the two can never disagree about a
                      // timed-out student.
                      onPin={block === null ? (msg, next) => void togglePin(msg, next) : undefined}
                      pinned={pinnedIds.has(m.id)}
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

              {/* The @picker sits ABOVE the composer and below the reply quote,
                  so the list never covers the field you are typing into. */}
              {mentionMatches.length > 0 && (
                <div
                  role="listbox"
                  aria-label="Mention someone"
                  className="mb-2 max-h-56 overflow-y-auto rounded-xl border border-line bg-card-2 p-1"
                >
                  {mentionMatches.map((c, i) => {
                    const person = peopleById.get(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={i === mentionIndex}
                        // pointerDown, not click: the textarea's onBlur closes
                        // the picker, and blur lands first on a click.
                        onPointerDown={(e) => {
                          e.preventDefault()
                          chooseMention(c)
                        }}
                        onMouseEnter={() => setMentionIndex(i)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                          i === mentionIndex ? 'bg-accent-solid/15' : 'hover:bg-card',
                        )}
                      >
                        <Avatar
                          name={c.displayName}
                          url={person?.avatarUrl ?? null}
                          className="h-6 w-6 shrink-0"
                          textClassName="text-2xs"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {c.displayName}
                        </span>
                        {person && (
                          <span className="shrink-0 text-2xs tabular-nums text-muted">
                            Lv {getLevelProgress(person.semesterPoints).level}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {typing && (
                <p className="mb-1 flex items-center gap-1.5 truncate px-1 text-2xs italic text-muted">
                  <TypingDots />
                  {typing}
                </p>
              )}

              {block ? (
                <p className="px-1 py-1.5 text-xs font-medium text-warn">{block}</p>
              ) : (
                <div className="flex items-end gap-2">
                  <textarea
                    ref={areaRef}
                    value={body}
                    onChange={(e) => {
                      const next = e.target.value
                      setBody(next)
                      writeDraft(roomId, next)
                      syncMention(next, e.target.selectionStart ?? next.length)
                      if (next.trim()) announceTyping()
                    }}
                    onKeyUp={(e) =>
                      // Arrow keys and clicks move the caret without changing
                      // the text, and the picker follows the CARET.
                      syncMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
                    }
                    onClick={(e) =>
                      syncMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
                    }
                    onBlur={() => setMention(null)}
                    onKeyDown={(e) => {
                      // The mention picker owns these keys while it is open, or
                      // Enter would send "@ma" instead of choosing Maria.
                      if (mentionMatches.length > 0) {
                        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                          e.preventDefault()
                          setMentionIndex(
                            (i) =>
                              (i + (e.key === 'ArrowDown' ? 1 : -1) + mentionMatches.length) %
                              mentionMatches.length,
                          )
                          return
                        }
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          e.preventDefault()
                          chooseMention(mentionMatches[mentionIndex])
                          return
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setMention(null)
                          return
                        }
                      }
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
          </div>

          {railOpen && (
            // Its own scroller, so a 40-person roster does not drag the thread
            // down with it. `overflow-y-auto` makes overflow-x `auto` too per
            // spec — which is fine here because nothing inside bleeds past the
            // padding, and it is exactly why nothing inside may start to.
            /* A FULL-HEIGHT column, not a card that stops where its content
               does — `lg:items-stretch` on the grid is what makes it fill.
               The cap is 10rem, not 7: 6rem is the sticky offset and the rest
               is the chrome above and below (main's pt-8/pb-12 plus the gap).
               At 7rem the rail was TALLER than the space it sits in and pushed
               the page 45px past the viewport in a two-message room. */
            <aside className="sticky top-24 hidden max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-2xl border border-line bg-card/40 p-2 lg:block">
              {renderPanel('rail')}
            </aside>
          )}
        </div>
      )}

      {/* The same panel on a phone — but a FULL SCREEN with a back button, not
          a bottom sheet. It is a destination (who is here, what is pinned, what
          was shared), and a half-height sheet made a 40-person roster scroll
          inside a scroller. ONE component, two mounts. */}
      <Sheet
        variant="screen"
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={room?.name ?? 'Room'}
      >
        <div className="pb-2">{renderPanel('screen')}</div>
      </Sheet>

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
                    {/* There is no ROUTE for someone else's profile — it is a
                        sheet, the same one the leaderboard opens. This used to
                        `navigate('/app/profile')`, which is YOUR profile: the
                        button worked, went somewhere, and showed the wrong
                        person, which is the worst shape a bug can take. */}
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setPersonTarget(null)
                        setProfileTarget({
                          student_id: t.authorStudentId!,
                          display_name: t.displayName,
                          section_id: person?.sectionId ?? '',
                          points: person?.semesterPoints ?? 0,
                          avatar_url: t.avatarUrl,
                          rank: person?.rank ?? null,
                        })
                      }}
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

      {/* The SAME sheet the leaderboard opens, so a classmate's profile looks
          identical wherever you tap it. `sectionLabel` is the room's own name
          when the room IS a section — in Global the members span sections and
          the preview simply shows the level, which is honest rather than a
          guessed label. */}
      <StudentProfilePreview
        target={profileTarget}
        open={!!profileTarget}
        onClose={() => setProfileTarget(null)}
        isMe={!!profileTarget && myStudentId === profileTarget.student_id}
        sectionLabel={room?.kind === 'section' ? room.name : ''}
      />

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
