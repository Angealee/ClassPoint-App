import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Meter } from '@/components/ui/Meter'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { getMyPeerResults } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { joinLabels, strengthsOf } from '@/lib/peer-strengths'
import type { MyPeerResults } from '@/lib/types'

/**
 * What your classmates said about you.
 *
 * ── THE SHAPE OF THE PAGE IS THE POINT ─────────────────────────────────────
 * Overall first, then the per-criterion breakdown, then the words. The
 * breakdown is the actionable half: a student who scores well on effort and
 * badly on communication learns something the single number hides, and a single
 * number on its own reads as a mark.
 *
 * ── COMMENTS ARE STRINGS, AND THEY ARRIVE THAT WAY ─────────────────────────
 * The RPC returns bare strings, so there is no evaluator field for this screen
 * to forget to hide. Below three raters the server sends none at all and says
 * why — that decision is made in SQL, and this screen only explains it.
 */
export function PeerResults() {
  const { evaluationId = '' } = useParams()
  const [data, setData] = useState<MyPeerResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setData(await getMyPeerResults(evaluationId))
    } catch (e) {
      // The RPC's refusals are real sentences ("Those results have not been
      // released yet"), and that one is the common case rather than a fault.
      setLoadError(errorText(e, "Couldn't load your results."))
    } finally {
      setLoading(false)
    }
  }, [evaluationId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <ListSkeleton />
  if (loadError) {
    return <ErrorState onRetry={() => void load()}>{loadError}</ErrorState>
  }
  if (!data) return null

  const rated = data.raterCount > 0 && data.overallPct !== null
  // Null with one question, or when every question scored the same — see
  // lib/peer-strengths for why it says nothing rather than inventing a winner.
  const strengths = rated ? strengthsOf(data.criteria) : null

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Your feedback"
        subtitle={`${data.title} · ${data.subjectCode}`}
        fallback="/app/peer"
      />

      {!rated ? (
        <EmptyState description="Nothing was scored, so there is nothing to show you here.">
          Nobody rated you on this one.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <Card>
            <p className="text-xs text-muted">Overall</p>
            <p className="mt-0.5 text-3xl font-bold tabular-nums">
              {Math.round(data.overallPct ?? 0)}
              <span className="ml-0.5 text-xl font-semibold text-muted">%</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              {/* The raw figure is labelled raw and never leads, so it cannot be
                  mistaken for a mark. It is also a mean across mixed units when
                  the criteria use different scales, which the caption says. */}
              Raw average {data.overallRaw}
              {!data.sameScale && ' across different scales'} · from{' '}
              {data.raterCount} classmate{data.raterCount === 1 ? '' : 's'}
            </p>
          </Card>

          {strengths && (
            // Neutral wording (the instructor's call), matching the plain voice
            // of the results notification. Framing for the number above, not a
            // second verdict: both lines point at questions the student can
            // read the detail of directly below.
            <Card className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted">Strongest</p>
                <p className="mt-0.5 text-sm font-semibold text-success">
                  {joinLabels(strengths.strongest)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted">Room to grow</p>
                <p className="mt-0.5 text-sm font-semibold">{joinLabels(strengths.roomToGrow)}</p>
              </div>
            </Card>
          )}

          <div>
            <SectionLabel>By question</SectionLabel>
            <Card className="space-y-4">
              {data.criteria.map((c) => (
                <div key={c.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.label}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {c.avg}
                      <span className="text-xs font-normal text-muted"> / {c.scaleMax}</span>
                    </span>
                  </div>
                  <Meter value={c.pct} max={100} />
                </div>
              ))}
            </Card>
          </div>

          <div>
            <SectionLabel>Comments</SectionLabel>
            {data.commentsWithheld ? (
              <Card pad="tight">
                <p className="text-sm text-muted">
                  Comments are held back when fewer than {data.minRaters} people rated
                  you, because with a group that small it would be obvious who wrote
                  what. Your scores above are unaffected.
                </p>
              </Card>
            ) : data.comments.length === 0 ? (
              <EmptyState>Nobody left a comment.</EmptyState>
            ) : (
              <div className="space-y-3">
                {data.comments.map((body, i) => (
                  // Index as key: these are unordered anonymous strings with no
                  // id by design, and the list never reorders or filters.
                  <Card key={i} pad="tight">
                    <p className="whitespace-pre-wrap text-sm">{body}</p>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <p className="px-1 text-xs text-muted">
            None of this affects your points, your level or your rank.
          </p>
        </div>
      )}
    </div>
  )
}
