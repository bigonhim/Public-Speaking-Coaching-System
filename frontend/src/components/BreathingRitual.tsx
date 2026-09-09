// An optional, calming warm-up shown before recording: a slow breathing circle
// (~4s in, ~4s out, two cycles) then a 3-2-1 countdown, after which recording
// starts. No scores, no pressure. "Skip" is always visible.
//
// This is a confidence-building routine through gentle preparation — it is NOT
// therapy and makes no claim to treat or cure anxiety.

import { useEffect, useRef, useState } from 'react'

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-brand-950 via-brand-900 to-ink-950 text-white">
      <div className="flex flex-col items-center gap-10 animate-fade-in">
        <div className="relative flex h-72 w-72 items-center justify-center">
          <div className="absolute h-72 w-72 rounded-full bg-brand-400/10" />
          <div
            className="absolute h-56 w-56 rounded-full bg-brand-400/20"
            style={
              phase === 'breathing'
                ? { animation: `breathe ${CYCLE_MS}ms ease-in-out ${CYCLES}` }
                : undefined
            }
          />
          <div
            className="flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 to-brand-500 shadow-2xl"
            style={
              phase === 'breathing'
                ? { animation: `breathe ${CYCLE_MS}ms ease-in-out ${CYCLES}` }
                : undefined
            }
          >
            {phase === 'countdown' && (
              <span className="text-6xl font-bold tabular-nums">{count}</span>
            )}
          </div>
        </div>

        <p className="text-2xl font-medium tracking-wide text-brand-50">
          {phase === 'breathing' ? label : 'Get ready…'}
        </p>
        <p className="max-w-sm text-center text-sm text-brand-200/80">
          Take a moment to settle. When the countdown ends, recording begins.
        </p>
      </div>

      <div className="absolute bottom-10 flex items-center gap-6">
        <button onClick={finish} className="text-brand-100 underline-offset-4 hover:underline">
          Skip warm-up
        </button>
        <button
          onClick={() => {
            onAlwaysSkip()
            finish()
          }}
          className="text-sm text-brand-300/80 underline-offset-4 hover:underline"
        >
          Always skip
        </button>
      </div>
    </div>
  )
}
