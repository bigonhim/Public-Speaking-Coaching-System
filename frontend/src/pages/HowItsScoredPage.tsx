// "How it's scored" page — transparent explanation of the scoring methodology,
// fetched live from the backend so it always reflects the actual config.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ScoringConfig } from '../api/types'
import { ApiError, getScoringConfig } from '../api/client'
import { COMPONENTS, OVERALL_COLOR, formatClock, verdict } from '../lib/scoring'
import { Spinner } from '../components/ui/Spinner'

export function HowItsScoredPage() {
  const [config, setConfig] = useState<ScoringConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getScoringConfig()
      .then(setConfig)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load scoring config.'))
  }, [])

  if (error) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <p className="text-ink-600">{error}</p>
        <Link to="/" className="btn-primary mt-4">
          Back
        </Link>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="card mx-auto max-w-xl p-8">
        <Spinner label="Loading scoring methodology…" />
      </div>
    )
  }

  const verdicts = [
    { score: 85, label: 'Excellent', desc: 'Outstanding delivery — you nailed it.' },
    { score: 70, label: 'Strong', desc: 'Very solid. Keep refining the details.' },
    { score: 55, label: 'Solid start', desc: 'Good foundation. Work on pacing and fillers.' },
    { score: 40, label: 'Getting there', desc: 'You\'re building the habit. Stay consistent.' },
    { score: 0, label: 'Keep building', desc: 'Early stage. Every practice session helps.' },
  ]

  return (
    <div className="animate-fade-up space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">Transparency</span>
        <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-ink-900">
          How it's scored
        </h1>
        <p className="mt-2 max-w-2xl text-base text-ink-600">
          Every score is explainable. Here's exactly how we measure and rate your delivery — no black boxes, just
          clear metrics and transparent weights.
        </p>
      </div>

      {/* The four scored components */}
      <section className="card p-6 sm:p-7">
        <h2 className="mb-5 font-display text-lg font-bold text-ink-900">The four components</h2>
        <div className="space-y-4">
          {COMPONENTS.map((c) => (
            <div key={c.key} className="rounded-2xl border border-ink-900/[0.06] p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: c.color }}>
                  <span className="text-xs font-bold text-white">●</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-ink-900">{c.label}</h3>
                    <span className="shrink-0 rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-600">
                      {Math.round((config.weights[c.key] ?? 0) * 100)}%
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-600">{c.blurb}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Overall score breakdown */}
      <section className="card p-6 sm:p-7">
        <h2 className="mb-5 font-display text-lg font-bold text-ink-900">Overall score</h2>
        <p className="mb-4 text-sm text-ink-600">
          Your overall score is a weighted average of the four components, combined into a single 0–100 number. The
          weights shown above determine how much each component contributes.
        </p>
        <div className="rounded-2xl border border-ink-900/[0.06] p-4" style={{ borderLeftColor: OVERALL_COLOR, borderLeftWidth: '4px' }}>
          <p className="text-sm font-medium text-ink-700">
            <span className="font-display text-lg font-bold">Overall</span> = (pace × {Math.round((config.weights.pace ?? 0) * 100)}%) +
            (fillers × {Math.round((config.weights.filler ?? 0) * 100)}%) + (pauses × {Math.round((config.weights.pause ?? 0) * 100)}%) +
            (relevance × {Math.round((config.weights.relevance ?? 0) * 100)}%)
          </p>
        </div>
      </section>

      {/* Verdict scale */}
      <section className="card p-6 sm:p-7">
        <h2 className="mb-5 font-display text-lg font-bold text-ink-900">Verdict scale</h2>
        <p className="mb-5 text-sm text-ink-600">
          Your overall score translates into a qualitative verdict that guides your next steps:
        </p>
        <div className="space-y-3">
          {verdicts.map((v, i) => {
            const v_obj = verdict(v.score)
            return (
              <div key={i} className="flex items-center gap-3 rounded-2xl bg-ink-50/60 p-4">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white font-bold text-sm"
                  style={{ background: v_obj.color }}
                >
                  {v.score}+
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-ink-900">{v.label}</p>
                  <p className="text-sm text-ink-500">{v.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Minimum session length */}
      <section className="card p-6 sm:p-7">
        <h2 className="mb-3 font-display text-lg font-bold text-ink-900">Minimum recording time</h2>
        <p className="text-sm text-ink-600">
          A take needs at least <span className="font-semibold">{formatClock(config.min_session_sec)}</span> to be scored. Under that
          there isn't enough speech to measure pacing, pauses, and topic coverage fairly, so shorter takes are discarded
          rather than given an unreliable score. Past the minimum, keep going as long as you like: longer takes give the
          scorer more to work with. The recorder stops and scores on its own at{' '}
          <span className="font-semibold">{formatClock(config.max_session_sec)}</span>.
        </p>
      </section>

      {/* Own topics */}
      <section className="card p-6 sm:p-7">
        <h2 className="mb-3 font-display text-lg font-bold text-ink-900">Speaking on your own topic</h2>
        <p className="text-sm text-ink-600">
          Choose <span className="font-semibold">My own</span> on the practice screen to talk about anything you like
          ({config.custom_topic_min_chars}–{config.custom_topic_max_chars} characters). The take is scored exactly the same
          way, with relevance measured against the topic you typed.
        </p>
        <p className="mt-3 text-sm text-ink-600">
          Own-topic takes appear in your history and trends, and they{' '}
          <span className="font-semibold">count towards the delivery levels</span>: The Novice (one take of{' '}
          {formatClock(config.min_session_sec)} or more), The Speaker (pace) and The Communicator (fillers). Those levels only look at
          how you spoke, so the topic doesn't matter.
        </p>
        <p className="mt-3 text-sm text-ink-600">
          The other levels (The Apprentice, The Persuader, The Orator and The Master Orator) depend on relevance, which is{' '}
          {Math.round((config.weights.relevance ?? 0) * 100)}% of the score. A topic you wrote yourself could simply echo
          what you planned to say, so <span className="font-semibold">only randomly drawn topics count towards them</span>,
          where nobody can tune the question to the answer. Your baseline is also taken from your first random-topic take.
        </p>
      </section>

      {/* Back link */}
      <div className="flex gap-3 pt-4 border-t border-ink-900/[0.06]">
        <Link to="/" className="btn-primary">
          Back to practice
        </Link>
      </div>
    </div>
  )
}
