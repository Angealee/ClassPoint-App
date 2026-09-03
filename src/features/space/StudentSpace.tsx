import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { AstronautArt } from '@/components/space/AstronautArt'
import { BetaBanner } from '@/components/space/BetaBanner'
import { useStudentData } from '@/features/student/StudentData'
import { isMuted, spaceChip } from '@/lib/space-gate'
import { getLoungeFeed, getOpenEvent, listMyRooms } from '@/lib/api'
import { isRoomUnread } from '@/lib/unread'
import { countdownTo } from '@/lib/time'
import type { LoungeEvent, LoungePost, SpaceRoom } from '@/lib/types'

/**
 * `/app/space` — one route, three states.
 *
 * The ROUTE is mounted in every state on purpose. A student who types the URL,
 * follows a stale push notification, or lands here from a deep link after
 * losing access gets an explanation instead of a blank screen or a redirect
 * they cannot interpret. The nav row links in every state for the same reason
 * (see the note in lib/space-gate.ts).
 *
 * Which state a student is in is never decided here — `cp_space_state()` in
 * 0041 decides, and this file renders the answer.
 */

/** When a mute lifts, in the student's own timezone. Everyone here is in Manila. */
function untilLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'soon'
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function SpaceHeader({ state }: { state: 'open' | 'paused' | 'locked' }) {
  const chip = spaceChip(state)
  return (
    <div className="flex items-center gap-3">
      <h1 className="font-display text-2xl font-bold">Student Space</h1>
      <Chip tone={chip.tone} size="sm">
        {chip.label}
      </Chip>
    </div>
  )
}

/** What's being built — shown in both the locked and open states for now. */
function WhatsComing() {
  return (
    <Card pad="roomy">
      <div className="flex items-start gap-4">
        <AstronautArt variant="lounge" size="md" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold">What&apos;s coming</p>
          <ul className="space-y-1 text-sm text-muted">
            <li>Student Lounge: pwede mag post, react, tyaka mag shout out ng classmate.</li>
            <li>Group chats for your section and the whole class.</li>
            <li>Random Events — answer the question, grind the points.</li>
          </ul>
        </div>
      </div>
    </Card>
  )
}

/** Not in a `space_enabled` section — most of the roster. */
function LockedView() {
  return (
    <div className="space-y-4">
      <SpaceHeader state="locked" />

      <Card pad="roomy">
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <AstronautArt variant="space" size="lg" />
          <div className="space-y-1.5">
            <p className="font-display text-lg font-bold">Ginagawa ko pa</p>
            <p className="mx-auto max-w-sm text-sm text-muted">
              Student Lounge and Messaging feature ginagawa ko dito. Beta testers access only
              muna. You&apos;ll see it here the moment it opens.
            </p>
            <p className="mx-auto max-w-sm text-sm text-muted">— CEO</p>
          </div>
        </div>
      </Card>

      <WhatsComing />
    </div>
  )
}

/**
 * In the beta, but the kill switch is off.
 *
 * Says "paused", never "coming soon": this student was in here yesterday, and
 * telling them it has not launched yet reads as a bug — which is exactly the
 * message traffic the switch is meant to prevent.
 */
function PausedView() {
  return (
    <div className="space-y-4">
      <SpaceHeader state="paused" />
      {/* Shown here but NOT on the locked screen: a paused student IS a beta
          member and the disclaimer still applies to them. A student who was
          never let in has no beta to be warned about. */}
      <BetaBanner />

      <Card pad="roomy">
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <AstronautArt variant="space" size="lg" className="opacity-50" />
          <div className="space-y-1.5">
            <p className="font-display text-lg font-bold">Sandali lang — paused muna</p>
            <p className="mx-auto max-w-sm text-sm text-muted">
              Student Space is temporarily closed while I sort something out. Nothing is
              deleted — your posts and chats will be here when it reopens.
            </p>
            <p className="mx-auto max-w-sm text-sm text-muted">— CEO</p>
          </div>
        </div>
      </Card>
    </div>
  )
}

/**
 * The hub.
 *
 * It used to be two identical cards with a chevron — a menu that told you
 * nothing you could not read off the nav. It now answers the question you
 * actually open it with: IS ANYTHING HAPPENING?
 *
 * Three reads, all OFF the critical path and each failing soft: an open event,
 * the newest Lounge post, and your rooms. A failed read costs a preview line,
 * never the screen — the cards still route.
 */
function OpenView() {
  const { spaceAccess } = useStudentData()
  const muted = isMuted(spaceAccess)

  const [event, setEvent] = useState<LoungeEvent | null>(null)
  const [latest, setLatest] = useState<LoungePost | null>(null)
  const [rooms, setRooms] = useState<SpaceRoom[] | null>(null)
  const [, forceTick] = useState(0)

  useEffect(() => {
    void getOpenEvent()
      .then(setEvent)
      .catch(() => setEvent(null))
    void getLoungeFeed('latest', { limit: 1 })
      .then((rows) => setLatest(rows[0] ?? null))
      .catch(() => setLatest(null))
    void listMyRooms()
      .then(setRooms)
      .catch(() => setRooms(null))
  }, [])

  // The event countdown is the one thing here that has to move.
  useEffect(() => {
    if (!event?.closesAt) return
    const t = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [event?.closesAt])

  // An arrow, not a bare reference: `isRoomUnread`'s optional second argument
  // is a store, and `.filter` would hand it the index.
  const unreadRooms = (rooms ?? []).filter((r) => isRoomUnread(r))
  const newest = (rooms ?? []).find((r) => r.lastMessageAt)

  return (
    <div className="space-y-4">
      <SpaceHeader state="open" />
      <BetaBanner />

      {muted && spaceAccess.timeoutUntil && (
        <Card pad="roomy" className="border-warn-solid/30 bg-warn-solid/8">
          <p className="text-sm font-semibold text-warn">
            You&apos;re muted until {untilLabel(spaceAccess.timeoutUntil)}
          </p>
          <p className="mt-1 text-sm text-muted">
            You can still read everything, and you can still message me directly.
            {spaceAccess.timeoutReason ? ` Reason: ${spaceAccess.timeoutReason}` : ''}
          </p>
        </Card>
      )}

      {/* An open event outranks everything: it is the only thing here with a
          deadline, and the only one that pays points. */}
      {event && (
        <Link to="/app/space/lounge" className="block">
          <Card
            pad="roomy"
            interactive
            className="border-reward-solid/35 bg-reward-solid/8"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 rounded-lg bg-reward-solid/15 px-2 py-1 text-2xs font-bold uppercase tracking-wide text-reward">
                Event
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{event.question}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                  <span className="font-semibold text-reward">+{event.points} pts</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {event.answerCount} {event.answerCount === 1 ? 'answer' : 'answers'}
                  </span>
                  {event.closesAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="whitespace-nowrap">
                        closes {countdownTo(new Date(event.closesAt))}
                      </span>
                    </>
                  )}
                </p>
                {event.myAnswer && (
                  <p className="mt-1 truncate text-xs text-success">
                    You answered: {event.myAnswer}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </Link>
      )}

      <Link to="/app/space/lounge" className="block">
        <Card pad="roomy" interactive>
          <div className="flex items-center gap-4">
            <AstronautArt variant="lounge" size="md" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold">Student Lounge</p>
              {/* The newest post, not a description of what a Lounge is. */}
              {latest?.body ? (
                <p className="truncate text-sm text-muted">
                  <span className="font-semibold text-ink">{latest.displayName}:</span>{' '}
                  {latest.body}
                </p>
              ) : (
                <p className="text-sm text-muted">Post, give a W, shout out a classmate.</p>
              )}
            </div>
            <span className="shrink-0 text-lg text-muted">›</span>
          </div>
        </Card>
      </Link>

      <Link to="/app/space/chats" className="block">
        <Card pad="roomy" interactive>
          <div className="flex items-center gap-4">
            <AstronautArt variant="space" size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-display text-lg font-bold">Chats</p>
                {unreadRooms.length > 0 && (
                  <Chip tone="accent" size="sm">
                    {unreadRooms.length} new
                  </Chip>
                )}
              </div>
              {newest?.lastMessageBody ? (
                <p className="truncate text-sm text-muted">
                  <span className="font-semibold text-ink">{newest.name}</span> ·{' '}
                  {newest.lastMessageBy}: {newest.lastMessageBody}
                </p>
              ) : (
                <p className="text-sm text-muted">
                  Your section, the whole class, and direct messages.
                </p>
              )}
            </div>
            <span className="shrink-0 text-lg text-muted">›</span>
          </div>
        </Card>
      </Link>
    </div>
  )
}

export function StudentSpace() {
  const { spaceAccess } = useStudentData()

  if (spaceAccess.state === 'locked') return <LockedView />
  if (spaceAccess.state === 'paused') return <PausedView />
  return <OpenView />
}
