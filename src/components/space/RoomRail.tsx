import { useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Input } from '@/components/ui/Input'
import { IconButton } from '@/components/ui/IconButton'
import { ErrorState } from '@/components/ui/EmptyState'
import { BellIcon, SearchIcon, XIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { getLevelProgress } from '@/lib/leveling'
import { sectionColor } from '@/lib/sectionColor'
import { parseInline, parseMessageBody } from '@/lib/message-body'
import type {
  RoomAudience,
  RoomNotifyLevel,
  RoomPin,
  SpaceMessage,
  SpacePerson,
  SpaceRoom,
} from '@/lib/types'
import type { CSSProperties } from 'react'

/**
 * The room panel — who is here, what is pinned, what has been shared.
 *
 * ONE component, TWO mounts: the desktop rail beside the thread and the sheet
 * behind the ⋯ button on a phone. That is deliberate — a parallel mobile copy
 * is how the two would drift, and this codebase has four separate cases of
 * exactly that (the points row reached four copies, the show-up rate five).
 *
 * ── EVERYTHING HERE IS DERIVED, NOT FETCHED ────────────────────────────────
 * Members come from the roster `ChatRoom` already loads for the XP rings and
 * mention resolution; shared links, code, search results and mentions are all
 * read out of the messages already on screen. Only pins have their own query,
 * because a pinned message is usually far above the loaded page.
 *
 * The consequence is worth stating plainly on screen rather than hiding: search
 * and Shared cover the loaded history, not the whole room. "Load older" widens
 * them, and the panel says so.
 */

type Tab = 'people' | 'pinned' | 'shared' | 'mentions'

const TABS: { value: Tab; label: string }[] = [
  { value: 'people', label: 'People' },
  { value: 'pinned', label: 'Pinned' },
  { value: 'shared', label: 'Shared' },
  { value: 'mentions', label: '@You' },
]

/** Gold, silver, bronze — the same ramp the message rows use. */
const MEDAL: Record<number, string> = { 1: 'text-reward', 2: 'text-muted', 3: 'text-warn' }

const LEVELS: { value: RoomNotifyLevel; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mentions', label: 'Mentions' },
  { value: 'none', label: 'Off' },
]

/** Below this, "Top of the room" would just be the room listed twice. */
const TOP_MIN_MEMBERS = 8

function excerpt(body: string | null, max = 90): string {
  const flat = (body ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat || 'message removed'
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (!Number.isFinite(mins)) return ''
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.round(mins / 60)}h`
  return `${Math.round(mins / 1440)}d`
}

function PersonLine({
  person,
  name,
  avatarUrl,
  showSectionDot,
  isMe,
  isInstructor,
  onClick,
}: {
  person?: SpacePerson
  name: string
  avatarUrl: string | null
  showSectionDot?: boolean
  isMe?: boolean
  isInstructor?: boolean
  onClick?: () => void
}) {
  const medal = person?.rank != null && person.rank <= 3 ? MEDAL[person.rank] : null
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors',
        onClick ? 'hover:bg-card-2' : 'cursor-default',
      )}
    >
      <Avatar name={name} url={avatarUrl} className="h-8 w-8 shrink-0" textClassName="text-2xs" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          {showSectionDot && person?.sectionId && (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--dot)] dark:bg-[var(--dot-dark)]"
              style={
                {
                  '--dot': sectionColor(person.sectionId, false),
                  '--dot-dark': sectionColor(person.sectionId, true),
                } as CSSProperties
              }
            />
          )}
          <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
          {isMe && <span className="shrink-0 text-2xs font-semibold text-accent">you</span>}
        </span>
        <span className="flex items-center gap-1.5 text-2xs text-muted">
          {isInstructor ? (
            <span className="font-semibold text-reward">Instructor</span>
          ) : person ? (
            <>
              <span className="tabular-nums">
                Lv {getLevelProgress(person.semesterPoints).level}
              </span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{person.semesterPoints} pts</span>
            </>
          ) : (
            <span>In this room</span>
          )}
        </span>
      </span>
      {medal && (
        <span className={cn('shrink-0 text-2xs font-bold tabular-nums', medal)}>
          #{person?.rank}
        </span>
      )}
    </button>
  )
}

/** A tappable line that jumps back to a message in the thread. */
function JumpLine({
  who,
  text,
  when,
  onJump,
  trailing,
}: {
  who: string
  text: string
  when: string
  onJump: () => void
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-1">
      <button
        type="button"
        onClick={onJump}
        className="min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-card-2"
      >
        <span className="flex items-baseline gap-1.5">
          <span className="min-w-0 truncate text-2xs font-semibold text-muted">{who}</span>
          <span className="shrink-0 text-2xs text-muted">{when}</span>
        </span>
        <span className="mt-0.5 block break-words text-xs text-ink">{text}</span>
      </button>
      {trailing}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-6 text-center text-xs text-muted">{children}</p>
}

/** A circular icon over its own label — the reference's quick-action shape. */
function RoundAction({
  label,
  icon,
  onClick,
  active,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-16 flex-col items-center gap-1.5 text-2xs font-semibold text-muted transition-colors hover:text-ink"
    >
      <span
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
          active ? 'bg-accent-solid/15 text-accent' : 'bg-card-2 text-ink',
        )}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  )
}

export function RoomRail({
  room,
  audience,
  people,
  messages,
  pins,
  myStudentId,
  unreadCount,
  variant = 'rail',
  peopleError,
  onRetryPeople,
  level,
  onSetLevel,
  onJump,
  onJumpToUnread,
  onOpenPerson,
  onUnpin,
  onToggleMute,
}: {
  room: SpaceRoom | null
  audience: RoomAudience | null
  /** Everyone with Space access — filtered to this room's members below. */
  people: SpacePerson[]
  /** The messages currently loaded in the thread. */
  messages: SpaceMessage[]
  pins: RoomPin[]
  myStudentId: string | null
  unreadCount: number
  /**
   * `rail` sits beside the thread, where the chat header already names the room
   * — so it opens straight into the search box. `screen` is a destination of
   * its own on a phone and brings the identity block the reference expects.
   */
  variant?: 'rail' | 'screen'
  /**
   * Set when the roster fetch failed. It is rendered instead of the list —
   * "Nobody else is in here yet" is a LIE when the truth is "that request did
   * not come back", and it is told to the one person who could fix it.
   */
  peopleError?: string | null
  onRetryPeople?: () => void
  /** Undefined until it has loaded; the control is hidden until then. */
  level?: RoomNotifyLevel
  onSetLevel?: (level: RoomNotifyLevel) => void
  onJump: (messageId: string) => void
  onJumpToUnread: () => void
  onOpenPerson: (m: SpaceMessage) => void
  onUnpin?: (messageId: string) => void
  /** Screen variant only — on the rail, Mute lives in the chat header. */
  onToggleMute?: () => void
}) {
  const [tab, setTab] = useState<Tab>('people')
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const screen = variant === 'screen'

  const members = useMemo(() => {
    if (!audience) return people
    if (audience.kind === 'section') {
      return audience.sectionId
        ? people.filter((p) => p.sectionId === audience.sectionId)
        : people
    }
    if (audience.kind === 'dm') {
      const ids = new Set(audience.memberIds ?? [])
      return people.filter((p) => ids.has(p.id))
    }
    return people
  }, [audience, people])

  /**
   * Rank first (nulls last), then points — the leaderboard's own order.
   *
   * Shown only in a room big enough for the full list to be a scroll. Below
   * that the top five ARE most of the room, and printing them twice in a row is
   * the kind of redundancy that makes a panel feel like filler.
   */
  const top = useMemo(
    () =>
      members.length <= TOP_MIN_MEMBERS
        ? []
        : [...members]
            .sort(
              (a, b) =>
                (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
                b.semesterPoints - a.semesterPoints,
            )
            .slice(0, 5),
    [members],
  )

  /**
   * Links and code blocks, newest first. Read straight out of the rendered
   * bodies, so what is listed here is exactly what is drawn in the thread.
   */
  const shared = useMemo(() => {
    const out: { id: string; kind: 'link' | 'code'; label: string; who: string; when: string }[] = []
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (!m.body || m.deletedAt || m.hiddenAt) continue
      for (const part of parseMessageBody(m.body)) {
        if (part.kind === 'mono') {
          out.push({
            id: m.id,
            kind: 'code',
            label: part.content.split('\n')[0] || 'code',
            who: m.displayName,
            when: m.createdAt,
          })
        } else {
          for (const token of parseInline(part.content)) {
            if (token.kind === 'link') {
              out.push({
                id: m.id,
                kind: 'link',
                label: token.content,
                who: m.displayName,
                when: m.createdAt,
              })
            }
          }
        }
      }
    }
    return out
  }, [messages])

  const mentions = useMemo(
    () => [...messages].reverse().filter((m) => m.mentionsMe && !m.deletedAt),
    [messages],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return null
    return [...messages]
      .reverse()
      .filter((m) => (m.body ?? '').toLowerCase().includes(q))
      .slice(0, 50)
  }, [messages, query])

  /** A member row opens the same sheet a tapped avatar does. */
  const openPerson = (p: SpacePerson) =>
    onOpenPerson({
      id: `person-${p.id}`,
      authorStudentId: p.id,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      body: null,
      replyToId: null,
      replyToName: null,
      replyToExcerpt: null,
      mentionsMe: false,
      canDelete: false,
      reactions: {},
      myReactions: [],
      hiddenAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
    })

  const memberTotal = members.length + (audience?.hasInstructor ? 1 : 0)

  return (
    <div className="space-y-3">
      {screen && (
        // The identity block — avatar, name, and the two things you reach for
        // most as round buttons. On the rail this would restate the chat header
        // one line above it.
        <div className="flex flex-col items-center gap-2 pb-1 pt-3 text-center">
          <Avatar
            name={room?.name ?? 'Room'}
            url={null}
            className="h-20 w-20"
            textClassName="text-2xl"
          />
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-bold">{room?.name ?? 'Room'}</h3>
            {/* The SERVER's count, not the length of the list below it. They
                disagree exactly when the roster fetch failed, and in that case
                the number that is true is the one the room actually has. */}
            <p className="truncate text-xs text-muted">
              {room?.kind === 'dm'
                ? 'Private · your instructor can review reported threads'
                : `${room?.memberCount ?? memberTotal} ${
                    (room?.memberCount ?? memberTotal) === 1 ? 'person' : 'people'
                  }`}
            </p>
          </div>
          <div className="mt-1 flex items-center gap-6">
            {onToggleMute && (
              <RoundAction
                label={room?.muted ? 'Unmute' : 'Mute'}
                onClick={onToggleMute}
                active={!!room?.muted}
                icon={<BellIcon className="h-5 w-5" />}
              />
            )}
            <RoundAction
              label="Search"
              onClick={() => searchRef.current?.focus()}
              icon={<SearchIcon className="h-5 w-5" />}
            />
          </div>
        </div>
      )}

      {unreadCount > 0 && (
        <button
          type="button"
          onClick={onJumpToUnread}
          className="flex w-full items-center justify-between rounded-xl border border-accent-solid/30 bg-accent-solid/10 px-3 py-2 text-left"
        >
          <span className="text-xs font-semibold text-accent">
            {unreadCount} unread message{unreadCount === 1 ? '' : 's'}
          </span>
          <span aria-hidden="true" className="text-xs text-accent">
            Jump ↑
          </span>
        </button>
      )}

      {/* A room SETTING, so it sits with search above the tabs rather than
          inside one of them — and it is the same control in both variants, so
          the rail and the phone panel cannot offer different options. The
          round Mute button above is a shortcut into the same state, never a
          second source of it. */}
      {level && onSetLevel && (
        <div>
          <p className="px-1 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted">
            Notify me
          </p>
          <SegmentedControl
            value={level}
            onChange={onSetLevel}
            label="Notifications for this room"
            options={LEVELS}
          />
        </div>
      )}

      <Input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search this room"
        aria-label="Search this room"
        className="h-10!"
      />

      {results ? (
        <div>
          {/* Said out loud rather than hidden: this searches what is loaded. */}
          <p className="px-2 pb-1 text-2xs text-muted">
            {results.length === 0
              ? 'Nothing in the loaded messages.'
              : `${results.length} in the loaded messages`}
            {' · '}
            <button
              type="button"
              onClick={() => setQuery('')}
              className="font-semibold text-accent underline underline-offset-2"
            >
              Clear
            </button>
          </p>
          {results.map((m) => (
            <JumpLine
              key={m.id}
              who={m.displayName}
              text={excerpt(m.body)}
              when={timeAgo(m.createdAt)}
              onJump={() => onJump(m.id)}
            />
          ))}
        </div>
      ) : (
        <>
          <SegmentedControl
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            options={TABS}
            label="Room panel"
          />

          {tab === 'people' && peopleError ? (
            <ErrorState
              inline
              onRetry={onRetryPeople}
              detail="Everyone is still in the room — this is the list that did not load."
            >
              {peopleError}
            </ErrorState>
          ) : tab === 'people' ? (
            <div className="space-y-3">
              {top.length > 0 && (
                <div>
                  <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted">
                    Top of the room
                  </p>
                  {top.map((p) => (
                    <PersonLine
                      key={`top-${p.id}`}
                      person={p}
                      name={p.displayName}
                      avatarUrl={p.avatarUrl}
                      showSectionDot={room?.kind === 'global'}
                      isMe={p.id === myStudentId}
                      onClick={() => openPerson(p)}
                    />
                  ))}
                </div>
              )}
              <div>
                <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted">
                  Everyone · {memberTotal}
                </p>
                {audience?.hasInstructor && (
                  <PersonLine name="Instructor" avatarUrl={null} isInstructor />
                )}
                {members.map((p) => (
                  <PersonLine
                    key={p.id}
                    person={p}
                    name={p.displayName}
                    avatarUrl={p.avatarUrl}
                    showSectionDot={room?.kind === 'global'}
                    isMe={p.id === myStudentId}
                    onClick={() => openPerson(p)}
                  />
                ))}
                {members.length === 0 && <Empty>Nobody else is in here yet.</Empty>}
              </div>
            </div>
          ) : null}

          {tab === 'pinned' && (
            <div>
              {pins.length === 0 ? (
                <Empty>Nothing pinned. Hold a message and choose Pin.</Empty>
              ) : (
                pins.map((p) => (
                  <JumpLine
                    key={p.messageId}
                    who={p.displayName}
                    text={excerpt(p.body)}
                    when={timeAgo(p.createdAt)}
                    onJump={() => onJump(p.messageId)}
                    trailing={
                      p.canUnpin && onUnpin ? (
                        <IconButton
                          label="Unpin"
                          variant="danger"
                          size="sm"
                          expandHitArea={false}
                          icon={<XIcon className="h-4 w-4" />}
                          onClick={() => onUnpin(p.messageId)}
                        />
                      ) : undefined
                    }
                  />
                ))
              )}
            </div>
          )}

          {tab === 'shared' && (
            <div>
              {shared.length === 0 ? (
                <Empty>No links or code in the loaded messages.</Empty>
              ) : (
                shared.map((s, i) => (
                  <JumpLine
                    key={`${s.id}-${i}`}
                    who={`${s.who} · ${s.kind === 'code' ? 'code' : 'link'}`}
                    text={s.label}
                    when={timeAgo(s.when)}
                    onJump={() => onJump(s.id)}
                  />
                ))
              )}
            </div>
          )}

          {tab === 'mentions' && (
            <div>
              {mentions.length === 0 ? (
                <Empty>Nobody has @mentioned you in the loaded messages.</Empty>
              ) : (
                mentions.map((m) => (
                  <JumpLine
                    key={m.id}
                    who={m.displayName}
                    text={excerpt(m.body)}
                    when={timeAgo(m.createdAt)}
                    onJump={() => onJump(m.id)}
                  />
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
