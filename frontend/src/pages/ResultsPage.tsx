// The results screen. Leads with the transparent score breakdown, then the
// coaching notes and the transcript. A user should be able to explain their
// own score from this screen alone.

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { SessionDetail } from '../api/types'
import { ApiError, getSession } from '../api/client'
import { ScoreBreakdown } from '../components/ScoreBreakdown'
import { Spinner } from '../components/ui/Spinner'
import { formatDateTime, formatDuration } from '../lib/scoring'

export function ResultsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)

  useEffect(() => {
    const sessionId = Number(id)
    if (!Number.isFinite(sessionId)) {
      setError('Invalid session.')
      return
    }
    getSession(sessionId)
      .then(setSession)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load this session.'))
  }, [id])

  if (error) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <p className="text-slate-600">{error}</p>
        <button onClick={() => navigate('/')} className="btn-primary mt-4">
          Back to practice
        </button>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="card mx-auto max-w-xl p-8">
        <Spinner label="Loading your results…" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your topic</p>
        <h1 className="text-2xl font-bold text-slate-800">{session.topic_text}</h1>
        <p className="text-sm text-slate-400">
          {formatDateTime(session.created_at)} · {formatDuration(session.duration_sec)} · {session.words.length} words
        </p>
      </div>

      <ScoreBreakdown session={session} />

      {/* Coaching notes */}
      <section className="card p-6">
        <h2 className="mb-3 text-lg font-bold text-slate-800">Coaching notes</h2>
        <ul className="space-y-3">
          {session.feedback.map((note, i) => (
            <li key={i} className="flex gap-3 rounded-xl bg-brand-50/60 p-4">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed text-slate-700">{note}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Transcript */}
      <section className="card p-6">
        <button
          onClick={() => setShowTranscript((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-lg font-bold text-slate-800">Transcript</span>
          <span className="text-sm text-brand-600">{showTranscript ? 'Hide' : 'Show'}</span>
        </button>
        {showTranscript && (
          <p className="mt-3 whitespace-pre-wrap leading-relaxed text-slate-600">
            {session.transcript || 'No speech was detected in this recording.'}
          </p>
        )}
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => navigate('/')} className="btn-primary">
          Practice again
        </button>
        <Link to="/progress" className="btn-ghost">
          View progress
        </Link>
      </div>
    </div>
  )
}
