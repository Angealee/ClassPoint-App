import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { EmptyState, ErrorState } from '@/components/ui/EmptyState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { PeerPlate } from '@/components/peer/PeerPlate'
import { getMyPeerResults } from '@/lib/api'
import { errorText } from '@/lib/errors'
import { headlinePct, reportRows } from '@/lib/peer-report'
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

  const headline = headlinePct(data.overallPct)
  const rated = data.raterCount > 0 && headline !== null
  const strengths = rated ? strengthsOf(data.criteria) : null
  const rows = reportRows(data.criteria)

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
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
        <>
          <PeerPlate
            eyebrow={`Peer feedback · ${data.subjectCode}`}
            figure={`${headline}%`}
            unit="overall"
            meta={
              <>
                <span>
                  from {data.raterCount} classmate{data.raterCount === 1 ? '' : 's'}
                </span>
                <span>
                  Raw average {data.overallRaw}
                  {!data.sameScale && ' across different scales'}
                </span>
              </>
            }
          >
            <ul className="space-y-3.5" aria-label="Your score on each question">
              {rows.map((r) => (
                <li key={r.id}>
                  <div className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-white/90">
                      {r.label}
                    </span>
                    <span className="shrink-0 text-2xs tabular-nums text-white/55">{r.raw}</span>
                    <span className="w-11 shrink-0 whitespace-nowrap text-right text-sm font-bold tabular-nums">{r.pct}%</span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={r.label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={r.pct}
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15"
                  >
                    <div
                      className="h-full origin-left rounded-full bg-gold-300"
                      style={{ transform: `scaleX(${r.fill})` }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            {strengths && (
              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                <div className="min-w-0">
                  <dt className="text-2xs font-semibold uppercase tracking-widest text-white/55">Strongest</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-plate-up">
                    {joinLabels(strengths.strongest)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-2xs font-semibold uppercase tracking-widest text-white/55">Room to grow</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-white">
                    {joinLabels(strengths.roomToGrow)}
                  </dd>
                </div>
              </dl>
            )}
          </PeerPlate>

          <section>
            <SectionLabel>Comments</SectionLabel>
            <div className="mt-2">
              {data.commentsWithheld ? (
                <Card pad="tight">
                  <p className="text-sm text-muted">
                    Comments are held back when fewer than {data.minRaters} people rated you, because with a
                    group that small it would be obvious who wrote what. Your scores above are unaffected.
                  </p>
                </Card>
              ) : data.comments.length === 0 ? (
                <EmptyState>Nobody left a comment.</EmptyState>
              ) : (
                <ul className="space-y-3">
                  {data.comments.map((body, i) => (
                    <li key={i}>
                      <Card pad="none" className="relative overflow-hidden py-3.5 pl-5 pr-4">
                        <span aria-hidden className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-accent-solid/60" />
                        <p className="whitespace-pre-wrap text-sm">{body}</p>
                        <p className="mt-2 text-2xs text-muted">A classmate · anonymous</p>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <p className="px-1 text-xs text-muted">
            None of this affects your points, your level or your rank.
          </p>
        </>
      )}
    </div>
  )
}
