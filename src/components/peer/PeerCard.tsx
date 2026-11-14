import { Card } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Textarea } from '@/components/ui/Textarea'
import { ScaleRow } from './ScaleRow'
import { PEER_COMMENT_MAX, type PeerCriterion, type PeerPerson } from '@/lib/types'

/** The id the form scrolls to when it moves to the next classmate. */
export const PEER_FOCUS_ID = 'peer-focus'

interface Action {
  label: string
  onClick: () => void
}

/**
 * ONE classmate, in full. The form shows a single card at a time: a stack of collapsible cards
 * made a five-person group feel like five forms, and the student kept losing which one they had
 * finished. Back and Next live under the comment on purpose: auto-advancing after the last rating
 * would close the card before the optional comment was reached.
 */
export function PeerCard({
  peer,
  position,
  criteria,
  scores,
  comment,
  disabled = false,
  back = null,
  forward = null,
  hint = null,
  onScore,
  onComment,
}: {
  peer: PeerPerson
  position: { index: number; total: number }
  criteria: PeerCriterion[]
  /** criterionId → chosen value. Missing keys are unanswered. */
  scores: Record<string, number>
  comment: string
  disabled?: boolean
  back?: Action | null
  forward?: Action | null
  /** Shown instead of a Next button while this classmate still has unanswered questions. */
  hint?: string | null
  onScore: (criterionId: string, value: number) => void
  onComment: (body: string) => void
}) {
  const answered = criteria.filter((c) => scores[c.id] !== undefined).length
  const done = answered === criteria.length && criteria.length > 0
  const overLimit = comment.length > PEER_COMMENT_MAX

  return (
    <Card id={PEER_FOCUS_ID} pad="none" className="scroll-mt-4 overflow-hidden">
      <div className="flex items-center gap-4 border-b border-line p-4">
        <Avatar
          name={peer.displayName}
          url={peer.avatarUrl}
          className="h-14 w-14 shrink-0"
          textClassName="text-lg"
        />
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-widest text-muted">
            Classmate {position.index + 1} of {position.total}
          </p>
          <h2 className="truncate font-display text-lg font-bold leading-tight" title={peer.displayName}>
            {peer.displayName}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {answered} of {criteria.length} answered
          </p>
        </div>
        {done && (
          <Chip tone="success" size="sm">
            Done
          </Chip>
        )}
      </div>

      <div className="space-y-5 p-4">
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

        {!disabled && (back || forward || hint) && (
          <div className="flex items-center gap-3 border-t border-line pt-4">
            {back && (
              <Button variant="outline" onClick={back.onClick}>
                {back.label}
              </Button>
            )}
            {forward ? (
              <Button className="min-w-0 flex-1" onClick={forward.onClick}>
                <span className="truncate">{forward.label}</span>
              </Button>
            ) : (
              hint && <p className="min-w-0 flex-1 text-right text-xs text-muted">{hint}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
