// The practice flow: fetch a topic -> optional breathing ritual -> record with
// a live, reacting audience -> submit for analysis -> route to results.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LevelState, Topic } from '../api/types'
import { ApiError, createSession, getLevel, getRandomTopic } from '../api/client'
import { useRecorder } from '../hooks/useRecorder'
import { useLiveAudio } from '../hooks/useLiveAudio'
import { BreathingRitual } from '../components/BreathingRitual'
import { Recorder } from '../components/Recorder'
import { VirtualAudience } from '../components/VirtualAudience'
import { Spinner } from '../components/ui/Spinner'
import { ROOM_LABEL, ROOM_SIZES, defaultRoomSize, forgivenessForSize } from '../lib/audience'

type Phase = 'idle' | 'ritual' | 'recording' | 'submitting'
const SKIP_RITUAL_KEY = 'coach.skipRitual'

export function PracticePage() {
  const navigate = useNavigate()
  const recorder = useRecorder()

  const [topic, setTopic] = useState<Topic | null>(null)
  const [level, setLevel] = useState<LevelState | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [roomSize, setRoomSize] = useState<number>(3)
  const [error, setError] = useState<string | null>(null)
  const [loadingTopic, setLoadingTopic] = useState(true)

  const forgiveness = forgivenessForSize(roomSize)
  const live = useLiveAudio(recorder.stream, phase === 'recording', { forgiveness })

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
      .catch(() => setLevel(null))
  }, [loadTopic])

  const beginRecording = useCallback(async () => {
    setPhase('recording')
    await recorder.start()
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
    const blob = await recorder.stop()
    if (!blob) {
      setError('Recording was empty. Please try again.')
      setPhase('idle')
      return
    }
    setPhase('submitting')
    try {
      const id = await createSession(blob, topic.id, durationSec)
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
      <div className="card mx-auto max-w-xl p-8">
        <Spinner
          label="Analyzing your delivery…"
          sub="Transcribing, measuring pace and fillers, and checking topic relevance. This takes a few seconds."
        />
      </div>
    )
  }

  const recording = phase === 'recording'

  return (
    <div className="animate-fade-in space-y-6">
      {/* Topic card */}
      <section className="card overflow-hidden">
        <div className="bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-brand-50">
          Your topic
        </div>
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          {loadingTopic ? (
            <p className="text-slate-400">Loading a topic…</p>
          ) : (
            <p className="text-2xl font-bold leading-snug text-slate-800">{topic?.text}</p>
          )}
          {!recording && (
            <button onClick={loadTopic} className="btn-ghost shrink-0 self-start" disabled={loadingTopic}>
              ↻ New topic
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {recorder.error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {recorder.error}
        </div>
      )}

      {/* Audience + controls */}
      <section className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Your audience</h2>
            <p className="text-sm text-slate-400">
              They react to how you sound — never to your words. Build confidence one room at a time.
            </p>
          </div>
          {!recording && (
            <label className="flex items-center gap-2 text-sm text-slate-500">
              Room
              <select
                value={roomSize}
                onChange={(e) => setRoomSize(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 focus:border-brand-400 focus:outline-none"
              >
                {ROOM_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {ROOM_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <VirtualAudience engagement={recording ? live.engagement : 0.7} size={roomSize} />
      </section>

      {/* Recorder / start */}
      <section className="card flex flex-col items-center gap-2 p-8">
        {recording ? (
          <Recorder
            elapsedSec={recorder.elapsedSec}
            volume={live.volume}
            speaking={live.speaking}
            onStop={stopAndSubmit}
          />
        ) : (
          <>
            <p className="text-center text-slate-500">
              Take a breath, then speak for about a minute. Aim for a natural, steady pace.
            </p>
            <button
              onClick={startPractice}
              disabled={loadingTopic || !topic}
              className="btn-primary mt-2 px-10 py-3 text-lg"
            >
              ● Start practice
            </button>
            {level && (
              <p className="mt-1 text-xs text-slate-400">
                Level {level.current_level} · {level.name}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
