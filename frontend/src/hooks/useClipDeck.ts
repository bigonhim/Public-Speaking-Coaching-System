// Two <video> elements playing the reel's clips in turn, like a pair of decks.
//
// Why two rather than one that swaps its `src`, or one per slide:
//   * While a clip plays on one deck, the next is already buffered on the
//     other. Changing slide is then a `play()` on something that is ready, not
//     a fetch — which is the difference between a cut and a gap.
//   * Both elements exist from the first render, so the one tap on the opening
//     card can start them both. Safari only lets an element play with sound if
//     a user gesture started *that element*; decks created later, slide by
//     slide, would each be refused.
//
// Slide `i` always plays on deck `i % 2`, so stepping forwards or backwards
// lands on the deck that is not currently on screen.
//
// The hook owns playback and nothing else. It reports what is genuinely
// playing and where its playhead is; the page decides what that means for the
// slide. A decorative clip is never worth an error, so every failure here
// degrades to "no clip for this slide".

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'

// How long the outgoing clip's audio takes to duck when a slide is cut short.
// Clips that play to the end carry their own fade, so this is for skips.
const DUCK_MS = 180
// The outgoing deck is still fading out on screen for a moment after the cut.
// Loading the next clip into it any sooner would swap the picture mid-fade.
const RELOAD_DELAY_MS = 800

type Deck = 0 | 1

interface Options {
  /** One entry per slide: the clip to play, or null for a slide with none. */
  sources: readonly (string | null)[]
  index: number
  /** False while the reel is paused, or waiting on the opening card. */
  playing: boolean
  muted: boolean
  /** The browser refused to start playback without a user gesture. */
  onBlocked?: () => void
  /** The clip for this slide cannot be played. */
  onClipError?: (index: number) => void
}

interface DeckProps {
  ref: (el: HTMLVideoElement | null) => void
  onPlaying: (e: SyntheticEvent<HTMLVideoElement>) => void
  onError: (e: SyntheticEvent<HTMLVideoElement>) => void
}

export interface ClipDeck {
  /** Spread one onto each of the two <video> elements. */
  decks: readonly [DeckProps, DeckProps]
  /** The deck whose clip is confirmed on screen for the current slide, or
   *  null while it is still starting. Reveal footage on this and nothing
   *  earlier: a deck that is merely loaded paints a black rectangle. */
  liveDeck: Deck | null
  /** Playhead of the current slide's clip in seconds; null until it starts. */
  time: () => number | null
  /** The clip's real length once known. */
  duration: () => number | null
  /** True once the current slide's clip has played to its end. */
  ended: () => boolean
  /** Call from inside a click or key handler, before changing any state. It
   *  starts both decks within the gesture, which is what permits sound.
   *  `start` says whether the current clip should be left running. */
  prime: (withSound: boolean, start: boolean) => void
}

function load(el: HTMLVideoElement, clip: string | null): boolean {
  if ((el.dataset.clip ?? '') === (clip ?? '')) return false
  el.dataset.clip = clip ?? ''
  if (clip) el.src = clip
  else el.removeAttribute('src')
  el.load()
  return true
}

export function useClipDeck({
  sources,
  index,
  playing,
  muted,
  onBlocked,
  onClipError,
}: Options): ClipDeck {
  const els = useRef<[HTMLVideoElement | null, HTMLVideoElement | null]>([null, null])
  const [liveIndex, setLiveIndex] = useState<number | null>(null)
  // Mirrors liveIndex for the playhead readers, which are called from an
  // animation frame and must not wait for a render to see a clip start.
  const liveRef = useRef<number | null>(null)

  // Media events and the gesture handler fire outside React's render cycle, so
  // they read the current props from here rather than from a stale closure.
  const latest = useRef({ sources, index, playing, muted, onBlocked, onClipError })
  useEffect(() => {
    latest.current = { sources, index, playing, muted, onBlocked, onClipError }
  })

  const deck = (index % 2) as Deck
  const src = sources[index] ?? null
  const nextSrc = sources[index + 1] ?? null

  const start = useCallback((el: HTMLVideoElement) => {
    // play() on a finished clip would restart it under a slide that is
    // already holding on its last word.
    if (el.ended) return
    el.muted = latest.current.muted
    el.volume = 1
    el.play()?.catch((err: unknown) => {
      // AbortError just means a pause or a new clip overtook this play().
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        latest.current.onBlocked?.()
      }
    })
  }, [])

  // The slide changed: cue its clip on this deck and duck the other one.
  useEffect(() => {
    const el = els.current[deck]
    const other = els.current[1 - deck]
    liveRef.current = null
    setLiveIndex(null)

    let duck = 0
    if (other && !other.paused) {
      const from = other.volume
      const began = performance.now()
      const step = () => {
        // Read the clock here rather than trusting the frame's timestamp,
        // which marks when the frame began and can predate `began`. A
        // negative step would push the volume past 1, which throws — and a
        // throw here leaves the old clip playing over the new one.
        const k = Math.min(1, Math.max(0, (performance.now() - began) / DUCK_MS))
        other.volume = from * (1 - k)
        if (k < 1) duck = requestAnimationFrame(step)
        else other.pause()
      }
      duck = requestAnimationFrame(step)
    }

    if (el) {
      const swapped = load(el, src)
      if (src) {
        if (!swapped) {
          if (el.error) {
            // It failed while it was preloading, so no new event is coming.
            latest.current.onClipError?.(index)
          } else {
            el.currentTime = 0
          }
        }
        if (latest.current.playing) start(el)
      }
    }
    return () => cancelAnimationFrame(duck)
  }, [deck, index, src, start])

  // Buffer the following clip on the deck that has just left the screen.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const other = els.current[1 - deck]
      if (other) {
        other.pause()
        load(other, nextSrc)
      }
    }, RELOAD_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [deck, index, nextSrc])

  useEffect(() => {
    const el = els.current[deck]
    if (!el || !el.dataset.clip) return
    if (playing) start(el)
    else el.pause()
  }, [playing, deck, start])

  useEffect(() => {
    for (const el of els.current) if (el) el.muted = muted
    // If sound was switched off because the browser refused to play with it,
    // the clip is sitting there refused. Now that it is muted, try again.
    const el = els.current[deck]
    if (latest.current.playing && el?.dataset.clip && el.paused) start(el)
  }, [muted, deck, start])

  const isCurrent = (el: HTMLVideoElement) => {
    const now = latest.current
    return el === els.current[now.index % 2] && el.dataset.clip === now.sources[now.index]
  }

  const onPlaying = useCallback((e: SyntheticEvent<HTMLVideoElement>) => {
    if (!isCurrent(e.currentTarget)) return
    liveRef.current = latest.current.index
    setLiveIndex(latest.current.index)
  }, [])

  const onError = useCallback((e: SyntheticEvent<HTMLVideoElement>) => {
    // A clip failing on the standby deck is dealt with when its slide comes up.
    if (isCurrent(e.currentTarget)) latest.current.onClipError?.(latest.current.index)
  }, [])

  // Leaving the page mid-clip must not leave it talking. Browsers are meant
  // to pause a media element once it is out of the document, but "meant to"
  // is thin cover for audio that outlives the screen it belonged to.
  const setDeck0 = useCallback((el: HTMLVideoElement | null) => {
    if (!el) els.current[0]?.pause()
    els.current[0] = el
  }, [])
  const setDeck1 = useCallback((el: HTMLVideoElement | null) => {
    if (!el) els.current[1]?.pause()
    els.current[1] = el
  }, [])

  const current = useCallback(() => {
    const now = latest.current
    return liveRef.current === now.index ? els.current[now.index % 2] : null
  }, [])

  const time = useCallback(() => current()?.currentTime ?? null, [current])
  const ended = useCallback(() => current()?.ended ?? false, [current])
  const duration = useCallback(() => {
    const length = current()?.duration
    return length !== undefined && Number.isFinite(length) ? length : null
  }, [current])

  const prime = useCallback((withSound: boolean, startCurrent: boolean) => {
    const active = latest.current.index % 2
    els.current.forEach((el, i) => {
      if (!el) return
      el.muted = !withSound
      const keepRunning = i === active && startCurrent && Boolean(el.dataset.clip)
      if (keepRunning && el.ended) return
      const attempt = el.play()
      if (!keepRunning) el.pause()
      attempt?.catch(() => {
        /* interrupted by the pause above, or nothing loaded on this deck yet */
      })
    })
  }, [])

  return {
    decks: [
      { ref: setDeck0, onPlaying, onError },
      { ref: setDeck1, onPlaying, onError },
    ],
    liveDeck: liveIndex === index ? deck : null,
    time,
    duration,
    ended,
    prime,
  }
}
