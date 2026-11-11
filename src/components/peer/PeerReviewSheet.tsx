import { Sheet } from '@/components/ui/Sheet'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { describeOption } from '@/lib/peer-scale'
import type { PeerCriterion, PeerPerson } from '@/lib/types'

export function PeerReviewSheet({
  open,
  peers,
  criteria,
  scores,
  comments,
  onEdit,
  onSubmit,
  onClose,
}: {
  open: boolean
  peers: PeerPerson[]
  criteria: PeerCriterion[]
  /** rateeId → { criterionId → score }. */
  scores: Record<string, Record<string, number>>
  comments: Record<string, string>
  /** Close the review and open that classmate's card. */
  onEdit: (peerId: string) => void
  /** Opens the final confirmation. Does not send anything itself. */
  onSubmit: () => void
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Review your answers" variant="screen">
      <div className="mx-auto w-full max-w-2xl space-y-4 pt-4">
        <div>
          <h1 className="font-display text-xl font-bold">Review your answers</h1>
          <p className="mt-1 text-sm text-muted">
            Check everything once. After you submit, none of it can be changed.
          </p>
        </div>

        {peers.map((p) => {
          const comment = (comments[p.id] ?? '').trim()
          return (
            <Card key={p.id} pad="none">
              <div className="flex items-center gap-3 border-b border-line p-4">
                <Avatar name={p.displayName} url={p.avatarUrl} className="h-9 w-9 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {p.displayName}
                </span>
                <Button size="sm" variant="outline" onClick={() => onEdit(p.id)}>
                  Edit
                </Button>
              </div>

              <dl className="divide-y divide-line">
                {criteria.map((c) => {
                  // The same wording the form uses — one rule in lib/peer-scale.
                  const text = describeOption(c.scale, scores[p.id]?.[c.id])
                  const opt = text !== null
                  const shown = text ?? 'Not answered'
                  return (
                    <div key={c.id} className="flex items-baseline gap-3 px-4 py-2.5">
                      <dt className="min-w-0 flex-1 text-sm text-muted">{c.label}</dt>
                      <dd
                        className={
                          opt
                            ? 'shrink-0 text-right text-sm font-semibold'
                            : 'shrink-0 text-right text-sm font-semibold text-danger'
                        }
                      >
                        {shown}
                      </dd>
                    </div>
                  )
                })}
              </dl>

              <div className="border-t border-line px-4 py-3">
                {comment ? (
                  <p className="whitespace-pre-wrap text-sm">{comment}</p>
                ) : (
                  <p className="text-sm text-muted">No comment</p>
                )}
              </div>
            </Card>
          )
        })}

        <div className="sticky bottom-0 border-t border-line bg-canvas/95 py-3 backdrop-blur-md">
          <Button className="w-full" onClick={onSubmit}>
            Submit
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
