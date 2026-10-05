// The results screen, as the console's readout of one take: the overall score
// and the four channels behind it, a replay of the take on its timeline, the
// coaching notes printed out, and the recording with its transcript. A user
// should be able to explain their own score from this screen alone.

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ScoringConfig, SessionDetail, Word } from '../api/types'
import { ApiError, deleteSession, getScoringConfig, getSession } from '../api/client'
import { ScoreBreakdown } from '../components/ScoreBreakdown'
import { TakeReplay } from '../components/TakeReplay'
import { Chassis, Module } from '../components/ui/Hardware'
import { Spinner } from '../components/ui/Spinner'
import { findFillers } from '../lib/replay'
import { formatClock, formatDate, formatDateTime } from '../lib/scoring'

/** The jagged tear along the bottom of the printed notes. */
const TEAR = (() => {
  let d = 'M0 0 H240'
  for (let x = 240; x > 0; x -= 8) d += ` L${x - 4} 9 L${x - 8} 0`
  return `${d} Z`
})()

function CoachNotes({ notes, date }: { notes: string[]; date: string }) {
  return (
    <Module label="04 · Coach notes" aside={`${notes.length} note${notes.length === 1 ? '' : 's'}`} className="flex-[5_1_400px]">
      {/* The printer slot the notes feed out of. */}
      <div className="mx-1 h-2.5 rounded-md bg-lcd-panel shadow-[inset_0_2px_4px_rgba(0,0,0,0.7),0_1px_0_#fff]" aria-hidden />
      <div className="-mt-[5px] mx-3 drop-shadow-[0_10px_12px_rgba(60,40,10,0.22)] sm:mx-5">
        <div className="bg-[linear-gradient(180deg,#ECEAE3,#FCFBF7_18px)] px-5 pb-2.5 pt-5 font-mono text-[13px] leading-relaxed text-[#2A2925]">
          <div className="flex justify-between pb-2.5 text-[11px] uppercase tracking-[0.12em] text-ink-500">
            <span>Cadence coach</span>
            <span>{date}</span>
          </div>
          {notes.length === 0 ? (
            <p className="border-t border-dashed border-ink-300 py-3">No notes for this take.</p>
          ) : (
            <ol>
              {notes.map((note, i) => (
                <li key={i} className="grid grid-cols-[26px_1fr] gap-1.5 border-t border-dashed border-ink-300 py-2.5">
                  <span className="text-brand-600">{String(i + 1).padStart(2, '0')}</span>
                  <span>{note}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <svg width="100%" height="9" viewBox="0 0 240 9" preserveAspectRatio="none" className="block" aria-hidden>
          <path d={TEAR} fill="#FCFBF7" />
        </svg>
      </div>
    </Module>
  )
}

/** The transcript, word by word, with every filler the scorer counted marked. */
function MarkedTranscript({ words, fallback, config }: { words: Word[]; fallback: string; config: ScoringConfig | null }) {
  if (words.length === 0) {
    return <p>{fallback || 'No speech was detected in this recording.'}</p>
  }
  const marked = new Set<number>()
  if (config) {
    for (const f of findFillers(words, config.fillers)) {
      for (let k = 0; k < f.length; k++) marked.add(f.index + k)
    }
  }
  return (
    <p>
      {words.map((w, i) => {
        const text = w.word.trim()
        return (
          <span key={i}>
            {i > 0 && ' '}
            {marked.has(i) ? (
              <mark className="rounded-sm bg-brand-500/20 px-0.5 text-ink-900 shadow-[inset_0_-2px_0_#F2541B]">{text}</mark>
            ) : (
              text
            )}
          </span>
        )
      })}
    </p>
  )
}

export function ResultsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [config, setConfig] = useState<ScoringConfig | null>(null)
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
    getScoringConfig()
      .then(setConfig)
      .catch(() => {})
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
      <Chassis className="mx-auto max-w-xl">
        <Module label="Results">
          <div className="lcd px-6 py-7 font-mono text-sm text-lcd-text" role="alert">
            {error}
          </div>
          <button onClick={() => navigate('/')} className="key-signal key mt-5">
            Back to practice
          </button>
        </Module>
      </Chassis>
    )
  }

  if (!session) {
    return (
      <Chassis className="mx-auto max-w-xl">
        <Spinner label="Loading your results…" />
      </Chassis>
    )
  }

  return (
    <Chassis className="animate-fade-up">
      <div className="mb-6 px-0.5">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-500">
          {formatDateTime(session.created_at)} · {formatClock(session.duration_sec)} · {session.words.length} words
        </p>
        <h1 className="mt-2 max-w-4xl text-balance text-[1.6rem] font-semibold leading-tight tracking-[-0.025em] text-ink-950 sm:text-[2rem]">
          {session.topic_text}
        </h1>
      </div>

      <ScoreBreakdown session={session} />

      <div className="mt-4 flex flex-wrap gap-4 sm:mt-[22px] sm:gap-[22px]">
        <TakeReplay
          words={session.words}
          durationSec={session.duration_sec}
          config={config}
          className="flex-[7_1_560px]"
        />
        <CoachNotes notes={session.feedback} date={formatDate(session.created_at)} />
      </div>

      <Module label="05 · Playback" className="mt-4 sm:mt-[22px]">
        {session.audio_url && (
          // No <source type=...>: hardcoding audio/webm made a browser skip
          // the track outright whenever the take was recorded as ogg or mp4.
          // The server sends the real content type — trust it.
          <audio controls preload="metadata" src={session.audio_url} className="w-full">
            Your browser does not support the audio element.
          </audio>
        )}
        <div className={session.audio_url ? 'mt-4' : ''}>
          <button
            onClick={() => setShowTranscript((v) => !v)}
            aria-expanded={showTranscript}
            className={`key ${showTranscript ? 'key-on' : ''}`}
          >
            {showTranscript ? 'Hide transcript' : 'Show transcript'}
          </button>
          {showTranscript && (
            <div className="mt-4 animate-fade-in rounded-xl bg-[#FCFBF7] px-5 py-4 text-[15px] leading-[1.8] text-ink-800 shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)]">
              <MarkedTranscript words={session.words} fallback={session.transcript} config={config} />
            </div>
          )}
        </div>
      </Module>

      <div className="mt-6 flex flex-wrap items-center gap-3.5 sm:mt-[26px]">
        <button onClick={() => navigate('/')} className="key key-signal key-lg">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-900" aria-hidden />
          Practice again
        </button>
        <Link to="/progress" className="key key-lg">
          Progress
        </Link>
        <Link to="/how-its-scored" className="key key-lg">
          How it’s scored
        </Link>
        <div className="ml-auto">
          {deleteConfirm ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-ink-600">Delete this take and its recording for good?</p>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="key border-accent-700 text-accent-700"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button onClick={() => setDeleteConfirm(false)} disabled={deleting} className="key">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="min-h-[44px] px-1 font-mono text-xs uppercase tracking-[0.1em] text-accent-700 underline-offset-4 hover:underline"
            >
              Delete take
            </button>
          )}
        </div>
      </div>
    </Chassis>
  )
}
