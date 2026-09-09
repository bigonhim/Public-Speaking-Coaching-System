// The transparency centrepiece. For every component it shows the RAW metric,
// the component score, its weight, and how many points it contributes to the
// overall — so a user can explain their own score from this screen alone.

import type { SessionDetail } from '../api/types'
import { COMPONENTS, OVERALL_COLOR, scoreTone, verdict } from '../lib/scoring'
import { ScoreRing } from './ui/ScoreRing'

interface Props {
  session: SessionDetail
}

export function ScoreBreakdown({ session }: Props) {
  const { scores, metrics, weights } = session
  const overall = scores.overall ?? 0
  const v = verdict(scores.overall)

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Overall */}
      <div className="card relative flex flex-col items-center justify-center gap-4 overflow-hidden p-7">
        <div
          className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
          style={{ background: `radial-gradient(circle, ${v.color}44, transparent 70%)` }}
          aria-hidden
        />
        <span
          className="relative rounded-full px-3.5 py-1 text-sm font-bold ring-1"
          style={{ color: v.color, background: `${v.color}14`, borderColor: `${v.color}33` }}
        >
          {v.label}
        </span>
        <ScoreRing value={overall} color={OVERALL_COLOR} sublabel="overall" />
        <p className="relative text-center text-sm leading-relaxed text-ink-500">
          A weighted blend of the four parts. Every number comes from your recording.
        </p>
      </div>

      {/* Components */}
      <div className="grid gap-4 sm:grid-cols-2">
        {COMPONENTS.map((c) => {
          const score = scores[c.key] ?? 0
          const weight = weights[c.key]
          const contribution = (score * weight).toFixed(1)
          return (
            <div key={c.key} className="card card-hover p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="dot" style={{ background: c.color }} />
                  <span className="font-semibold text-ink-700">{c.label}</span>
                </div>
                <span
                  className="font-display text-2xl font-bold tabular-nums"
                  style={{ color: scoreTone(score) }}
                >
                  {score.toFixed(0)}
                </span>
              </div>

              <p className="mt-1 text-sm font-medium text-ink-500">{c.rawMetric(metrics)}</p>

              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-full transition-[width] duration-700"
                  style={{
                    width: `${Math.max(0, Math.min(100, score))}%`,
                    background: `linear-gradient(90deg, ${c.color}bb, ${c.color})`,
                  }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-ink-400">
                <span className="rounded-md bg-ink-50 px-1.5 py-0.5 font-medium">
                  Weight {Math.round(weight * 100)}%
                </span>
                <span>
                  contributes <span className="font-semibold text-ink-600">{contribution}</span> pts
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-400">{c.blurb}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
