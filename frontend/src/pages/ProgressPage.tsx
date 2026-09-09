// The progress dashboard: current level + ladder, a trend chart of overall and
// component scores over time, and a clickable session history. Shows a friendly
// empty state before the first recording.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LevelState, Progress, SessionListItem } from '../api/types'
import { getLevel, getProgress, listSessions } from '../api/client'
import { LevelLadder } from '../components/LevelLadder'
import { Spinner } from '../components/ui/Spinner'
import { LogoMark } from '../components/ui/Logo'
import { COMPONENTS, OVERALL_COLOR, formatDate, scoreTone } from '../lib/scoring'

// Recharts 3 stopped exposing payload/label through the exported TooltipProps,
// so the shape the chart actually hands a custom tooltip is declared here.
interface TooltipEntry {
  dataKey?: string | number
  name?: string | number
  value?: number | string | null
  color?: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-2xl bg-white/95 p-3 text-xs shadow-lift ring-1 ring-ink-900/[0.06] backdrop-blur">
      <p className="mb-1.5 font-semibold text-ink-700">{label}</p>
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-500">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-semibold tabular-nums text-ink-800">
              {p.value === null || p.value === undefined ? '—' : Math.round(Number(p.value))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ProgressPage() {
  const [level, setLevel] = useState<LevelState | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getLevel(), getProgress(), listSessions(50, 0)])
      .then(([l, p, s]) => {
        setLevel(l)
        setProgress(p)
        setSessions(s)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading || !level || !progress) {
    return (
      <div className="card mx-auto max-w-xl p-8">
        <Spinner label="Loading your progress…" />
      </div>
    )
  }

  if (progress.session_count === 0) {
    return (
      <div className="card animate-fade-up mx-auto max-w-xl p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center">
          <LogoMark size={64} animated />
        </div>
        <h1 className="font-display text-2xl font-bold text-ink-900">No sessions yet</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-500">
          Record your first practice to start tracking pace, fillers, pauses and topic
          relevance — and to climb the seven levels from Novice to Master Orator.
        </p>
        <Link to="/" className="btn-primary mt-6 inline-flex">
          Start practicing
        </Link>
      </div>
    )
  }

  const chartData = progress.sessions.map((p, i) => ({
    name: p.created_at ? formatDate(p.created_at) : `#${i + 1}`,
    overall: p.overall,
    pace: p.pace,
    filler: p.filler,
    pause: p.pause,
    relevance: p.relevance,
  }))

  const overalls = progress.sessions
    .map((p) => p.overall)
    .filter((v): v is number => v !== null)
  const latest = overalls.at(-1) ?? null
  const best = overalls.length ? Math.max(...overalls) : null
  const average = overalls.length
    ? overalls.reduce((a, b) => a + b, 0) / overalls.length
    : null
  const stats: { label: string; value: number | null }[] = [
    { label: 'Latest', value: latest },
    { label: 'Best', value: best },
    { label: 'Average', value: average },
  ]

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex flex-col gap-1">
        <span className="eyebrow">Your journey</span>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink-900">Progress</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Trend chart */}
        <section className="card p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold text-ink-900">Score trends</h2>
            <span className="chip py-1">{progress.session_count} sessions</span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="overallFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={OVERALL_COLOR} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={OVERALL_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eceef6" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#8790b2' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: '#8790b2' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" />
                <Area
                  type="monotone"
                  dataKey="overall"
                  name="Overall"
                  stroke={OVERALL_COLOR}
                  strokeWidth={3}
                  fill="url(#overallFill)"
                  dot={{ r: 3, fill: OVERALL_COLOR, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
                {COMPONENTS.map((c) => (
                  <Line
                    key={c.key}
                    type="monotone"
                    dataKey={c.key}
                    name={c.label}
                    stroke={c.color}
                    strokeWidth={1.75}
                    strokeOpacity={0.65}
                    dot={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* Stat tiles */}
          <div className="mt-5 grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl bg-gradient-to-br from-ink-50 to-white p-3.5 text-center ring-1 ring-ink-900/[0.05]"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  {s.label}
                </p>
                <p
                  className="mt-0.5 font-display text-3xl font-bold tabular-nums"
                  style={{ color: scoreTone(s.value) }}
                >
                  {s.value === null ? '—' : s.value.toFixed(0)}
                </p>
              </div>
            ))}
          </div>
          {progress.baseline_overall !== null && (
            <p className="mt-4 text-xs text-ink-400">
              Baseline (first session): {progress.baseline_overall.toFixed(1)} · improvement since:{' '}
              <span className="font-semibold text-emerald-600">
                {latest !== null
                  ? `${latest - progress.baseline_overall >= 0 ? '+' : ''}${(latest - progress.baseline_overall).toFixed(1)}`
                  : '—'}
              </span>
            </p>
          )}
        </section>

        {/* Level ladder */}
        <LevelLadder level={level} />
      </div>

      {/* History */}
      <section className="card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-ink-900">Session history</h2>
        <ul className="divide-y divide-ink-900/[0.06]">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                to={`/results/${s.id}`}
                className="group -mx-3 flex items-center justify-between gap-4 rounded-xl px-3 py-3 transition hover:bg-ink-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-700 group-hover:text-ink-900">
                    {s.topic_text}
                  </p>
                  <p className="text-xs text-ink-400">{formatDate(s.created_at)}</p>
                </div>
                <span
                  className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl px-2.5 font-display text-sm font-bold tabular-nums text-white shadow-sm"
                  style={{ background: scoreTone(s.overall_score) }}
                >
                  {s.overall_score === null ? '—' : s.overall_score.toFixed(0)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
