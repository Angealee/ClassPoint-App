import { AnimatePresence, motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Textarea } from '@/components/ui/Textarea'
import { ChevronDownIcon } from '@/components/ui/icons'
import { ScaleRow } from './ScaleRow'
import { ease } from '@/lib/motion'
import { cn } from '@/lib/cn'
import { PEER_COMMENT_MAX, type PeerCriterion, type PeerPerson } from '@/lib/types'

export function peerCardId(peerId: string): string {
  return `peer-card-${peerId}`
}

export function PeerCard({
  peer,
  criteria,
  scores,
  comment,
  open,
  disabled = false,
  next = null,
  onToggle,
  onScore,
  onComment,
}: {
  peer: PeerPerson
  criteria: PeerCriterion[]
  /** criterionId → chosen value. Missing keys are unanswered. */
  scores: Record<string, number>
  comment: string
  open: boolean
  disabled?: boolean
  next?: { label: string; onClick: () => void } | null
  onToggle: () => void
  onScore: (criterionId: string, value: number) => void
  onComment: (body: string) => void
}) {
  const answered = criteria.filter((c) => scores[c.id] !== undefined).length
  const done = answered === criteria.length && criteria.length > 0
  const overLimit = comment.length > PEER_COMMENT_MAX

  return (
    <Card id={peerCardId(peer.id)} pad="none" className="scroll-mt-4 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <Avatar name={peer.displayName} url={peer.avatarUrl} className="h-10 w-10 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{peer.displayName}</span>
          <span className="block text-xs text-muted">
            {answered} of {criteria.length} answered
          </span>
        </span>
        {done && (
          <Chip tone="success" size="sm">
            Done
          </Chip>
        )}
        <ChevronDownIcon
          className={cn(
            'h-4 w-4 shrink-0 text-muted transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ ...ease, duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-line p-4">
              {criteria.map((c) => (
                <div key={c.id}>
                  <p className="mb-2 text-sm font-medium">{c.label}</p>
                  <ScaleRow
                    name={`${c.label} for ${peer.displayName}`}
                    scale={c.scale}
                    value={scores[c.id] ?? null}
                    disabled={disabled}
                    onChange={(v) => onScore(c.id, v)}
                  />
                </div>
              ))}

              <Textarea
                label="Comment (optional)"
                rows={3}
                value={comment}
                disabled={disabled}
                placeholder={`Anything ${peer.displayName} should know?`}
                hint={
                  comment.length > 0
                    ? `${comment.length} / ${PEER_COMMENT_MAX}`
                    : 'They will see this without your name on it.'
                }
                error={overLimit ? `${PEER_COMMENT_MAX} characters at most.` : undefined}
                onChange={(e) => onComment(e.target.value)}
              />

              {done && next && !disabled && (
                <Button variant="outline" className="w-full" onClick={next.onClick}>
                  {next.label}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
