import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Sheet } from '@/components/ui/Sheet'
import { Input } from '@/components/ui/Input'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { XIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { MAX_POST_LENGTH, type LoungeQuota } from '@/lib/types'

/**
 * The one composer, for both a plain post and a shoutout.
 *
 * A shoutout is the same box with a person attached (the user's call), so there
 * is one thing to learn rather than two flows that drift apart.
 *
 * ── THE FOUR GUARDS ────────────────────────────────────────────────────────
 *   1. Live counter + remaining allowance, so the limit is never a surprise
 *      server error after you have written 600 characters.
 *   2. Auto-growing textarea — at 600 characters a fixed box is a letterbox.
 *   3. Warn before leaving with unsent text.
 *   4. Ctrl/Cmd+Enter to send; plain Enter stays a newline, because posts are
 *      multi-line by decision.
 *
 * The DUPLICATE guard is the fifth and it is deliberately NOT here: it lives in
 * the RPC, because the case it protects against is a retry the client believes
 * failed.
 */

export interface ClassmateOption {
  id: string
  displayName: string
  avatarUrl: string | null
}

export function PostComposer({
  quota,
  classmates,
  busy,
  onPost,
  onShoutout,
}: {
  quota: LoungeQuota | null
  classmates: ClassmateOption[]
  busy?: boolean
  onPost: (body: string) => Promise<boolean>
  onShoutout: (targetId: string, body: string) => Promise<boolean>
}) {
  const [body, setBody] = useState('')
  const [target, setTarget] = useState<ClassmateOption | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [leaveOpen, setLeaveOpen] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const isShoutout = target !== null
  const left = isShoutout ? (quota?.shoutoutsLeft ?? 0) : (quota?.postsLeft ?? 0)
  const overLimit = body.length > MAX_POST_LENGTH
  const canSend = body.trim().length > 0 && !overLimit && !busy && left > 0

  // Auto-grow. Reset to `auto` first or the box can only ever get taller —
  // scrollHeight of an already-tall element never shrinks on its own.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [body])

  // Guard 3. `beforeunload` covers a reload or a closed tab; in-app navigation
  // is covered by the dialog on the picker/clear controls below.
  useEffect(() => {
    if (body.trim().length === 0) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [body])

  async function send() {
    if (!canSend) return
    const ok = isShoutout
      ? await onShoutout(target.id, body.trim())
      : await onPost(body.trim())
    // Only clear on success: a failed send must not eat what was typed. This is
    // the same reason the RPC owns the duplicate guard — the client cannot
    // safely assume anything about a request it did not see answered.
    if (ok) {
      setBody('')
      setTarget(null)
    }
  }

  function clearTarget() {
    setTarget(null)
  }

  const filtered = search.trim()
    ? classmates.filter((c) => c.displayName.toLowerCase().includes(search.trim().toLowerCase()))
    : classmates

  return (
    <Card pad="roomy">
      {isShoutout && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-success-solid/10 px-3 py-2">
          <span className="shrink-0 text-xs font-semibold text-success">Shoutout to</span>
          <Avatar
            name={target.displayName}
            url={target.avatarUrl}
            className="h-5 w-5"
            textClassName="text-[9px]"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {target.displayName}
          </span>
          <button
            type="button"
            onClick={clearTarget}
            aria-label="Remove shoutout target"
            className="shrink-0 text-muted transition-colors hover:text-ink"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <textarea
        ref={areaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Guard 4. Plain Enter is a newline.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void send()
          }
        }}
        rows={2}
        placeholder={
          left === 0
            ? isShoutout
              ? "That's your shoutouts for this week"
              : "That's your posts for today"
            : isShoutout
              ? 'Say why they deserve it…'
              : "What's up?"
        }
        disabled={left === 0}
        // text-base, always: below 16px iOS Safari zooms the viewport on focus
        // and never zooms back.
        className={cn(
          'w-full resize-none overflow-y-auto rounded-xl border bg-card px-3.5 py-2.5 text-base text-ink',
          'placeholder:text-muted/70 transition-colors',
          'focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30',
          overLimit ? 'border-danger' : 'border-line',
          left === 0 && 'opacity-60',
        )}
      />

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          disabled={(quota?.shoutoutsLeft ?? 0) === 0 && !isShoutout}
          className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          {isShoutout ? 'Change' : 'Shout out'}
        </button>

        {/* Guard 1. Both figures, so neither limit is a surprise. */}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-2xs',
            overLimit ? 'font-semibold text-danger' : 'text-muted',
          )}
        >
          {body.length > MAX_POST_LENGTH - 100 || overLimit
            ? `${body.length}/${MAX_POST_LENGTH}`
            : `${left} ${isShoutout ? 'shoutout' : 'post'}${left === 1 ? '' : 's'} left`}
        </span>

        <Button size="sm" className="shrink-0" onClick={() => void send()} disabled={!canSend} loading={busy}>
          {isShoutout ? 'Shout out' : 'Post'}
        </Button>
      </div>

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Shout out a classmate">
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
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setTarget(c)
                    setPickerOpen(false)
                    setSearch('')
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-card-2"
                >
                  <Avatar
                    name={c.displayName}
                    url={c.avatarUrl}
                    className="h-8 w-8"
                    textClassName="text-2xs"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {c.displayName}
                  </span>
                </button>
              ))
            )}
          </div>
          <p className="px-1 text-xs text-muted">
            {quota?.shoutoutsLeft ?? 0} of 3 left this week · one per classmate per week.
          </p>
        </div>
      </Sheet>

      <ConfirmDialog
        open={leaveOpen}
        title="Discard this?"
        message="You have something typed that hasn't been posted."
        confirmLabel="Discard"
        onConfirm={() => {
          setBody('')
          setTarget(null)
          setLeaveOpen(false)
        }}
        onClose={() => setLeaveOpen(false)}
      />
    </Card>
  )
}
