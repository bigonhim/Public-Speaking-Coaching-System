// The transparency centrepiece. For every component it shows the RAW metric,
// the component score, its weight, and how many points it contributes to the
// overall — so a user can explain their own score from this screen alone.

import type { SessionDetail } from '../api/types'
import { COMPONENTS, OVERALL_COLOR, scoreTone } from '../lib/scoring'
import { ScoreRing } from './ui/ScoreRing'

interface Props {
  session: SessionDetail
}

export function ScoreBreakdown({ session }: Props) {
  const { scores, metrics, weights } = session
  const overall = scores.overall ?? 0

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* Overall */}
      <div className="card flex flex-col items-center justify-center gap-3 p-6">
        <ScoreRing value={overall} color={OVERALL_COLOR} sublabel="overall" />
        <p className="text-center text-sm text-slate-500">
          A weighted blend of the four parts below. Every number comes from your recording.
        </p>
      </div>

      {/* Components */}
      <div className="grid gap-4 sm:grid-cols-2">
        {COMPONENTS.map((c) => {
          const score = scores[c.key] ?? 0
          const weight = weights[c.key]
          const contribution = (score * weight).toFixed(1)
          return (
            <div key={c.key} className="card p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
                  <span className="font-semibold text-slate-700">{c.label}</span>
                </div>
                <span
                  className="text-2xl font-bold tabular-nums"
                  style={{ color: scoreTone(score) }}
                >
                  {score.toFixed(0)}
                </span>
              </div>

              <p className="mt-1 text-sm font-medium text-slate-500">{c.rawMetric(metrics)}</p>

              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: c.color }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>Weight {Math.round(weight * 100)}%</span>
                <span>contributes {contribution} pts</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{c.blurb}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
