// The landing page's hero demo: the real audience, driven by a scripted take
// instead of a microphone.
//
// Each beat's engagement is the value useLiveAudio settles on for the same
// conditions, so the faces react here the way they would to a real voice. The
// demo only shows what the live audience can actually hear — level and
// silence. It never implies the room reacts to words or fillers; it cannot.

import { useEffect, useState } from 'react'
import { VirtualAudience } from '../VirtualAudience'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

interface Beat {
  seconds: number
  voice: string
  room: string
  engagement: number
  /** Mic level, 0..1, for the meter. */
  level: number
}

const SCRIPT: Beat[] = [
  { seconds: 9, voice: 'A clear, steady voice', room: 'The room leans in', engagement: 0.92, level: 0.6 },
  { seconds: 6, voice: 'Your voice drops too low', room: 'Attention starts to drift', engagement: 0.55, level: 0.09 },
  { seconds: 7, voice: 'A long silence', room: 'You have lost them', engagement: 0.18, level: 0 },
]
const LOOP_SECONDS = SCRIPT.reduce((sum, beat) => sum + beat.seconds, 0)

function beatAt(second: number): Beat {
  let end = 0
  for (const beat of SCRIPT) {
    end += beat.seconds
    if (second < end) return beat
  }
  return SCRIPT[0]
}

const label = 'text-xs font-semibold uppercase tracking-[0.14em] text-ink-500'

export function RoomDemo() {
  const still = usePrefersReducedMotion()
  const [second, setSecond] = useState(0)

  // Reduced motion: no loop. The room stays on its first, attentive beat.
  useEffect(() => {
    if (still) return
    const id = setInterval(() => setSecond((s) => (s + 1) % LOOP_SECONDS), 1000)
    return () => clearInterval(id)
  }, [still])

  const beat = still ? SCRIPT[0] : beatAt(second)

  return (
    <figure className="card overflow-hidden rounded-3xl shadow-lift">
      <div className="flex items-start justify-between gap-4 border-b border-ink-900/[0.07] px-6 py-5">
        <div className="min-w-0">
          <p className={label}>Speaking on</p>
          <p className="mt-1.5 font-display text-lg leading-snug text-ink-900">
            Describe a person who changed the way you think.
          </p>
        </div>
        <span className="chip shrink-0 py-1 text-xs">Scripted demo</span>
      </div>

      <div className="bg-brand-50/70 px-6 py-9" aria-hidden>
        {/* Narrow enough that six faces always sit three to a row. */}
        <div className="mx-auto flex max-w-[21rem] justify-center">
          <VirtualAudience engagement={beat.engagement} size={6} faceSize={80} />
        </div>
      </div>

      <div className="grid gap-5 px-6 py-5 sm:grid-cols-2" aria-hidden>
        <div>
          <p className={label}>Your voice</p>
          <p key={beat.voice} className="animate-fade-in mt-1.5 font-medium text-ink-900">
            {beat.voice}
          </p>
          {/* The same meter as the recording stage: a fill, and the band a
              comfortable speaking level sits in. */}
          <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-ink-100">
            <div className="absolute inset-y-0 left-[15%] w-[70%] bg-brand-200/70" />
            <div
              className="relative h-full rounded-full bg-brand-600 transition-[width] duration-700 ease-out"
              style={{ width: `${beat.level * 100}%` }}
            />
          </div>
        </div>
        <div>
          <p className={label}>The room</p>
          <p key={beat.room} className="animate-fade-in mt-1.5 font-medium text-ink-900">
            {beat.room}
          </p>
        </div>
      </div>

      <figcaption className="sr-only">
        A scripted demo of the virtual audience. Six faces lean in while the speaker's voice is
        clear and steady, drift when it drops too low, and look away during a long silence.
      </figcaption>
    </figure>
  )
}
