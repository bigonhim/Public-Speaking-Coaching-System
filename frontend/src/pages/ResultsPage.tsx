// The results screen. Leads with the transparent score breakdown, then the
// coaching notes and the transcript. A user should be able to explain their
// own score from this screen alone.

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { SessionDetail } from '../api/types'
import { ApiError, deleteSession, getSession } from '../api/client'
import { ScoreBreakdown } from '../components/ScoreBreakdown'
import { Spinner } from '../components/ui/Spinner'
import { formatDateTime, formatDuration } from '../lib/scoring'

export function ResultsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

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

  const handleDelete = async () => {
    if (!session) return
    setDeleting(true)
    try {
      await deleteSession(session.id)
      navigate('/')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete this session.')
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  if (error) {
    return (
      <div className="card mx-auto max-w-xl p-8 text-center">
        <p className="text-ink-600">{error}</p>
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
    <div className="animate-fade-up space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">Session results</span>
        <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-ink-900">
          {session.topic_text}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-400">
          <span className="chip py-1">{formatDateTime(session.created_at)}</span>
          <span className="chip py-1">{formatDuration(session.duration_sec)}</span>
          <span className="chip py-1">{session.words.length} words</span>
        </div>
      </div>

      <ScoreBreakdown session={session} />

      {/* Audio playback */}
      {session.audio_url && (
        <section className="card p-6 sm:p-7">
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-ink-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
              🔊
            </span>
            Your recording
          </h2>
          {/* No <source type=...>: hardcoding audio/webm made a browser skip
              the track outright whenever the take was recorded as ogg or mp4.
              The server sends the real content type — trust it. */}
          <audio controls preload="metadata" src={session.audio_url} className="w-full">
            Your browser does not support the audio element.
          </audio>
        </section>
      )}

      {/* Coaching notes */}
      <section className="card p-6 sm:p-7">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-ink-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
            ✦
          </span>
          Coaching notes
        </h2>
        <ul className="space-y-3">
          {session.feedback.map((note, i) => (
            <li
              key={i}
              className="flex gap-3.5 rounded-2xl bg-gradient-to-br from-brand-50/80 to-white p-4 ring-1 ring-brand-100/70"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white shadow-glow">
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed text-ink-700">{note}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Transcript */}
      <section className="card p-6 sm:p-7">
        <button
          onClick={() => setShowTranscript((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="font-display text-lg font-bold text-ink-900">Transcript</span>
          <span className="chip py-1 text-brand-600">{showTranscript ? 'Hide' : 'Show'}</span>
        </button>
        {showTranscript && (
          <p className="mt-4 whitespace-pre-wrap leading-relaxed text-ink-600 animate-fade-in">
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
        <Link to="/how-its-scored" className="btn-ghost">
          How it's scored
        </Link>
      </div>

      {/* Delete session */}
      <div className="pt-4 border-t border-ink-900/[0.06]">
        {deleteConfirm ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              This will permanently delete this session and its recording. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="text-sm text-accent-600 hover:text-accent-700 transition"
          >
            Delete this session
          </button>
        )}
      </div>
    </div>
  )
}
