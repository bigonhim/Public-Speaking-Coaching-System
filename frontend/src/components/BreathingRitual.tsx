// An optional, calming warm-up shown before recording: a slow breathing circle
// (~4s in, ~4s out, two cycles) then a 3-2-1 countdown, after which recording
// starts. No scores, no pressure. "Skip" is always visible.
//
// This is a confidence-building routine through gentle preparation — it is NOT
// therapy and makes no claim to treat or cure anxiety.

import { useEffect, useRef, useState } from 'react'
import { Chassis, Module } from './ui/Hardware'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

const CYCLE_MS = 8000 // one inhale + exhale
const CYCLES = 2
const BREATHE_MS = CYCLE_MS * CYCLES

interface Props {
  onDone: () => void
  onAlwaysSkip: () => void
}

export function BreathingRitual({ onDone, onAlwaysSkip }: Props) {
  const [phase, setPhase] = useState<'breathing' | 'countdown'>('breathing')
  const [label, setLabel] = useState('Breathe in')
  const [count, setCount] = useState(3)
  const doneRef = useRef(false)
  const reducedMotion = usePrefersReducedMotion()

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }

  // Breathing phase: toggle the label every half-cycle, then move to countdown.
  useEffect(() => {
    if (phase !== 'breathing') return
    setLabel('Breathe in')
    const half = window.setInterval(
      () => setLabel((l) => (l === 'Breathe in' ? 'Breathe out' : 'Breathe in')),
      CYCLE_MS / 2,
    )
    const toCountdown = window.setTimeout(() => setPhase('countdown'), BREATHE_MS)
    return () => {
      window.clearInterval(half)
      window.clearTimeout(toCountdown)
    }
  }, [phase])

  // Countdown phase: 3 → 2 → 1 → start.
  useEffect(() => {
    if (phase !== 'countdown') return
    setCount(3)
    const id = window.setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          window.clearInterval(id)
          finish()
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const breathing = phase === 'breathing'
  const breathe =
    breathing && !reducedMotion ? { animation: `breathe ${CYCLE_MS}ms ease-in-out ${CYCLES}` } : undefined

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-canvas"
      style={{ backgroundImage: 'radial-gradient(ellipse 85% 60% at 30% 0%, #efede8, #d9d6cf 58%, #ccc8c0)' }}
    >
      <div className="flex min-h-full items-center justify-center px-4 py-10">
        <Chassis className="w-full max-w-md animate-fade-in">
          <Module label="00 · Warm-up" aside={breathing ? 'Two slow breaths' : 'Recording next'}>
            <div className="lcd flex flex-col items-center gap-6 px-6 py-10" role="status">
              <div className="relative flex h-56 w-56 items-center justify-center">
                <span className="absolute inset-0 rounded-full border border-white/10" aria-hidden />
                <span
                  className="absolute h-48 w-48 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, rgba(255,106,43,0.32), rgba(255,106,43,0) 70%)',
                    ...breathe,
                  }}
                  aria-hidden
                />
                <span
                  className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-lcd-glow"
                  style={{
                    boxShadow: '0 0 24px rgba(255,106,43,0.5), inset 0 0 24px rgba(255,106,43,0.25)',
                    ...breathe,
                  }}
                >
                  {!breathing && (
                    <span className="lcd-glow font-mono text-6xl font-medium tabular-nums">{count}</span>
                  )}
                </span>
              </div>
              <p className="font-mono text-lg uppercase tracking-[0.2em] text-lcd-text">
                {breathing ? label : 'Get ready…'}
              </p>
            </div>
            <p className="mt-4 text-center text-sm leading-relaxed text-ink-500">
              Take a moment to settle. When the countdown ends, recording begins.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button onClick={finish} className="key">
                Skip warm-up
              </button>
              <button
                onClick={() => {
                  onAlwaysSkip()
                  finish()
                }}
                className="key"
              >
                Always skip
              </button>
            </div>
          </Module>
        </Chassis>
      </div>
    </div>
  )
}
