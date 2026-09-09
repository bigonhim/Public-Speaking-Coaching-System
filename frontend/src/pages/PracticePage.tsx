// The practice flow: fetch a topic -> optional breathing ritual -> record with
// a live, reacting audience -> submit for analysis -> route to results.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LevelState, Topic } from '../api/types'
import { ApiError, createSession, getLevel, getRandomTopic, getScoringConfig } from '../api/client'
import { useRecorder } from '../hooks/useRecorder'
import { useLiveAudio } from '../hooks/useLiveAudio'
import { useSpeechTranscription } from '../hooks/useSpeechTranscription'
import { BreathingRitual } from '../components/BreathingRitual'
import { StageView } from '../components/StageView'
import { VirtualAudience } from '../components/VirtualAudience'
import { Spinner } from '../components/ui/Spinner'
import { LogoMark } from '../components/ui/Logo'
import { COMPONENTS } from '../lib/scoring'
import { ROOM_LABEL, ROOM_SIZES, defaultRoomSize, forgivenessForSize } from '../lib/audience'

type Phase = 'idle' | 'ritual' | 'recording' | 'submitting'
const SKIP_RITUAL_KEY = 'coach.skipRitual'

export function PracticePage() {
  const navigate = useNavigate()
  const recorder = useRecorder()

  const [topic, setTopic] = useState<Topic | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [roomSize, setRoomSize] = useState<number>(3)
  const [level, setLevel] = useState<LevelState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingTopic, setLoadingTopic] = useState(true)
  const [minSec, setMinSec] = useState(45)

  const forgiveness = forgivenessForSize(roomSize)
  const live = useLiveAudio(recorder.stream, phase === 'recording', { forgiveness })
  const transcript = useSpeechTranscription(phase === 'recording')

  const loadTopic = useCallback(async () => {
    setLoadingTopic(true)
    setError(null)
    try {
      const t = await getRandomTopic()
      setTopic(t)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load a topic.')
    } finally {
      setLoadingTopic(false)
    }
  }, [])

  useEffect(() => {
    loadTopic()
    getLevel()
      .then((l) => {
        setLevel(l)
        setRoomSize(defaultRoomSize(l.current_level))
      })
      .catch(() => {})
    getScoringConfig()
      .then((cfg) => setMinSec(cfg.min_session_sec))
      .catch(() => {})
  }, [loadTopic])

  const beginRecording = useCallback(async () => {
    // Enter the stage only once the mic is actually live. Switching first left
    // a denied permission showing the full-screen stage with a running clock
    // and nothing listening — the error message was behind the overlay.
    const started = await recorder.start()
    setPhase(started ? 'recording' : 'idle')
  }, [recorder])

  const startPractice = () => {
    if (localStorage.getItem(SKIP_RITUAL_KEY) === '1') {
      void beginRecording()
    } else {
      setPhase('ritual')
    }
  }

  const stopAndSubmit = async () => {
    if (!topic) return
    const durationSec = recorder.elapsedSec
    const mimeType = recorder.mimeType
    const blob = await recorder.stop()
    if (!blob) {
      setError('Recording was empty. Please try again.')
      setPhase('idle')
      return
    }
    setPhase('submitting')
    try {
      const id = await createSession(blob, topic.id, durationSec, mimeType)
      navigate(`/results/${id}`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Analysis failed. Please try again.')
      setPhase('idle')
    }
  }

  // --- Ritual overlay --------------------------------------------------------
  if (phase === 'ritual') {
    return (
      <BreathingRitual
        onDone={() => void beginRecording()}
        onAlwaysSkip={() => localStorage.setItem(SKIP_RITUAL_KEY, '1')}
      />
    )
  }

  // --- Submitting ------------------------------------------------------------
  if (phase === 'submitting') {
    return (
      <div className="card mx-auto max-w-xl p-10">
        <Spinner
          label="Analyzing your delivery…"
          sub="Transcribing, measuring pace and fillers, and checking topic relevance. This takes a few seconds."
        />
      </div>
    )
  }

  // --- Recording: the immersive full-screen stage ----------------------------
  if (phase === 'recording' && topic) {
    return (
      <StageView
        topic={topic.text}
        roomSize={roomSize}
        engagement={live.engagement}
        elapsedSec={recorder.elapsedSec}
        volume={live.volume}
        speaking={live.speaking}
        finalText={transcript.finalText}
        interim={transcript.interim}
        transcriptSupported={transcript.supported}
        onStop={stopAndSubmit}
        minSec={minSec}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Hero — the idle "get set up" state. */}
      <section className="animate-fade-up relative overflow-hidden rounded-3xl bg-gradient-stage-dark px-6 py-10 text-white shadow-lift sm:px-10 sm:py-12">
          {/* aurora glows */}
          <div
            className="pointer-events-none absolute -right-10 -top-24 h-72 w-72 rounded-full opacity-70 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(255,86,48,0.55), transparent 65%)' }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-24 left-10 h-72 w-72 rounded-full opacity-60 blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(122,80,255,0.6), transparent 65%)' }}
            aria-hidden
          />

          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <span className="eyebrow text-brand-200">
                <LogoMark size={18} /> Your AI speaking coach
              </span>
              <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
                Speak with{' '}
                <span className="bg-gradient-to-r from-brand-300 via-accent-300 to-brand-200 bg-clip-text text-transparent">
                  confidence.
                </span>
                <br />
                Every take.
              </h1>
              <p className="mt-4 max-w-md text-base leading-relaxed text-white/70">
                Warm up, speak to a room that reacts in real time, then get honest
                feedback on pace, fillers and clarity — in about a minute a day.
              </p>
            </div>

            {/* Floating live stat chips — real state, not decoration. */}
            <div className="flex shrink-0 flex-row gap-3 lg:flex-col">
              <div className="stat-badge animate-float-slow bg-white/95 text-ink-800">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
                  {level?.current_level ?? '–'}
                </span>
                <div className="leading-tight">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                    Your level
                  </p>
                  <p className="text-sm font-bold">{level?.name ?? 'The Novice'}</p>
                </div>
              </div>
              <div className="stat-badge animate-float bg-white/95 text-ink-800">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-lg">
                  🎧
                </span>
                <div className="leading-tight">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                    Live audience
                  </p>
                  <p className="text-sm font-bold">Reacts as you speak</p>
                </div>
              </div>
            </div>
          </div>
        </section>

      {/* Topic card */}
      <section className="card card-hover animate-fade-up overflow-hidden">
        <div className="flex items-center justify-between bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/90">
            Your topic
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
            ~60 seconds
          </span>
        </div>
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          {loadingTopic ? (
            <p className="text-ink-300">Loading a topic…</p>
          ) : (
            <p className="font-display text-2xl font-bold leading-snug text-ink-900 sm:text-[1.7rem]">
              {topic?.text}
            </p>
          )}
          <button onClick={loadTopic} className="btn-ghost shrink-0 self-start" disabled={loadingTopic}>
            <span className={loadingTopic ? 'animate-spin' : ''}>↻</span> New topic
          </button>
        </div>
      </section>

      {error && (
        <div className="animate-fade-in alert-error">
          {error}
        </div>
      )}
      {recorder.error && (
        <div className="animate-fade-in alert-warning">
          {recorder.error}
        </div>
      )}

      {/* Audience + controls */}
      <section className="card animate-fade-up p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ink-900">Your audience</h2>
            <p className="mt-0.5 text-sm text-ink-400">
              They react to how you <em>sound</em> — never to your words.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-500">
            Room
            <select
              value={roomSize}
              onChange={(e) => setRoomSize(Number(e.target.value))}
              className="rounded-xl border border-ink-900/10 bg-white px-3 py-1.5 font-medium text-ink-700 shadow-sm transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              {ROOM_SIZES.map((s) => (
                <option key={s} value={s}>
                  {ROOM_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <VirtualAudience
          engagement={live.engagement}
          size={roomSize}
          faceSize={roomSize >= 12 ? 68 : roomSize >= 9 ? 80 : roomSize >= 6 ? 92 : 104}
        />
      </section>

      {/* Start */}
      <section className="card animate-fade-up flex flex-col items-center gap-2 p-8">
        <p className="max-w-md text-center text-ink-500">
          Take a breath, then speak for about a minute. Aim for a natural, steady pace.
        </p>
        <button
          onClick={startPractice}
          disabled={loadingTopic || !topic}
          className="btn-primary group mt-3 px-9 py-3.5 text-base"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white/70 group-hover:animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          Start practice
        </button>

        {/* What we'll measure — sets expectations and reinforces transparency. */}
        <div className="mt-7 w-full border-t border-ink-900/[0.06] pt-6">
          <p className="mb-3.5 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">
            What we'll measure
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {COMPONENTS.map((c) => (
              <span key={c.key} className="chip" title={c.blurb}>
                <span className="dot" style={{ background: c.color }} />
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
