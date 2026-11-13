import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type SVGProps,
} from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { listVariants, rowVariants } from "@/lib/motion";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { AstronautArt } from "@/components/space/AstronautArt";
import { BetaBanner } from "@/components/space/BetaBanner";
import { useStudentData } from "@/features/student/StudentData";
import { isMuted, spaceChip } from "@/lib/space-gate";
import {
  getLoungeFeed,
  getOpenEvent,
  listMyRooms,
  listShoutoutsFor,
  listSpacePeople,
} from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Rows } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { SpaceGlow } from "@/components/space/SpaceGlow";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/cn";
import { isRoomUnread } from "@/lib/unread";
import type {
  LoungeEvent,
  LoungePost,
  ShoutoutReceived,
  SpacePerson,
  SpaceRoom,
} from "@/lib/types";

function untilLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SpaceHeader({ state }: { state: "open" | "paused" | "locked" }) {
  const chip = spaceChip(state);
  return (
    <div className="flex items-center gap-3">
      <h1 className="font-display text-xl font-bold">Student Space</h1>
      <Chip tone={chip.tone} size="sm">
        {chip.label}
      </Chip>
    </div>
  );
}

function WhatsComing() {
  return (
    <Card pad="roomy">
      <div className="flex items-start gap-4">
        <AstronautArt variant="lounge" size="md" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold">What&apos;s coming</p>
          <ul className="space-y-1 text-sm text-muted">
            <li>
              Student Lounge: pwede mag post, react, tyaka mag shout out ng
              classmate.
            </li>
            <li>Group chats for your section and the whole class.</li>
            <li>Random Events — answer the question, grind the points.</li>
          </ul>
        </div>
      </div>
    </Card>
  );
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
              Student Lounge and Messaging feature ginagawa ko dito. Beta
              testers access only muna. You&apos;ll see it here the moment it
              opens.
            </p>
            <p className="mx-auto max-w-sm text-sm text-muted">— CEO</p>
          </div>
        </div>
      </Card>

      <WhatsComing />
    </div>
  );
}

function PausedView() {
  return (
    <div className="space-y-4">
      <SpaceHeader state="paused" />
      <BetaBanner />

      <Card pad="roomy">
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <AstronautArt variant="space" size="lg" className="opacity-50" />
          <div className="space-y-1.5">
            <p className="font-display text-lg font-bold">
              Sandali lang — paused muna
            </p>
            <p className="mx-auto max-w-sm text-sm text-muted">
              Student Space is temporarily closed while I sort something out.
              Nothing is deleted — your posts and chats will be here when it
              reopens.
            </p>
            <p className="mx-auto max-w-sm text-sm text-muted">— CEO</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

type FeedItem =
  | { kind: "shoutout"; at: string; key: string; s: ShoutoutReceived }
  | { kind: "post"; at: string; key: string; p: LoungePost }
  | { kind: "room"; at: string; key: string; r: SpaceRoom };

/** Fixed star positions (percent) — deterministic, so nothing reshuffles on render. */
const STARS: ReadonlyArray<[number, number, number, number]> = [
  // [left %, top %, size px, delay s]
  [6, 22, 2, 0],
  [14, 70, 3, 1.1],
  [23, 38, 2, 2.3],
  [33, 16, 2, 0.6],
  [41, 78, 2, 1.8],
  [52, 28, 3, 2.9],
  [58, 64, 2, 0.3],
  [66, 18, 2, 1.4],
  [74, 72, 3, 2.1],
  [82, 34, 2, 0.9],
  [90, 60, 2, 2.6],
  [96, 20, 2, 1.6],
];

const RECENT_ROOM_MS = 10 * 60 * 1000;

function StatPill({ value, label }: { value: string | number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs backdrop-blur-sm">
      <span className="font-display text-sm font-bold tabular-nums text-ink">
        {value}
      </span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

function SpaceBanner({
  name,
  stats,
}: {
  name: string;
  stats: Array<{ value: string | number; label: string }> | null;
}) {
  return (
    <Card pad="none" className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/25 via-indigo-500/10 to-transparent"
      />
      <div
        aria-hidden="true"
        className="cp-grid pointer-events-none absolute inset-0 opacity-80"
      />
      {/* Twinkling starfield */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {STARS.map(([l, t, size, d], i) => (
          <span
            key={i}
            className="cp-twinkle absolute rounded-full bg-white"
            style={{
              left: `${l}%`,
              top: `${t}%`,
              width: size,
              height: size,
              animationDelay: `${d}s`,
            }}
          />
        ))}
      </div>

      <div className="relative flex items-center gap-4 p-5 md:px-8 md:py-7">
        {/* Second astronaut, only where there is room for it */}
        <AstronautArt
          variant="lounge"
          size="md"
          className="cp-float hidden shrink-0 opacity-90 lg:block"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="font-display text-lg font-bold leading-tight sm:text-xl md:text-2xl">
              Welcome to Space{name ? `, ${name}` : ""}!
            </h1>
            <Chip tone="accent" size="sm" className="shrink-0">
              BETA
            </Chip>
          </div>
          <p className="mt-1 text-sm text-muted md:text-base">
            Tambay? Post sa Lounge, chat with the class, this is your space.
          </p>
          {stats && (
            <div className="mt-3 flex flex-wrap gap-2">
              {stats.map((s) => (
                <StatPill key={s.label} value={s.value} label={s.label} />
              ))}
            </div>
          )}
        </div>
        <AstronautArt
          variant="space"
          size="md"
          className="cp-float shrink-0 [animation-delay:-3s] sm:h-24 sm:w-24"
        />
      </div>
    </Card>
  );
}

const tileHover =
  "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-info-solid/15 active:translate-y-0";

function ShortcutTile({
  to,
  title,
  line,
  art,
  badge,
}: {
  to: string;
  title: string;
  line: string;
  art: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <Link to={to} className={cn("block min-w-0 rounded-2xl", tileHover)}>
      <Card interactive className="flex h-full flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          {art}
          {badge}
        </div>
        <div className="min-w-0">
          <p className="font-display font-bold">{title}</p>
          <p className="truncate text-xs text-muted">{line}</p>
        </div>
      </Card>
    </Link>
  );
}

function PeopleStrip({
  people,
  mySectionId,
}: {
  people: SpacePerson[] | null;
  mySectionId: string | null;
}) {
  const classmates = (people ?? []).filter(
    (p) => !!mySectionId && p.sectionId === mySectionId,
  );
  const pool = classmates.length ? classmates : (people ?? []);
  const faces = pool.slice(0, 5);
  const extra = pool.length - faces.length;
  return (
    <Link to="/app/space/people" className={cn("block rounded-2xl", tileHover)}>
      <Card interactive className="flex items-center gap-4">
        <div className="flex shrink-0 items-center -space-x-2.5">
          {people === null
            ? Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className="h-9 w-9 rounded-full bg-card-2 ring-2 ring-card"
                />
              ))
            : faces.map((p) => (
                <Avatar
                  key={p.id}
                  name={p.displayName}
                  url={p.avatarUrl}
                  className="h-9 w-9 ring-2 ring-card"
                  textClassName="text-2xs"
                />
              ))}
          {extra > 0 && (
            <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-card-2 px-1.5 text-2xs font-semibold text-muted ring-2 ring-card">
              +{extra}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold">People</p>
          <p className="truncate text-xs text-muted">
            {people === null
              ? "Your classmates and the batch"
              : `${classmates.length} in your class · ${people.length} in the batch`}
          </p>
        </div>
        <span className="shrink-0 text-lg text-muted">›</span>
      </Card>
    </Link>
  );
}

/** Top 3 of your own class by points this semester. */
function TopInClass({
  people,
  mySectionId,
  meId,
}: {
  people: SpacePerson[];
  mySectionId: string | null;
  meId: string | null;
}) {
  const top = people
    .filter((p) => !!mySectionId && p.sectionId === mySectionId)
    .sort(
      (a, b) =>
        b.semesterPoints - a.semesterPoints ||
        a.displayName.localeCompare(b.displayName),
    )
    .slice(0, 3);
  if (top.length === 0) return null;
  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-semibold">Top in your class</p>
        <Link
          to="/app/leaderboard"
          className="text-xs font-semibold text-accent"
        >
          Ranks ›
        </Link>
      </div>
      <div className="space-y-2">
        {top.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3">
            <span
              className={cn(
                "w-4 text-center font-display text-sm font-bold tabular-nums",
                i === 0 ? "text-reward" : "text-muted",
              )}
            >
              {i + 1}
            </span>
            <Avatar
              name={p.displayName}
              url={p.avatarUrl}
              className="h-8 w-8"
              textClassName="text-2xs"
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {p.displayName}
              {p.id === meId && <span className="text-muted"> (you)</span>}
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-reward">
              {p.semesterPoints} pts
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12Z" />
    </svg>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  if (item.kind === "shoutout") {
    const s = item.s;
    return (
      <Link
        to={`/app/space/post/${s.id}`}
        className="flex items-start gap-3 rounded-xl bg-reward-solid/8 p-3 ring-1 ring-reward-solid/25 transition-colors hover:bg-reward-solid/12"
      >
        <Avatar
          name={s.displayName}
          url={s.avatarUrl}
          className="h-9 w-9 shrink-0"
          textClassName="text-2xs"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-semibold">{s.displayName}</span>{" "}
            <span className="font-semibold text-reward">shouted you out</span>
          </p>
          <p className="line-clamp-2 text-sm text-muted">{s.body}</p>
        </div>
        <span className="shrink-0 text-2xs text-muted">
          {timeAgo(s.createdAt)}
        </span>
      </Link>
    );
  }
  if (item.kind === "post") {
    const p = item.p;
    return (
      <Link
        to={`/app/space/post/${p.id}`}
        className="flex items-start gap-3 p-3 transition-colors hover:bg-card-2"
      >
        <Avatar
          name={p.displayName}
          url={p.avatarUrl}
          className="h-9 w-9 shrink-0"
          textClassName="text-2xs"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            <span className="font-semibold">{p.displayName}</span>
            <span className="text-muted">
              {p.kind === "pulse" ? " · class update" : " in Lounge"}
            </span>
          </p>
          <p className="line-clamp-2 text-sm text-ink">
            {p.body ?? "Hidden — reported"}
          </p>
          <p className="mt-1 text-2xs text-muted">
            {p.wCount} W · {p.replyCount}{" "}
            {p.replyCount === 1 ? "reply" : "replies"}
          </p>
        </div>
        <span className="shrink-0 text-2xs text-muted">
          {timeAgo(p.createdAt)}
        </span>
      </Link>
    );
  }
  const r = item.r;
  const unread = isRoomUnread(r);
  return (
    <Link
      to={`/app/space/chat/${r.id}`}
      className="flex items-start gap-3 p-3 transition-colors hover:bg-card-2"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-info-solid/15 text-info">
        <ChatIcon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm">
          <span
            className={cn("truncate", unread ? "font-bold" : "font-semibold")}
          >
            {r.name}
          </span>
          {unread && (
            <span
              className="cp-pulse-twice h-2 w-2 shrink-0 rounded-full bg-accent-solid"
              aria-label="Unread"
            />
          )}
        </p>
        <p
          className={cn("truncate text-sm", unread ? "text-ink" : "text-muted")}
        >
          {r.lastMessageBy ? `${r.lastMessageBy}: ` : ""}
          {r.lastMessageBody}
        </p>
      </div>
      <span className="shrink-0 text-2xs text-muted">
        {r.lastMessageAt ? timeAgo(r.lastMessageAt) : ""}
      </span>
    </Link>
  );
}

function OpenView() {
  const { spaceAccess, me } = useStudentData();
  const muted = isMuted(spaceAccess);

  const [event, setEvent] = useState<LoungeEvent | null>(null);
  const [posts, setPosts] = useState<LoungePost[] | null>(null);
  const [rooms, setRooms] = useState<SpaceRoom[] | null>(null);
  const [shoutouts, setShoutouts] = useState<ShoutoutReceived[]>([]);
  const [people, setPeople] = useState<SpacePerson[] | null>(null);
  // Read once on mount: "today" and "active" are about when you opened the page.
  const [now] = useState(() => Date.now());

  const meId = me?.id;
  useEffect(() => {
    // Every read fails soft: a failed preview costs its rows, never the screen.
    void getOpenEvent()
      .then(setEvent)
      .catch(() => setEvent(null));
    void getLoungeFeed("latest", { limit: 20 })
      .then(setPosts)
      .catch(() => setPosts([]));
    void listMyRooms()
      .then(setRooms)
      .catch(() => setRooms([]));
    void listSpacePeople()
      .then(setPeople)
      .catch(() => setPeople([]));
    if (meId)
      void listShoutoutsFor(meId)
        .then(setShoutouts)
        .catch(() => setShoutouts([]));
  }, [meId]);

  const unreadRooms = (rooms ?? []).filter((r) => isRoomUnread(r));
  const latestPost = posts?.find((p) => p.body);

  const stats = useMemo(() => {
    if (posts === null || rooms === null) return null;
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const today = posts.filter(
      (p) => Date.parse(p.createdAt) >= startOfDay.getTime(),
    ).length;
    const active = rooms.filter(
      (r) =>
        r.lastMessageAt && now - Date.parse(r.lastMessageAt) < RECENT_ROOM_MS,
    ).length;
    return [
      {
        value: today >= posts.length && posts.length >= 20 ? "20+" : today,
        label: today === 1 ? "post today" : "posts today",
      },
      {
        value: active,
        label: active === 1 ? "room active now" : "rooms active now",
      },
      { value: people?.length ?? "—", label: "in Space" },
    ];
  }, [posts, rooms, people, now]);

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...shoutouts.map((s) => ({
        kind: "shoutout" as const,
        at: s.createdAt,
        key: "s" + s.id,
        s,
      })),
      ...(posts ?? [])
        .slice(0, 6)
        .map((p) => ({
          kind: "post" as const,
          at: p.createdAt,
          key: "p" + p.id,
          p,
        })),
      ...(rooms ?? [])
        .filter((r) => r.lastMessageAt && r.lastMessageBody)
        .sort((a, b) =>
          (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
        )
        .slice(0, 3)
        .map((r) => ({
          kind: "room" as const,
          at: r.lastMessageAt as string,
          key: "r" + r.id,
          r,
        })),
    ];
    // A shoutout to YOU never sinks below the fold; everything else is newest first.
    return items
      .sort((a, b) => {
        const sa = a.kind === "shoutout" ? 0 : 1;
        const sb = b.kind === "shoutout" ? 0 : 1;
        return sa !== sb ? sa - sb : b.at.localeCompare(a.at);
      })
      .slice(0, 10);
  }, [shoutouts, posts, rooms]);

  const loadingFeed = posts === null || rooms === null;
  const firstName = me?.display_name?.split(" ")[0] ?? "";

  return (
    <motion.div
      variants={listVariants}
      initial="hidden"
      animate="show"
      className="relative space-y-4"
    >
      <SpaceGlow />
      <motion.div variants={rowVariants}>
        <SpaceBanner name={firstName} stats={stats} />
      </motion.div>

      {muted && spaceAccess.timeoutUntil && (
        <motion.div variants={rowVariants}>
          <Card pad="roomy" className="border-warn-solid/30 bg-warn-solid/8">
            <p className="text-sm font-semibold text-warn">
              You&apos;re muted until {untilLabel(spaceAccess.timeoutUntil)}
            </p>
            <p className="mt-1 text-sm text-muted">
              You can still read everything, and you can still message me
              directly.
              {spaceAccess.timeoutReason
                ? ` Reason: ${spaceAccess.timeoutReason}`
                : ""}
            </p>
          </Card>
        </motion.div>
      )}

      {/* Phone: one column, tiles first. Wide: feed left, rail right. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <motion.aside variants={rowVariants} className="space-y-3 lg:order-2">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <ShortcutTile
              to="/app/space/lounge"
              title="Lounge"
              line={
                latestPost?.body
                  ? `${latestPost.displayName}: ${latestPost.body}`
                  : "Post, W, shout out"
              }
              art={<AstronautArt variant="lounge" size="sm" />}
              badge={
                event ? (
                  <Chip tone="reward" size="sm">
                    Event +{event.points}
                  </Chip>
                ) : undefined
              }
            />
            <ShortcutTile
              to="/app/space/chats"
              title="Chats"
              line={
                unreadRooms.length > 0
                  ? `${unreadRooms.length} room${unreadRooms.length === 1 ? "" : "s"} with new messages`
                  : "Your section, the class, DMs"
              }
              art={<AstronautArt variant="space" size="sm" />}
              badge={
                unreadRooms.length > 0 ? (
                  <span className="cp-pulse-twice inline-flex">
                    <Chip tone="accent" size="sm">
                      {unreadRooms.length} new
                    </Chip>
                  </span>
                ) : undefined
              }
            />
          </div>
          <PeopleStrip people={people} mySectionId={me?.section_id ?? null} />

          {event && (
            <Link
              to="/app/space/lounge"
              className={cn("block rounded-2xl", tileHover)}
            >
              <Card
                interactive
                className="border-reward-solid/35 bg-reward-solid/8"
              >
                <p className="text-2xs font-bold uppercase tracking-wide text-reward">
                  Random Event
                </p>
                <p className="mt-1 line-clamp-2 text-sm font-semibold">
                  {event.question}
                </p>
                <p className="mt-1 text-xs text-muted">
                  <span className="font-semibold text-reward">
                    +{event.points} pts
                  </span>{" "}
                  · {event.answerCount}{" "}
                  {event.answerCount === 1 ? "answer" : "answers"}
                </p>
              </Card>
            </Link>
          )}

          {people && (
            <div className="hidden lg:block">
              <TopInClass
                people={people}
                mySectionId={me?.section_id ?? null}
                meId={me?.id ?? null}
              />
            </div>
          )}
        </motion.aside>

        <motion.section variants={rowVariants} className="min-w-0 lg:order-1">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="text-sm font-semibold">What&apos;s happening</h2>
            <Link
              to="/app/space/lounge"
              className="text-xs font-semibold text-accent"
            >
              Open Lounge ›
            </Link>
          </div>
          {loadingFeed ? (
            <ListSkeleton rows={4} />
          ) : feed.length === 0 ? (
            <EmptyState icon={<AstronautArt variant="space" size="md" />}>
              Tahimik pa dito. Be the first to post in the Lounge!
            </EmptyState>
          ) : (
            <Rows>
              {feed.map((item) => (
                <div
                  key={item.key}
                  className={cn(item.kind === "shoutout" && "p-2")}
                >
                  <FeedRow item={item} />
                </div>
              ))}
            </Rows>
          )}
        </motion.section>
      </div>
    </motion.div>
  );
}

export function StudentSpace() {
  const { spaceAccess } = useStudentData();

  if (spaceAccess.state === "locked") return <LockedView />;
  if (spaceAccess.state === "paused") return <PausedView />;
  return <OpenView />;
}
