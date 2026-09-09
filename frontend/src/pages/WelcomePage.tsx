// The Hall of Voices — what you see the moment you sign in.
//
// A story-style reel: six speakers, one line each, with a craft note that ties
// what they did to what Cadence measures in you. Then it hands you to the app.
//
// Timing is driven by the CSS animation on the progress bar, not a timer: the
// `animationend` event *is* the advance signal. That means pausing the bar
// pauses the reel exactly, with no clock to keep in sync, and the thing you see
// can never disagree with the thing that is counting.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { QuoteReveal } from '../components/welcome/QuoteReveal'
import { VoiceBackdrop } from '../components/welcome/VoiceBackdrop'
import { LogoMark, Wordmark } from '../components/ui/Logo'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { consumeWelcomePending } from '../lib/welcome'
import { SLIDE_DURATION_MS, USE_ARCHIVE_FOOTAGE, VOICES } from '../data/voices'

const OUTRO_SECONDS = 7

export function WelcomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const still = usePrefersReducedMotion()

  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [finished, setFinished] = useState(false)
  const [failedVideos, setFailedVideos] = useState<ReadonlySet<string>>(new Set())
  const [countdown, setCountdown] = useState(OUTRO_SECONDS)

  // Where to go when the reel ends — wherever the guard was originally taking
  // them, falling back to the dashboard.
  const next = (location.state as { next?: string } | null)?.next ?? '/'

  // Clearing the flag is a side effect, so it belongs in an effect rather than
  // in a useMemo — StrictMode double-invokes render, and the second pass would
  // read back the value the first pass had already consumed.
  const [justSignedIn, setJustSignedIn] = useState(false)
  const flagRead = useRef(false)
  useEffect(() => {
    if (flagRead.current) return
    flagRead.current = true
    setJustSignedIn(consumeWelcomePending())
  }, [])

  const voice = VOICES[index]
  const isLast = index === VOICES.length - 1

  // --- Media selection ------------------------------------------------------
  // Reduced motion means no autoplaying footage at all, only the still stage.
  const footageAllowed = USE_ARCHIVE_FOOTAGE && !still
  const localSrc = footageAllowed ? (voice.videoSrc ?? null) : null
  const youtubeId =
    footageAllowed && !localSrc && voice.youtubeId && !failedVideos.has(voice.youtubeId)
      ? voice.youtubeId
      : null

  const onVideoError = useCallback((videoId: string) => {
    // That clip is gone, blocked, or never started. Remember it so we do not
    // try again on a replay, and let this slide fall through to the backdrop.
    setFailedVideos((prev) => new Set(prev).add(videoId))
  }, [])

  const anyYoutube = useMemo(
    () => footageAllowed && VOICES.some((v) => v.youtubeId && !v.videoSrc),
    [footageAllowed],
  )
  const player = useYouTubePlayer({ enabled: anyYoutube, onVideoError })
  const { show, setMuted, pause: pausePlayer, resume: resumePlayer } = player

  useEffect(() => {
    if (!youtubeId) {
      pausePlayer()
      return
    }
    show(youtubeId, voice.startSeconds ?? 0)
  }, [youtubeId, voice.startSeconds, show, pausePlayer])

  // Is there footage genuinely on screen right now? Only a clip confirmed
  // *playing* counts. Revealing on "the player exists" paints a black
  // rectangle over the designed backdrop every time a clip buffers, and leaves
  // it there for the whole slide whenever one silently refuses to start.
  const [localPlaying, setLocalPlaying] = useState(false)
  useEffect(() => {
    setLocalPlaying(false)
  }, [localSrc])
  // The `youtubeId !== null` guard is load-bearing: on a slide with no clip
  // both sides are null, and `null === null` would report footage as visible
  // over the generated backdrop.
  const footageVisible = localSrc
    ? localPlaying
    : youtubeId !== null && player.playingId === youtubeId

  // Sound is offered only where the clip's audio is known to match the line on
  // screen (see data/voices.ts). Hearing a different sentence from the one you
  // are reading is worse than hearing nothing at all.
  const soundOffered = footageVisible && (voice.soundSafe ?? false)
  const soundActive = soundOn && soundOffered

  useEffect(() => {
    setMuted(!soundActive)
  }, [soundActive, setMuted])

  // React applies `muted` as a property, which can land *after* the browser has
  // already judged an autoplaying <video> ineligible — so set it imperatively.
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    const el = localVideoRef.current
    if (el) el.muted = !soundActive
  }, [soundActive, localSrc])

  useEffect(() => {
    if (paused || finished) pausePlayer()
    else if (youtubeId) resumePlayer()
  }, [paused, finished, youtubeId, pausePlayer, resumePlayer])

  // Pause/resume the self-hosted clip with the reel, so the footage can never
  // run on past a paused slide.
  useEffect(() => {
    const el = localVideoRef.current
    if (!el) return
    if (paused || finished) el.pause()
    else void el.play().catch(() => setLocalPlaying(false))
  }, [paused, finished, localSrc])

  // --- Navigation -----------------------------------------------------------
  const enterApp = useCallback(() => navigate(next, { replace: true }), [navigate, next])

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i >= VOICES.length - 1) {
        setFinished(true)
        return i
      }
      return i + 1
    })
  }, [])

  const goBack = useCallback(() => {
    setFinished(false)
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  // Outro countdown — visible, so nobody is surprised by the page moving.
  useEffect(() => {
    if (!finished) return
    if (countdown <= 0) {
      enterApp()
      return
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [finished, countdown, enterApp])

  // --- Keyboard -------------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          advance()
          break
        case 'ArrowLeft':
          e.preventDefault()
          goBack()
          break
        case ' ':
          e.preventDefault()
          setPaused((p) => !p)
          break
        case 'Escape':
          e.preventDefault()
          enterApp()
          break
        case 'Enter':
          if (finished) enterApp()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, goBack, enterApp, finished])

  const greeting = user?.name?.split(' ')[0] ?? 'speaker'

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950 text-white">
      {/* --- Media stack -------------------------------------------------- */}
      <div className="absolute inset-0" aria-hidden>
        <VoiceBackdrop voice={voice} index={index} />

        {/* Self-hosted clip, when one is configured. */}
        {localSrc && (
          <video
            key={localSrc}
            ref={localVideoRef}
            src={localSrc}
            autoPlay
            muted
            loop
            playsInline
            onLoadedMetadata={(e) => {
              const start = voice.startSeconds ?? 0
              if (start > 0) e.currentTarget.currentTime = start
            }}
            onPlaying={() => setLocalPlaying(true)}
            onError={() => setLocalPlaying(false)}
            onStalled={() => setLocalPlaying(false)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              localPlaying ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* One YouTube player for the whole reel, sized to cover the viewport
            the way object-fit would. Hidden rather than unmounted between
            slides so swapping clips never costs a reload. */}
        {anyYoutube && (
          <div
            className={`yt-cover pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-700 ${
              !localSrc && footageVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* Scaled well past "cover" on purpose. controls=0 hides the
                scrubber but not YouTube's title bar, watermark and end-card
                suggestions, which have no API to switch off — overscaling
                pushes all of that outside the frame. The clip is wallpaper
                here, so cropping it costs nothing. */}
            <div
              ref={player.containerRef}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-[1.45]"
              style={{
                width: '100vw',
                height: '56.25vw',
                minHeight: '100vh',
                minWidth: '177.78vh',
              }}
            />
          </div>
        )}

        {/* Scrim over the footage so the type keeps its contrast. Tied to
            footage that is genuinely on screen — over the generated backdrop
            it would just be a second, pointless layer of dark. */}
        {footageVisible && (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(105deg, rgba(6,8,22,0.93) 0%, rgba(6,8,22,0.72) 45%, rgba(6,8,22,0.45) 100%),
                           radial-gradient(90% 80% at 50% 50%, transparent 35%, rgba(6,8,22,0.8) 100%)`,
            }}
          />
        )}
      </div>

      {/* Letterbox bars — the cinema cue. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-14 bg-gradient-to-b from-ink-950/90 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-24 bg-gradient-to-t from-ink-950/90 to-transparent" aria-hidden />

      {/* --- Chrome ------------------------------------------------------- */}
      <header className="relative z-40 mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 pt-5 sm:px-8">
        <Wordmark tone="light" size={32} />
        <button onClick={enterApp} className="btn bg-white/10 px-4 py-2 text-white ring-1 ring-white/20 backdrop-blur hover:bg-white/20">
          Skip intro
          <span aria-hidden>→</span>
        </button>
      </header>

      {/* Segmented progress — one bar per voice. */}
      <div className="relative z-40 mx-auto mt-5 flex max-w-6xl gap-1.5 px-5 sm:px-8" role="presentation">
        {VOICES.map((v, i) => (
          <div key={v.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
            {i < index || finished ? (
              <span className="block h-full w-full bg-white" />
            ) : i === index ? (
              <span
                // Remount per slide so the animation restarts. When motion is
                // reduced there is no animation and therefore no auto-advance —
                // the reel waits for a click, which is the point.
                key={`${v.id}-fill`}
                className={`block h-full w-full origin-left bg-white ${
                  still ? '' : 'animate-progress-fill'
                }`}
                style={{
                  animationDuration: `${SLIDE_DURATION_MS}ms`,
                  animationPlayState: paused ? 'paused' : 'running',
                }}
                onAnimationEnd={advance}
              />
            ) : null}
          </div>
        ))}
      </div>

      {/* --- The slide ---------------------------------------------------- */}
      {!finished ? (
        <main
          key={voice.id}
          className="relative z-30 mx-auto flex min-h-[calc(100vh-9rem)] max-w-6xl flex-col justify-center px-5 py-10 sm:px-8"
        >
          <p className="animate-fade-in text-[11px] font-bold uppercase tracking-[0.22em] text-white/45">
            {String(index + 1).padStart(2, '0')} — {voice.place} · {voice.year}
          </p>

          <blockquote className="mt-5 max-w-4xl">
            <QuoteReveal
              text={voice.quote}
              className="font-display text-[1.75rem] font-bold leading-[1.18] tracking-tight
                         sm:text-4xl md:text-[2.9rem] lg:text-[3.4rem]"
            />
          </blockquote>

          <div className="animate-fade-up mt-8 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ animationDelay: '0.5s' }}>
            <span className="h-10 w-1 rounded-full" style={{ background: voice.accent }} aria-hidden />
            <div>
              <p className="font-display text-lg font-bold sm:text-xl">{voice.speaker}</p>
              <p className="text-sm text-white/50">{voice.occasion}</p>
            </div>
          </div>

          {/* The craft note: the reason this reel exists rather than a montage. */}
          <div
            className="animate-fade-up mt-9 max-w-xl rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/10 backdrop-blur-sm"
            style={{ animationDelay: '0.75s' }}
          >
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: voice.accent }}>
              <LogoMark size={16} /> {voice.craft.technique}
            </p>
            <p className="mt-2.5 text-[15px] leading-relaxed text-white/75">{voice.craft.note}</p>
          </div>
        </main>
      ) : (
        <main className="relative z-30 mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl flex-col items-center justify-center px-5 text-center sm:px-8">
          <div className="animate-fade-up">
            <LogoMark size={64} animated />
          </div>
          <h1 className="animate-fade-up mt-7 font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl" style={{ animationDelay: '0.1s' }}>
            {user?.is_new ? (
              <>
                Your stage is ready,
                <br />
                <span className="bg-gradient-to-r from-brand-300 via-accent-300 to-brand-200 bg-clip-text text-transparent">
                  {greeting}.
                </span>
              </>
            ) : (
              <>
                {justSignedIn ? 'Welcome back,' : 'Back to it,'}
                <br />
                <span className="bg-gradient-to-r from-brand-300 via-accent-300 to-brand-200 bg-clip-text text-transparent">
                  {greeting}.
                </span>
              </>
            )}
          </h1>
          <p className="animate-fade-up mt-5 max-w-md text-base leading-relaxed text-white/60" style={{ animationDelay: '0.2s' }}>
            Every one of them practised. Pace, pauses, the words they left out — all of
            it learned. Let's go measure yours.
          </p>
          <button
            onClick={enterApp}
            autoFocus
            className="btn-primary animate-fade-up mt-9 px-9 py-3.5 text-base"
            style={{ animationDelay: '0.3s' }}
          >
            Enter the stage
            <span aria-hidden>→</span>
          </button>
          <p className="mt-5 text-xs text-white/35" aria-live="polite">
            Taking you in {countdown}…
          </p>
        </main>
      )}

      {/* --- Controls ----------------------------------------------------- */}
      {!finished && (
        <div className="relative z-40 mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 pb-7 sm:px-8">
          <div className="flex items-center gap-2">
            <button
              onClick={goBack}
              disabled={index === 0}
              aria-label="Previous voice"
              className="btn h-10 w-10 bg-white/10 p-0 text-white ring-1 ring-white/20 backdrop-blur hover:bg-white/20 disabled:opacity-30"
            >
              <span aria-hidden>‹</span>
            </button>
            {!still && (
              <button
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? 'Resume' : 'Pause'}
                aria-pressed={paused}
                className="btn h-10 w-10 bg-white/10 p-0 text-white ring-1 ring-white/20 backdrop-blur hover:bg-white/20"
              >
                <span aria-hidden>{paused ? '▶' : '❚❚'}</span>
              </button>
            )}
            <button
              onClick={isLast ? () => setFinished(true) : advance}
              aria-label="Next voice"
              className="btn h-10 w-10 bg-white/10 p-0 text-white ring-1 ring-white/20 backdrop-blur hover:bg-white/20"
            >
              <span aria-hidden>›</span>
            </button>
          </div>

          {/* Only offer sound when footage is genuinely playing *and* its
              audio is known to carry the line on screen — see data/voices.ts. */}
          {soundOffered && (
            <button
              onClick={() => setSoundOn((s) => !s)}
              aria-pressed={soundActive}
              className="btn bg-white/10 px-4 py-2 text-white ring-1 ring-white/20 backdrop-blur hover:bg-white/20"
            >
              <span aria-hidden>{soundActive ? '🔊' : '🔇'}</span>
              {soundActive ? 'Sound on' : 'Turn on sound'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
