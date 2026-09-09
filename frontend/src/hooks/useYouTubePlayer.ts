// A single YouTube IFrame player, reused across every slide in the reel.
//
// Why the IFrame API rather than a plain <iframe src="...?autoplay=1">:
//   * onError tells us when a clip has been removed, made private, or has
//     embedding disabled — so that slide can fall back to the generated
//     backdrop instead of showing YouTube's grey "unavailable" card.
//   * onStateChange tells us when a clip is *actually playing*. That is the
//     only honest cue to reveal footage: "ready" only means the player object
//     exists, and revealing on it paints a black rectangle over the designed
//     backdrop for every buffering clip and every silent failure.
//   * mute/unMute is scriptable, which is the only way to offer a working
//     "turn sound on" button (autoplay with sound is blocked everywhere).
//   * one player that swaps videos beats mounting six iframes.
//
// Playback happens on youtube-nocookie.com. The API script itself must come
// from www.youtube.com — that part is not configurable.

import { useCallback, useEffect, useRef, useState } from 'react'

const API_SRC = 'https://www.youtube.com/iframe_api'
const PLAYER_HOST = 'https://www.youtube-nocookie.com'
// If the API has not called back by now, assume it is blocked (extension,
// firewall, offline) and commit to the fallback rather than showing a hole.
const API_TIMEOUT_MS = 6000
// A clip that has not reached PLAYING by now is not going to. Region blocks,
// "playback on other sites disabled" and a refused autoplay can all leave the
// player sitting on UNSTARTED forever *without* ever firing onError, so a
// watchdog is the only way to notice. Without it those slides show a black
// frame for their whole nine seconds.
const CLIP_START_TIMEOUT_MS = 5000

// YT.PlayerState values, inlined so we never touch the global before it loads.
const STATE_ENDED = 0
const STATE_PLAYING = 1

interface YTVideoData {
  video_id?: string
}

interface YTPlayer {
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  mute(): void
  unMute(): void
  setVolume(volume: number): void
  getVideoData?(): YTVideoData | undefined
  destroy(): void
}

interface YTPlayerEvent {
  target: YTPlayer
  data: number
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    options: {
      host?: string
      videoId?: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (e: YTPlayerEvent) => void
        onError?: (e: YTPlayerEvent) => void
        onStateChange?: (e: YTPlayerEvent) => void
      }
    },
  ) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<void> | null = null

function loadIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise

  apiPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('YouTube API timed out')), API_TIMEOUT_MS)
    // Chain rather than clobber: the API only ever calls this one global, so
    // stomping on an existing handler would break whoever set it.
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer)
      previous?.()
      resolve()
    }
    // The API fires that global exactly once per document. Appending a second
    // <script> after a timed-out first attempt therefore guarantees a *second*
    // timeout — so only ever inject the tag once and re-wait on the callback.
    if (document.querySelector(`script[src="${API_SRC}"]`)) return

    const script = document.createElement('script')
    script.src = API_SRC
    script.async = true
    script.onerror = () => {
      clearTimeout(timer)
      reject(new Error('YouTube API failed to load'))
    }
    document.head.appendChild(script)
  })

  // Let a later mount try again instead of inheriting a permanent failure.
  apiPromise.catch(() => {
    apiPromise = null
  })
  return apiPromise
}

export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

interface Options {
  /** Set false to skip loading YouTube entirely (reduced motion, or the
   *  typography-only reel). */
  enabled: boolean
  /** Called with the video id when that specific clip cannot be played. */
  onVideoError?: (videoId: string) => void
}

export interface YouTubeController {
  status: PlayerStatus
  /** The clip currently *confirmed playing*, or null. Gate revealing the
   *  footage on this rather than on `status`: "ready" stays true forever after
   *  the first clip, so it cannot tell a playing clip from a dead one. */
  playingId: string | null
  /** Attach to the element the player should fill. */
  containerRef: React.RefObject<HTMLDivElement | null>
  show: (videoId: string, startSeconds?: number) => void
  setMuted: (muted: boolean) => void
  pause: () => void
  resume: () => void
}

export function useYouTubePlayer({ enabled, onVideoError }: Options): YouTubeController {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [playingId, setPlayingId] = useState<string | null>(null)

  // `new YT.Player()` hands back an object immediately, but it does not gain
  // loadVideoById/mute/playVideo until the API fires onReady — calling one
  // before then throws "not a function". So readiness is tracked explicitly and
  // the outstanding request is replayed in onReady.
  const readyRef = useRef(false)
  // The clip we most recently asked for. Also the replay buffer for onReady.
  const requestRef = useRef<{ videoId: string; startSeconds: number } | null>(null)
  const mutedRef = useRef(true)
  const wantPlayingRef = useRef(true)
  const watchdogRef = useRef<number | null>(null)

  /** Call into the player only when it can actually answer.
   *
   *  Wrapped because this is a third-party API inside a React effect: an
   *  unhandled throw here would unmount the entire app to a blank page, and a
   *  decorative background video is never worth that. Losing the footage and
   *  keeping the generated backdrop is the right failure. */
  // Empty deps are correct: this reads only refs, never props or state.
  const withPlayer = useCallback((fn: (player: YTPlayer) => void): void => {
    const player = playerRef.current
    if (!player || !readyRef.current) return
    try {
      fn(player)
    } catch {
      /* player torn down mid-call, or the API changed under us */
    }
  }, [])

  // Held in a ref so changing the callback never tears down the player.
  const onVideoErrorRef = useRef(onVideoError)
  useEffect(() => {
    onVideoErrorRef.current = onVideoError
  }, [onVideoError])

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current)
      watchdogRef.current = null
    }
  }, [])

  /** Give up on one clip and let the caller fall back for that slide only. */
  const failClip = useCallback(
    (videoId: string) => {
      clearWatchdog()
      // Ignore a late failure for a clip we have already moved on from —
      // otherwise a slow error from slide N blacklists slide N+1's *working*
      // video and the reel loses a clip that was never broken.
      if (requestRef.current?.videoId !== videoId) return
      setPlayingId((current) => (current === videoId ? null : current))
      onVideoErrorRef.current?.(videoId)
    },
    [clearWatchdog],
  )

  const armWatchdog = useCallback(
    (videoId: string) => {
      clearWatchdog()
      watchdogRef.current = window.setTimeout(
        () => failClip(videoId),
        CLIP_START_TIMEOUT_MS,
      )
    },
    [clearWatchdog, failClip],
  )

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      return
    }
    const host = containerRef.current
    if (!host) return

    let cancelled = false
    setStatus('loading')

    // The API replaces this element with the iframe, so give it a throwaway
    // child rather than the ref'd container itself.
    const mount = document.createElement('div')
    mount.style.width = '100%'
    mount.style.height = '100%'
    host.appendChild(mount)

    loadIframeApi()
      .then(() => {
        if (cancelled || !window.YT?.Player) return
        playerRef.current = new window.YT.Player(mount, {
          host: PLAYER_HOST,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3, // no annotations
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            mute: 1, // required for autoplay to be allowed at all
          },
          events: {
            onReady: (e) => {
              if (cancelled) return
              readyRef.current = true
              setStatus('ready')
              try {
                if (mutedRef.current) {
                  e.target.mute()
                } else {
                  e.target.unMute()
                  e.target.setVolume(70)
                }
                // Replay whatever was asked for while we were still loading.
                const pending = requestRef.current
                if (pending) {
                  e.target.loadVideoById(pending)
                  armWatchdog(pending.videoId)
                }
                if (!wantPlayingRef.current) e.target.pauseVideo()
              } catch {
                /* fall through to the generated backdrop */
              }
            },
            onStateChange: (e) => {
              if (cancelled) return
              const pending = requestRef.current
              if (!pending) return

              if (e.data === STATE_PLAYING) {
                // Trust the player over our own bookkeeping about *what* is
                // playing, but ignore the event if it belongs to a clip we
                // have already navigated away from.
                let actual: string | undefined
                try {
                  actual = e.target.getVideoData?.()?.video_id
                } catch {
                  /* older API surface — fall back to what we asked for */
                }
                const id = actual || pending.videoId
                if (id !== pending.videoId) return
                clearWatchdog()
                setPlayingId(id)
                return
              }

              // A clip shorter than the slide would otherwise sit on a frozen
              // end card. Loop it back to the cue point instead.
              if (e.data === STATE_ENDED && wantPlayingRef.current) {
                try {
                  e.target.seekTo(pending.startSeconds, true)
                  e.target.playVideo()
                } catch {
                  /* ignore — the slide is about to change anyway */
                }
              }
            },
            onError: (e) => {
              if (cancelled) return
              // Codes 2/5/100/101/150 all mean "this clip will not play here".
              // They are per-video, so report and let the caller fall back for
              // that slide only — the rest of the reel may be fine. Ask the
              // player which video it was actually holding: the event carries
              // no id, and ours may already have moved on.
              let actual: string | undefined
              try {
                actual = e.target.getVideoData?.()?.video_id
              } catch {
                /* fall back to the requested id below */
              }
              const failed = actual || requestRef.current?.videoId
              if (failed) failClip(failed)
            },
          },
        })
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable')
      })

    return () => {
      cancelled = true
      readyRef.current = false
      clearWatchdog()
      setPlayingId(null)
      try {
        playerRef.current?.destroy()
      } catch {
        /* already gone */
      }
      playerRef.current = null
      host.replaceChildren()
    }
  }, [enabled, armWatchdog, clearWatchdog, failClip])

  const show = useCallback(
    (videoId: string, startSeconds = 0) => {
      // Always record it: if the player is not ready yet, onReady replays this.
      requestRef.current = { videoId, startSeconds }
      wantPlayingRef.current = true
      // Nothing is confirmed playing until onStateChange says so. Clearing it
      // here is what keeps a buffering clip from showing the previous one's
      // last frame — or a black rectangle — over the backdrop.
      setPlayingId(null)
      armWatchdog(videoId)
      withPlayer((p) => p.loadVideoById({ videoId, startSeconds }))
    },
    [armWatchdog, withPlayer],
  )

  const setMuted = useCallback(
    (muted: boolean) => {
      mutedRef.current = muted
      withPlayer((p) => {
        if (muted) {
          p.mute()
        } else {
          p.unMute()
          p.setVolume(70)
        }
      })
    },
    [withPlayer],
  )

  const pause = useCallback(() => {
    wantPlayingRef.current = false
    // A paused clip is still the right clip on screen, so playingId stands.
    // But it will not reach PLAYING again on its own, so disarm the watchdog.
    clearWatchdog()
    withPlayer((p) => p.pauseVideo())
  }, [clearWatchdog, withPlayer])

  const resume = useCallback(() => {
    wantPlayingRef.current = true
    withPlayer((p) => p.playVideo())
  }, [withPlayer])

  // Never leave a timer running past the hook's life.
  useEffect(() => clearWatchdog, [clearWatchdog])

  return { status, playingId, containerRef, show, setMuted, pause, resume }
}
