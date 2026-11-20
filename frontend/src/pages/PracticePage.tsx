// The practice flow: choose a topic -> optional breathing ritual -> record with
// a live, reacting audience -> submit for analysis -> route to results.
//
// The topic is either drawn at random or typed by the speaker ("My own").
// Own-topic takes are scored the same way but only count towards the delivery
// levels (duration, pace, fillers): the speaker wrote the text that relevance
// is measured against.
//
// The idle screen is the console at rest: the topic on its display, the room
// on its monitor, and the record button waiting in the transport row.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PenLine, Shuffle } from 'lucide-react'
import type { ScoringConfig, Topic, TopicChoice, TopicSource } from '../api/types'
import { ApiError, createSession, getLevel, getRandomTopic, getScoringConfig } from '../api/client'
import { useRecorder } from '../hooks/useRecorder'
import { useLiveAudio } from '../hooks/useLiveAudio'
import { useSpeechTranscription } from '../hooks/useSpeechTranscription'
import { BreathingRitual } from '../components/BreathingRitual'
import { StageView } from '../components/StageView'
import { VirtualAudience } from '../components/VirtualAudience'
import { Chassis, LevelMeter, Module, PaceMeter, RecButton } from '../components/ui/Hardware'
import { COMPONENTS, formatClock } from '../lib/scoring'
import { ROOM_LABEL, ROOM_SHORT, ROOM_SIZES, defaultRoomSize, forgivenessForSize } from '../lib/audience'

type Phase = 'idle' | 'ritual' | 'recording' | 'submitting'
const SKIP_RITUAL_KEY = 'coach.skipRitual'
const TOPIC_MODE_KEY = 'coach.topicMode'
const OWN_TOPIC_KEY = 'coach.ownTopic'

// Per-browser conveniences only: storage may be blocked, so every access is
// guarded and the page works the same without it.
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked: nothing is remembered, nothing breaks.
  }
}

function skipsRitual(): boolean {
  try {
    return localStorage.getItem(SKIP_RITUAL_KEY) === '1'
  } catch {
    return false
  }
}

export function PracticePage() {
  const navigate = useNavigate()
  const recorder = useRecorder()

  const [topic, setTopic] = useState<Topic | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [roomSize, setRoomSize] = useState<number>(3)
  const [error, setError] = useState<string | null>(null)
  const [loadingTopic, setLoadingTopic] = useState(true)
  const [config, setConfig] = useState<ScoringConfig | null>(null)
  const [topicMode, setTopicMode] = useState<TopicSource>(() =>
    readStored(TOPIC_MODE_KEY) === 'custom' ? 'custom' : 'random',
  )
  const [ownTopic, setOwnTopic] = useState<string>(() => readStored(OWN_TOPIC_KEY) ?? '')

  // A take needs at least minSec to be scored; past that the speaker can keep
  // going until maxSec, where the recorder stops and submits on its own.
  const minSec = config?.min_session_sec ?? 60
  const maxSec = config?.max_session_sec ?? 600
  // The server is the authority on these; the fallbacks only cover the moment
  // before /scoring has answered.
  const ownMin = config?.custom_topic_min_chars ?? 5
  const ownMax = config?.custom_topic_max_chars ?? 150
  const ownTrimmed = ownTopic.trim().replace(/\s+/g, ' ')
  const ownValid = ownTrimmed.length >= ownMin && ownTrimmed.length <= ownMax

  const isOwn = topicMode === 'custom'
  const activeTopicText = isOwn ? ownTrimmed : (topic?.text ?? '')
  const canRecord = isOwn ? ownValid : !loadingTopic && !!topic
  const paceTarget: [number, number] = [config?.pace_target_min ?? 120, config?.pace_target_max ?? 150]

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
      .then((l) => setRoomSize(defaultRoomSize(l.current_level)))
      .catch(() => {})
    getScoringConfig()
      .then(setConfig)
      .catch(() => {})
  }, [loadTopic])

  const beginRecording = useCallback(async () => {
    // Enter the stage only once the mic is actually live. Switching first left
    // a denied permission showing the full-screen stage with a running clock
    // and nothing listening — the error message was behind the overlay.
    const started = await recorder.start()
    if (started) setError(null)
    setPhase(started ? 'recording' : 'idle')
  }, [recorder])

  const chooseMode = (mode: TopicSource) => {
    setTopicMode(mode)
    writeStored(TOPIC_MODE_KEY, mode)
  }

  const editOwnTopic = (text: string) => {
    setOwnTopic(text)
    writeStored(OWN_TOPIC_KEY, text)
  }

  const startPractice = () => {
    if (!canRecord) return
    if (skipsRitual()) {
      void beginRecording()
    } else {
      setPhase('ritual')
    }
  }

  // Set while a take is being stopped, so the auto-stop at maxSec and a press
  // of STOP landing together cannot submit the same take twice.
  const stoppingRef = useRef(false)

  const stopAndSubmit = async () => {
    if (stoppingRef.current) return
    // What was on screen when REC was pressed.
    let choice: TopicChoice | null = null
    if (isOwn && ownValid) choice = { topicText: ownTrimmed }
    else if (!isOwn && topic) choice = { topicId: topic.id }
    if (!choice) return
    const durationSec = recorder.elapsedSec
    // Too short to score: the server would refuse it, so do not upload it.
    // StageView routes an early stop to discardTake; this is the backstop.
    if (durationSec < minSec) return
    stoppingRef.current = true
    const mimeType = recorder.mimeType
    const blob = await recorder.stop()
    stoppingRef.current = false
    if (!blob) {
      setError('Recording was empty. Please try again.')
      setPhase('idle')
      return
    }
    setPhase('submitting')
    try {
      const id = await createSession(blob, choice, durationSec, mimeType)
      navigate(`/results/${id}`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Analysis failed. Please try again.')
      setPhase('idle')
    }
  }

  /** Stop before the minimum: nothing is uploaded or scored. */
  const discardTake = async () => {
    if (stoppingRef.current) return
    stoppingRef.current = true
    await recorder.stop()
    stoppingRef.current = false
    recorder.reset()
    setError(`That take was under ${formatClock(minSec)}, so it was not scored. Takes need at least ${formatClock(minSec)}.`)
    setPhase('idle')
  }

  // The cap: stop and score on its own rather than let the speaker talk past
  // what the server accepts.
  const atCap = phase === 'recording' && recorder.elapsedSec >= maxSec
  useEffect(() => {
    if (atCap) void stopAndSubmit()
    // stopAndSubmit is recreated every render; firing on the cap edge is all
    // that matters here, and stoppingRef guards against a repeat.
  }, [atCap])

  // --- Ritual overlay --------------------------------------------------------
  if (phase === 'ritual') {
    return (
      <BreathingRitual
        onDone={() => void beginRecording()}
        onAlwaysSkip={() => {
          try {
            localStorage.setItem(SKIP_RITUAL_KEY, '1')
          } catch {
            // Storage blocked: the warm-up simply comes back next time.
          }
        }}
      />
    )
  }

  // --- Submitting ------------------------------------------------------------
  if (phase === 'submitting') {
    return (
      <Chassis className="mx-auto max-w-xl animate-fade-in">
        <Module label="Analysing" aside={<span className="led led-on motion-safe:animate-blink" aria-hidden />}>
          <div className="lcd px-6 py-7 font-mono" role="status">
            <p className="lcd-glow text-sm uppercase tracking-[0.16em]">
              Analysing your take<span className="motion-safe:animate-blink">_</span>
            </p>
            <ul className="mt-5 space-y-2 text-[13px] text-lcd-soft">
              <li>▸ Transcribing the recording</li>
              <li>▸ Measuring pace, fillers and pauses</li>
              <li>▸ Checking how closely it stayed on topic</li>
            </ul>
          </div>
          <p className="mt-4 text-sm text-ink-500">This takes a few seconds; longer takes take a little longer.</p>
        </Module>
      </Chassis>
    )
  }

  // --- Recording: the console in record mode ----------------------------------
  if (phase === 'recording' && activeTopicText) {
    return (
      <StageView
        topic={activeTopicText}
        roomSize={roomSize}
        engagement={live.engagement}
        elapsedSec={recorder.elapsedSec}
        volume={live.volume}
        speaking={live.speaking}
        finalText={transcript.finalText}
        interim={transcript.interim}
        transcriptSupported={transcript.supported}
        onStop={stopAndSubmit}
        onDiscard={discardTake}
        minSec={minSec}
        maxSec={maxSec}
        paceTarget={paceTarget}
      />
    )
  }

  // Smaller faces for a fuller room so the crowd still fits the monitor.
  const faceSize = roomSize >= 12 ? 54 : roomSize >= 9 ? 60 : roomSize >= 6 ? 72 : 88

  return (
    <Chassis className="animate-fade-up">
      <div className="flex flex-wrap gap-4 sm:gap-[22px]">
        <Module
          label="01 · Topic"
          aside={isOwn ? 'Your topic' : topic?.category}
          className="flex flex-[7_1_520px] flex-col"
        >
          <div className="lcd min-h-[214px] flex-1 px-6 py-6 sm:px-7">
            <p className="lcd-glow font-mono text-xs uppercase tracking-[0.14em]">
              {isOwn ? '▸ Type what you want to talk about' : `▸ Speak for at least ${formatClock(minSec)}, longer if you can`}
            </p>
            {isOwn ? (
              <>
                <label htmlFor="own-topic" className="sr-only">
                  Your topic
                </label>
                <textarea
                  id="own-topic"
                  value={ownTopic}
                  onChange={(e) => editOwnTopic(e.target.value)}
                  onKeyDown={(e) => {
                    // A topic is one line; Enter starts the take instead.
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      startPractice()
                    }
                  }}
                  maxLength={ownMax}
                  rows={3}
                  autoFocus
                  placeholder="e.g. Why everyone should learn to cook"
                  aria-describedby="own-topic-hint"
                  className="mt-[18px] block w-full max-w-[640px] resize-none bg-transparent text-[1.5rem] font-medium leading-[1.2] tracking-[-0.02em] text-lcd-text caret-[#ff8a4c] outline-none placeholder:text-lcd-dim sm:text-[2rem]"
                />
              </>
            ) : loadingTopic ? (
              <p className="mt-5 font-mono text-sm uppercase tracking-[0.12em] text-lcd-dim motion-safe:animate-blink">
                Loading a topic…
              </p>
            ) : (
              <h1 className="mt-[18px] max-w-[640px] text-balance text-[1.75rem] font-medium leading-[1.14] tracking-[-0.02em] text-lcd-text sm:text-[2.4rem]">
                {topic?.text ?? 'No topic loaded.'}
              </h1>
            )}
          </div>
          <div className="mt-[18px] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Topic source" className="flex gap-1.5">
                <button
                  onClick={() => chooseMode('random')}
                  aria-pressed={!isOwn}
                  className={`key ${!isOwn ? 'key-on' : ''}`}
                >
                  <Shuffle size={15} aria-hidden />
                  Random
                </button>
                <button
                  onClick={() => chooseMode('custom')}
                  aria-pressed={isOwn}
                  className={`key ${isOwn ? 'key-on' : ''}`}
                >
                  <PenLine size={15} aria-hidden />
                  My own
                </button>
              </div>
              {!isOwn && (
                <button onClick={loadTopic} className="key" disabled={loadingTopic}>
                  <Shuffle size={15} className={loadingTopic ? 'animate-spin' : ''} aria-hidden />
                  New topic
                </button>
              )}
            </div>
            {isOwn ? (
              <span
                id="own-topic-hint"
                aria-live="polite"
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-500"
              >
                {ownTrimmed.length < ownMin ? `At least ${ownMin} characters` : `${ownTrimmed.length}/${ownMax}`}
                {' · Counts for delivery levels'}
              </span>
            ) : (
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-500">
                Scored from {formatClock(minSec)} · up to {formatClock(maxSec)}
              </span>
            )}
          </div>
        </Module>

        <Module
          label="02 · Room"
          aside={roomSize === 0 ? 'Empty' : `${roomSize} seated`}
          className="flex-[5_1_380px]"
        >
          <div className="lcd flex min-h-[190px] items-center justify-center px-3.5 py-5">
            <div
              className="pointer-events-none absolute inset-0 -z-[1]"
              style={{ background: 'radial-gradient(ellipse 70% 80% at 50% 40%, rgba(255,140,80,0.10), transparent 70%)' }}
              aria-hidden
            />
            <VirtualAudience engagement={live.engagement} size={roomSize} faceSize={faceSize} />
          </div>
          <p className="mt-3 text-sm text-ink-500">
            They react to how you <em>sound</em> — never to your words.
          </p>
          <div role="group" aria-label="Room size" className="mt-4 grid grid-cols-5 gap-2">
            {ROOM_SIZES.map((s) => {
              const on = s === roomSize
              return (
                <div key={s} className="flex flex-col items-center gap-[7px]">
                  <span className={`led ${on ? 'led-on' : ''}`} aria-hidden />
                  <button
                    onClick={() => setRoomSize(s)}
                    aria-pressed={on}
                    aria-label={ROOM_LABEL[s]}
                    className={`key w-full max-w-[64px] px-0 text-sm font-semibold ${on ? 'key-on' : ''}`}
                  >
                    {s}
                  </button>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-500" aria-hidden>
                    {ROOM_SHORT[s]}
                  </span>
                </div>
              )
            })}
          </div>
        </Module>
      </div>

      {(error || recorder.error) && (
        <div className="mt-4 space-y-3 sm:mt-[22px]">
          {error && <div className="alert-error animate-fade-in">{error}</div>}
          {recorder.error && <div className="alert-warning animate-fade-in">{recorder.error}</div>}
        </div>
      )}

      <Module label="03 · Transport" className="mt-4 sm:mt-[22px]">
        <div className="flex flex-wrap items-center justify-around gap-x-7 gap-y-6">
          <div className="flex w-full max-w-[280px] flex-col items-center gap-2.5">
            <LevelMeter volume={null} />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-500">
              Live while you record
            </span>
          </div>
          <div className="flex flex-col items-center gap-3.5">
            <RecButton onClick={startPractice} disabled={!canRecord} label="Begin a take" />
            <span className="max-w-[240px] text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-500">
              {skipsRitual() ? 'Press to begin recording' : 'Press to begin · breathing warm-up first'}
            </span>
          </div>
          <div className="flex w-full max-w-[280px] flex-col items-center gap-2.5">
            <PaceMeter wpm={null} target={paceTarget} />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-500">
              Sweet spot · {paceTarget[0]}–{paceTarget[1]} wpm
            </span>
          </div>
        </div>
      </Module>

      <Module
        label="04 · What the coach measures"
        aside={
          <Link to="/how-its-scored" className="text-ink-700 underline-offset-4 hover:text-ink-950 hover:underline">
            How it’s scored →
          </Link>
        }
        className="mt-4 sm:mt-[22px]"
      >
        <ul className="grid gap-x-7 sm:grid-cols-2 lg:grid-cols-4">
          {COMPONENTS.map((c) => (
            <li key={c.key} className="flex gap-3 border-t border-ink-900/[0.08] py-3">
              <span className="led mt-[5px]" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 font-mono text-xs uppercase tracking-[0.14em]">
                  <span>{c.label}</span>
                  {config && (
                    <span className="tabular-nums text-ink-600">{Math.round(config.weights[c.key] * 100)}%</span>
                  )}
                </div>
                <p className="mt-1 text-sm leading-snug text-ink-500">{c.blurb}</p>
              </div>
            </li>
          ))}
        </ul>
      </Module>
    </Chassis>
  )
}
