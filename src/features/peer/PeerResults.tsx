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
              Raw average {data.overallRaw}
              {!data.sameScale && ' across different scales'} · from{' '}
              {data.raterCount} classmate{data.raterCount === 1 ? '' : 's'}
            </p>
          </Card>

          {strengths && (
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
