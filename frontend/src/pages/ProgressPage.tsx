// The progress dashboard: current level + ladder, a trend chart of overall and
// component scores over time, and a clickable session history. Shows a friendly
// empty state before the first recording.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LevelState, Progress, SessionListItem } from '../api/types'
import { getLevel, getProgress, listSessions } from '../api/client'
import { LevelLadder } from '../components/LevelLadder'
import { Spinner } from '../components/ui/Spinner'
import { COMPONENTS, OVERALL_COLOR, formatDate, scoreTone } from '../lib/scoring'

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
      <div className="card mx-auto max-w-xl p-10 text-center animate-fade-in">
        <div className="mb-3 text-4xl">🎤</div>
        <h1 className="text-xl font-bold text-slate-800">No sessions yet</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
          Record your first practice to start tracking pace, fillers, pauses and topic relevance — and to climb the seven levels.
        </p>
        <Link to="/" className="btn-primary mt-5 inline-flex">
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
    <div className="animate-fade-in space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Trend chart */}
        <section className="card p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-slate-800">Score trends</h2>
            <span className="text-sm text-slate-400">{progress.session_count} sessions</span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="overall" name="Overall" stroke={OVERALL_COLOR} strokeWidth={3} dot={false} />
                {COMPONENTS.map((c) => (
                  <Line
                    key={c.key}
                    type="monotone"
                    dataKey={c.key}
                    name={c.label}
                    stroke={c.color}
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Stat tiles */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {s.label}
                </p>
                <p
                  className="mt-0.5 text-2xl font-bold tabular-nums"
                  style={{ color: scoreTone(s.value) }}
                >
                  {s.value === null ? '—' : s.value.toFixed(0)}
                </p>
              </div>
            ))}
          </div>
          {progress.baseline_overall !== null && (
            <p className="mt-3 text-xs text-slate-400">
              Baseline (first session): {progress.baseline_overall.toFixed(1)} · improvement since:{' '}
              {latest !== null ? (latest - progress.baseline_overall).toFixed(1) : '—'}
            </p>
          )}
        </section>

        {/* Level ladder */}
        <LevelLadder level={level} />
      </div>

      {/* History */}
      <section className="card p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-800">Session history</h2>
        <ul className="divide-y divide-slate-100">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link
                to={`/results/${s.id}`}
                className="flex items-center justify-between gap-4 py-3 transition hover:bg-slate-50/70"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-700">{s.topic_text}</p>
                  <p className="text-xs text-slate-400">{formatDate(s.created_at)}</p>
                </div>
                <span
                  className="shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums text-white"
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
