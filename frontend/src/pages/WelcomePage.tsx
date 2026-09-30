// The Hall of Voices — what you see the moment you sign in.
//
// A story-style reel: six speakers, one line each, with a craft note that ties
// what they did to what Cadence measures in you. Then it hands you to the app.
//
// Timing is driven by the clip, not by a timer. Each slide plays a short clip
// of the line being delivered, and that clip's playhead is the slide's clock:
// the progress bar, the word-by-word reveal and the move to the next slide are
// all read from it. Pause the clip and everything pauses; let it buffer and
// everything waits. There is no second clock to drift out of step with the
// voice, so the words on screen cannot disagree with the words you hear.
//
// A slide with no clip — none configured, the file missing, or reduced motion
// asked for — runs the same loop off elapsed time instead.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { QuoteReveal } from '../components/welcome/QuoteReveal'
import { VoiceBackdrop } from '../components/welcome/VoiceBackdrop'
import { LogoMark, Wordmark } from '../components/ui/Logo'
import { useClipDeck } from '../hooks/useClipDeck'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { consumeWelcomePending, readSoundPreference, writeSoundPreference } from '../lib/welcome'
import {
  SLIDE_DURATION_MS,
  USE_ARCHIVE_FOOTAGE,
  VOICES,
  clipFor,
  wordTimes,
  type Voice,
} from '../data/voices'

const OUTRO_SECONDS = 7
// A beat on the last frame once the clip ends, so the line can land before
// the next speaker starts.
const HOLD_SECONDS = 0.9
// A short line still needs long enough on screen for its craft note to be read.
const MIN_SLIDE_SECONDS = 8
// A clip that has not started by now is not going to. Run the slide without it
// rather than leave the reel waiting on a file that is missing or unplayable.
const CLIP_START_TIMEOUT_SECONDS = 4
// Light each word a touch early; the fade-in takes a moment to register.
const WORD_LEAD_SECONDS = 0.08

// opening: the card that asks about sound.  reel: the slides.  outro: the
// closing card that counts down into the app.
type Phase = 'opening' | 'reel' | 'outro'

/** How long a slide runs. `clipLength` is the playing clip's real length, when
 *  there is one; a voice whose clip failed keeps the pacing it was cut to. */
function slideSeconds(voice: Voice, clipLength?: number | null): number {
  const length = clipLength ?? clipFor(voice)?.duration
  return length === undefined
    ? SLIDE_DURATION_MS / 1000
    : Math.max(length + HOLD_SECONDS, MIN_SLIDE_SECONDS)
}

/** "a minute and a half" — for the opening card, which should not promise a
 *  number of seconds that changes every time a clip is re-cut. */
function roughly(seconds: number): string {
  const halves = Math.round(seconds / 30)
  if (halves <= 1) return 'half a minute'
  if (halves === 2) return 'a minute'
  if (halves === 3) return 'a minute and a half'
  return halves % 2 === 0 ? `${halves / 2} minutes` : `${(halves - 1) / 2} and a half minutes`
}

export function WelcomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const still = usePrefersReducedMotion()

  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [failedClips, setFailedClips] = useState<ReadonlySet<string>>(new Set())
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

  // --- Clips ----------------------------------------------------------------
  // Reduced motion means no autoplaying footage at all, only the still stage.
  const footageAllowed = USE_ARCHIVE_FOOTAGE && !still
  const sources = useMemo(
    () =>
      VOICES.map((v) =>
        footageAllowed && !failedClips.has(v.id) ? (clipFor(v)?.src ?? null) : null,
      ),
    [footageAllowed, failedClips],
  )
  const hasClips = sources.some(Boolean)
  const hasClip = sources[index] !== null

  // The opening card exists to ask one question — sound or not — and its tap
  // is also the gesture browsers require before they will play audio. Someone
  // who has answered before goes straight in with their answer; the card
  // comes back only if the browser then refuses to start (see onBlocked).
  const [soundOn, setSoundOn] = useState(() => readSoundPreference() ?? false)
  const [phase, setPhase] = useState<Phase>(() =>
    hasClips && readSoundPreference() === null ? 'opening' : 'reel',
  )

  // Hold everything while the tab is in the background. The slide clock stops
  // there anyway (browsers suspend animation frames), and a clip left talking
  // to nobody would have finished by the time they come back to read it.
  const [tabHidden, setTabHidden] = useState(() => document.hidden)
  useEffect(() => {
    const onChange = () => setTabHidden(document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  const deck = useClipDeck({
    sources,
    index,
    playing: phase === 'reel' && !paused && !tabHidden,
    muted: !soundOn,
    onBlocked: () => {
      // At the very start, ask for the tap after all. Mid-reel, carry on
      // silently instead of stopping the show; the sound control is one tap.
      if (index === 0) setPhase((p) => (p === 'reel' ? 'opening' : p))
      else setSoundOn(false)
    },
    onClipError: (i) => setFailedClips((prev) => new Set(prev).add(VOICES[i].id)),
  })
  const { time: clipTime, duration: clipDuration, ended: clipEnded, prime } = deck
  // A sound-only clip plays on a deck like any other, but there is nothing to
  // look at, so the deck stays hidden and the backdrop remains the picture.
  const footageDeck = clipFor(voice)?.picture ? deck.liveDeck : null
  const footageVisible = footageDeck !== null

  // --- Navigation -----------------------------------------------------------
  const enterApp = useCallback(() => navigate(next, { replace: true }), [navigate, next])

  const advance = useCallback(() => {
    if (index >= VOICES.length - 1) setPhase('outro')
    else setIndex(index + 1)
  }, [index])

  const goBack = useCallback(() => {
    setPhase('reel')
    setCountdown(OUTRO_SECONDS)
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const begin = (withSound: boolean) => {
    // The decks have to be started inside this click, before any re-render,
    // or the browser does not count the tap as permission to play sound.
    prime(withSound, true)
    writeSoundPreference(withSound)
    setSoundOn(withSound)
    setPaused(false)
    setPhase('reel')
  }

  const toggleSound = () => {
    const on = !soundOn
    if (on) prime(true, !paused)
    writeSoundPreference(on)
    setSoundOn(on)
  }

  // --- The slide clock ------------------------------------------------------
  // How many words of the current quote have been spoken. Tagged with the
  // slide it belongs to, so a new slide never renders one frame lit to the
  // previous slide's count.
  const [spoken, setSpoken] = useState({ index: 0, count: 0 })
  const spokenCount = spoken.index === index ? spoken.count : 0
  const times = useMemo(() => wordTimes(voice), [voice])
  const progressRef = useRef<HTMLSpanElement | null>(null)

  const pausedRef = useRef(paused)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    // Reduced motion: nothing moves and nothing advances by itself. The reel
    // waits for a click, which is the point.
    if (phase !== 'reel' || still) return

    let elapsed = 0 // a clipless slide's own clock
    let held = 0 // time on the last frame after the clip ended
    let waited = 0 // time spent waiting for the clip to start
    let shown = -1
    let done = false
    let last = performance.now()
    let frame = 0

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      // Clamped so a tab coming back from the background does not count the
      // whole absence as one enormous frame.
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (pausedRef.current || done) return

      let t: number
      let total: number
      if (hasClip) {
        const playhead = clipTime()
        if (playhead === null) {
          waited += dt
          if (waited > CLIP_START_TIMEOUT_SECONDS) {
            done = true
            setFailedClips((prev) => new Set(prev).add(voice.id))
          }
          return
        }
        const length = clipDuration() ?? clipFor(voice)?.duration ?? playhead
        total = slideSeconds(voice, length)
        if (clipEnded()) {
          held += dt
          t = length + held
        } else {
          t = playhead
        }
      } else {
        elapsed += dt
        t = elapsed
        total = slideSeconds(voice)
      }

      // Written straight to the element: sixty state updates a second to move
      // one bar would re-render the whole page for nothing.
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${Math.min(1, t / total)})`
      }

      let count = 0
      while (count < times.length && times[count] <= t + WORD_LEAD_SECONDS) count++
      if (count !== shown) {
        shown = count
        setSpoken({ index, count })
      }

      if (t >= total) {
        done = true
        advance()
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [phase, still, index, voice, hasClip, times, clipTime, clipDuration, clipEnded, advance])

  // Outro countdown — visible, so nobody is surprised by the page moving.
  useEffect(() => {
    if (phase !== 'outro') return
    if (countdown <= 0) {
      enterApp()
      return
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [phase, countdown, enterApp])

  // --- Keyboard -------------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        enterApp()
        return
      }
      // On the opening card the two buttons own Enter and Space.
      if (phase === 'opening') return
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
        case 'Enter':
          if (phase === 'outro') enterApp()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, goBack, enterApp, phase])

  const greeting = user?.name?.split(' ')[0] ?? 'speaker'
  const reelLength = VOICES.reduce((sum, v) => sum + slideSeconds(v), 0)

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950 text-white">
      {/* --- Media stack -------------------------------------------------- */}
      <div className="absolute inset-0" aria-hidden>
        <VoiceBackdrop voice={voice} index={index} />

        {/* The two decks. A deck is shown only once its clip is confirmed
            playing for this slide; until then the backdrop is the picture.
            <video> even for the sound-only clips: it plays them just the
            same, and one kind of element means one code path. */}
        {footageAllowed &&
          deck.decks.map((props, i) => (
            <video
              key={i}
              {...props}
              playsInline
              preload="auto"
              tabIndex={-1}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
                footageDeck === i ? 'opacity-100' : 'opacity-0'
              }`}
            />
          ))}

        {/* Scrim over the footage so the type keeps its contrast. Tied to
            footage that is genuinely on screen — over the generated backdrop
            it would just be a second, pointless layer of dark. */}
        <div
          className={`absolute inset-0 transition-opacity duration-700 ${
            footageVisible ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            background: `linear-gradient(105deg, rgba(6,8,22,0.93) 0%, rgba(6,8,22,0.72) 45%, rgba(6,8,22,0.45) 100%),
                         radial-gradient(90% 80% at 50% 50%, transparent 35%, rgba(6,8,22,0.8) 100%)`,
          }}
        />
      </div>

      {/* Letterbox bars — the cinema cue. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-14 bg-gradient-to-b from-ink-950/90 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-24 bg-gradient-to-t from-ink-950/90 to-transparent" aria-hidden />

      {/* --- Chrome ------------------------------------------------------- */}
      <header className="relative z-40 mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 pt-5 sm:px-8">
        <Wordmark tone="light" size={32} />
        <div className="flex items-center gap-2">
          {/* Always here while the reel runs, in the same place on every
              slide — a control that comes and goes cannot be found twice. */}
          {phase === 'reel' && hasClips && (
            <button
              onClick={toggleSound}
              aria-pressed={soundOn}
              className="btn bg-white/10 px-4 py-2 text-white ring-1 ring-white/20 backdrop-blur hover:bg-white/20"
            >
              <span aria-hidden>{soundOn && hasClip ? '🔊' : '🔇'}</span>
              {!hasClip ? 'No sound here' : soundOn ? 'Sound on' : 'Sound off'}
            </button>
          )}
          <button onClick={enterApp} className="btn bg-white/10 px-4 py-2 text-white ring-1 ring-white/20 backdrop-blur hover:bg-white/20">
            Skip intro
            <span aria-hidden>→</span>
          </button>
        </div>
      </header>

      {/* Segmented progress — one bar per voice. */}
      <div className="relative z-40 mx-auto mt-5 flex max-w-6xl gap-1.5 px-5 sm:px-8" role="presentation">
        {VOICES.map((v, i) => (
          <div key={v.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
            {i < index || phase === 'outro' ? (
              <span className="block h-full w-full bg-white" />
            ) : i === index ? (
              <span
                // Remounted per slide so each bar starts empty. Its width is
                // written by the slide clock, not animated by CSS. When motion
                // is reduced there is no clock, so the bar simply shows full.
                key={`${v.id}-fill`}
                ref={progressRef}
                className="block h-full w-full origin-left bg-white"
                style={still ? undefined : { transform: 'scaleX(0)' }}
              />
            ) : null}
          </div>
        ))}
      </div>

      {/* --- The slide ---------------------------------------------------- */}
      {phase === 'opening' ? (
        <main className="relative z-30 mx-auto flex min-h-[calc(100vh-9rem)] max-w-3xl flex-col items-center justify-center px-5 text-center sm:px-8">
          <p className="animate-fade-in text-[11px] font-bold uppercase tracking-[0.22em] text-white/45">
            The Hall of Voices
          </p>
          <h1 className="animate-fade-up mt-5 font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl" style={{ animationDelay: '0.1s' }}>
            Hear how the greats
            <br />
            <span className="bg-gradient-to-r from-brand-300 via-accent-300 to-brand-200 bg-clip-text text-transparent">
              actually said it.
            </span>
          </h1>
          <p className="animate-fade-up mt-5 max-w-md text-base leading-relaxed text-white/60" style={{ animationDelay: '0.2s' }}>
            {VOICES.length} speakers, one line each, in their own voices. About {roughly(reelLength)}.
          </p>
          <div className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: '0.3s' }}>
            <button onClick={() => begin(true)} autoFocus className="btn-primary px-9 py-3.5 text-base">
              <span aria-hidden>🔊</span>
              Begin with sound
            </button>
            <button
              onClick={() => begin(false)}
              className="btn bg-white/10 px-6 py-3.5 text-base text-white ring-1 ring-white/20 backdrop-blur hover:bg-white/20"
            >
              Begin without sound
            </button>
          </div>
        </main>
      ) : phase === 'reel' ? (
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
              spoken={spokenCount}
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
      {phase === 'reel' && (
        <div className="relative z-40 mx-auto flex max-w-6xl items-center gap-2 px-5 pb-7 sm:px-8">
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
            onClick={advance}
            aria-label="Next voice"
            className="btn h-10 w-10 bg-white/10 p-0 text-white ring-1 ring-white/20 backdrop-blur hover:bg-white/20"
          >
            <span aria-hidden>›</span>
          </button>
        </div>
      )}
    </div>
  )
}
