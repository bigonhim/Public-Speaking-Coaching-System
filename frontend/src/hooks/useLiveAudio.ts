// Live, client-side audio analysis for the virtual audience. Uses ONLY Web
// Audio (RMS volume, a silence timer, and a voiced-onset "speech rate" proxy).
// It never sees a transcript, so it must never imply live filler detection.
//
// Produces a smoothed engagement score in [0, 1] (EMA, ~1.2s time constant),
// plus a normalised volume level and a speaking flag for the on-screen meter.

import { useEffect, useRef, useState } from 'react'

export interface LiveAudio {
  engagement: number // 0..1, smoothed
  volume: number // 0..1, instantaneous RMS (for the meter)
  speaking: boolean
}

const QUIET_RMS = 0.04 // below this = essentially silence
const COMFORT_LOW = 0.06 // comfortable projection band
const COMFORT_HIGH = 0.4
const PUBLISH_MS = 90 // throttle state updates (~11fps is plenty)

interface Options {
  /** Tough rooms (higher levels) decay faster and forgive less. */
  forgiveness?: number // 1 = normal; <1 tougher; >1 more forgiving
}

export function useLiveAudio(
  stream: MediaStream | null,
  active: boolean,
  { forgiveness = 1 }: Options = {},
): LiveAudio {
  const [state, setState] = useState<LiveAudio>({ engagement: 0.7, volume: 0, speaking: false })

  const engagementRef = useRef(0.7)
  const lastSpeechRef = useRef(0)
  const onsetsRef = useRef<number[]>([])
  const wasSpeakingRef = useRef(false)
  const lastPublishRef = useRef(0)
  const lastFrameRef = useRef(0)

  useEffect(() => {
    if (!stream || !active) return

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const buffer = new Uint8Array(analyser.fftSize)

    engagementRef.current = 0.7
    lastSpeechRef.current = performance.now()
    lastFrameRef.current = performance.now()
    onsetsRef.current = []

    let raf = 0
    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.1, (now - lastFrameRef.current) / 1000)
      lastFrameRef.current = now

      analyser.getByteTimeDomainData(buffer)
      let sumSq = 0
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128
        sumSq += v * v
      }
      const rms = Math.sqrt(sumSq / buffer.length)
      const speaking = rms > QUIET_RMS

      // Track onsets (silence -> speech transitions) within a ~3s window.
      if (speaking && !wasSpeakingRef.current) onsetsRef.current.push(now)
      wasSpeakingRef.current = speaking
      onsetsRef.current = onsetsRef.current.filter((t) => now - t < 3000)
      if (speaking) lastSpeechRef.current = now
      const speechRate = onsetsRef.current.length / 3 // onsets per second

      const silenceSec = (now - lastSpeechRef.current) / 1000

      // Instantaneous target engagement from the current conditions.
      let target: number
      if (speaking) {
        if (rms >= COMFORT_LOW && rms <= COMFORT_HIGH) target = 0.92
        else if (rms > COMFORT_HIGH) target = 0.72 // shouting
        else target = 0.55 // audible but quiet
        if (speechRate > 5.5) target -= 0.1 // very choppy delivery
      } else if (silenceSec > 4) {
        target = 0.18
      } else if (silenceSec > 2) {
        target = 0.4
      } else {
        target = 0.66
      }

      // A tougher room forgives less: pull unfavourable targets further down.
      if (target < 0.7 && forgiveness < 1) target *= forgiveness

      // EMA toward the target (~1.2s time constant), so faces glide, not flicker.
      const tau = 1.2 / Math.max(0.5, forgiveness)
      const alpha = 1 - Math.exp(-dt / tau)
      engagementRef.current += (target - engagementRef.current) * alpha

      if (now - lastPublishRef.current > PUBLISH_MS) {
        lastPublishRef.current = now
        setState({
          engagement: engagementRef.current,
          volume: Math.min(1, rms / COMFORT_HIGH),
          speaking,
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      source.disconnect()
      ctx.close().catch(() => {})
    }
  }, [stream, active, forgiveness])

  return state
}
