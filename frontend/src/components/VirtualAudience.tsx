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
}

export function VirtualAudience({ engagement, size }: Props) {
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
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 text-center">
        <p className="text-sm font-medium text-slate-500">Empty room</p>
        <p className="mt-1 text-xs text-slate-400">Just you and the topic — a gentle place to start.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-end justify-center gap-3 rounded-2xl bg-gradient-to-b from-brand-50/60 to-white p-5">
      {states.map((s, i) => (
        <AudienceFace key={metaRef.current[i]?.seed ?? i} seed={metaRef.current[i]?.seed ?? `s${i}`} state={s} />
      ))}
    </div>
  )
}
