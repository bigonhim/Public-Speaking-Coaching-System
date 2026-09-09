// The virtual audience: a small crowd whose expressions track the live
// engagement signal. Presentation only — it is NOT a second analysis engine.
//
// Realism rules (from HANDOFF.md §8): every face has a personal bias and a
// random reaction delay (300–1200ms), and no face changes expression more than
// once per ~2s. Lockstep flipping looks broken and destroys the effect.
//
// Note: the engagement value already reflects room difficulty (the live-audio
// hook bakes in "forgiveness"), so this component does not re-apply it.

import { useEffect, useRef, useState } from 'react'
import { AudienceFace } from './AudienceFace'
import type { FaceState } from './AudienceFace'

interface FaceMeta {
  seed: string
  bias: number // personal lean added to engagement (stable per seat)
  delayMs: number // reaction delay
  lastChange: number
  pendingState: FaceState | null
  pendingSince: number
}

const MIN_CHANGE_INTERVAL = 2000

function faceState(engagement: number): FaceState {
  if (engagement >= 0.82) return 'nodding'
  if (engagement >= 0.7) return 'attentive'
  if (engagement >= 0.45) return 'neutral'
  if (engagement >= 0.3) return 'bored'
  return 'distracted'
}

function buildCrowd(size: number): FaceMeta[] {
  // Deterministic layout (no Math.random) so the crowd is stable across renders.
  return Array.from({ length: size }, (_, i) => ({
    seed: `member-${i}-${size}`,
    bias: (((i * 37) % 100) / 100) * 0.24 - 0.12, // -0.12..+0.12
    delayMs: 300 + ((i * 53) % 900), // 300..1200ms
    lastChange: 0,
    pendingState: null,
    pendingSince: 0,
  }))
}

interface Props {
  engagement: number
  size: number
  /** Face diameter in px. Larger on the immersive stage than the setup preview. */
  faceSize?: number
  /** Drop the card chrome (background, spotlight) so faces sit on the stage. */
  bare?: boolean
}

export function VirtualAudience({ engagement, size, faceSize = 60, bare = false }: Props) {
  const metaRef = useRef<FaceMeta[]>([])
  const [states, setStates] = useState<FaceState[]>([])
  const engagementRef = useRef(engagement)
  engagementRef.current = engagement

  // (Re)build the crowd whenever its size changes.
  useEffect(() => {
    metaRef.current = buildCrowd(size)
    setStates(metaRef.current.map(() => 'neutral'))
  }, [size])

  // Drive expression changes on a gentle cadence, honouring each face's
  // reaction delay and the once-per-2s cap.
  useEffect(() => {
    if (size === 0) return
    const id = window.setInterval(() => {
      const now = performance.now()
      setStates((prev) => {
        let changed = false
        const next = [...prev]
        metaRef.current.forEach((m, i) => {
          const eff = Math.max(0, Math.min(1, engagementRef.current + m.bias))
          const desired = faceState(eff)
          if (desired === next[i]) {
            m.pendingState = null
            return
          }
          // A new desired state must persist for this face's reaction delay,
          // and faces never change more than once per MIN_CHANGE_INTERVAL.
          if (m.pendingState !== desired) {
            m.pendingState = desired
            m.pendingSince = now
            return
          }
          if (now - m.pendingSince >= m.delayMs && now - m.lastChange >= MIN_CHANGE_INTERVAL) {
            next[i] = desired
            m.lastChange = now
            m.pendingState = null
            changed = true
          }
        })
        return changed ? next : prev
      })
    }, 200)
    return () => window.clearInterval(id)
  }, [size])

  if (size === 0) {
    if (bare) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <p className="text-lg font-semibold text-white/90">An empty room</p>
          <p className="text-sm text-white/50">Just you and the topic — a gentle place to start.</p>
        </div>
      )
    }
    return (
      <div className="flex h-44 flex-col items-center justify-center rounded-3xl border border-dashed border-ink-200 bg-white/50 text-center">
        <div className="mb-2 flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2.5 w-2.5 rounded-full bg-ink-200 animate-float"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </div>
        <p className="text-sm font-semibold text-ink-600">Empty room</p>
        <p className="mt-1 text-xs text-ink-400">Just you and the topic — a gentle place to start.</p>
      </div>
    )
  }

  // Golden-ratio phase spacing spreads the sway/blink cadences so no two
  // neighbours move together.
  const faces = states.map((s, i) => (
    <AudienceFace
      key={metaRef.current[i]?.seed ?? i}
      seed={metaRef.current[i]?.seed ?? `s${i}`}
      state={s}
      size={faceSize}
      phase={(i * 0.618) % 1}
    />
  ))

  // Bare: just the crowd, laid out to fill the stage behind it.
  if (bare) {
    return (
      <div className="flex max-w-6xl flex-wrap items-end justify-center gap-4 sm:gap-6">{faces}</div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-ink-100 via-brand-50/60 to-white p-6 pb-9 ring-1 ring-ink-900/[0.04]">
      {/* soft stage spotlight */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-10 h-40"
        style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(122,80,255,0.16), transparent 70%)' }}
        aria-hidden
      />
      <div className="relative flex flex-wrap items-end justify-center gap-4">{faces}</div>
      {/* stage floor */}
      <div
        className="pointer-events-none absolute inset-x-6 bottom-4 h-3 rounded-full"
        style={{ background: 'radial-gradient(50% 100% at 50% 0%, rgba(15,23,42,0.10), transparent 75%)' }}
        aria-hidden
      />
    </div>
  )
}
