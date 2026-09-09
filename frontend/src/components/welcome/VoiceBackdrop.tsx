// The generated stage behind each voice in the reel.
//
// This is the always-available layer: it renders under the footage as its
// loading state, and stands alone as the whole visual when a clip is missing or
// blocked. So it is built to look finished rather than to look like a gap —
// monumental initials, broadcast rings, and the speaker's own waveform, washed
// in their accent colour.
//
// Deliberately not a portrait: a generic silhouette standing in for six
// specific people would read as a missing image, and real likenesses carry
// rights we do not have.

import { Waveform } from '../ui/Waveform'
import type { Voice } from '../../data/voices'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

interface Props {
  voice: Voice
  /** Index in the reel, used to vary the waveform silhouette per speaker. */
  index: number
}

export function VoiceBackdrop({ voice, index }: Props) {
  const still = usePrefersReducedMotion()

  return (
    <div className="absolute inset-0 overflow-hidden bg-ink-950" aria-hidden>
      {/* Accent wash */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 15% 15%, ${voice.accent}55, transparent 60%),
                       radial-gradient(100% 80% at 85% 90%, ${voice.accent}33, transparent 62%),
                       linear-gradient(160deg, #0b0e20 0%, #16123a 55%, #0b0e20 100%)`,
        }}
      />

      {/* Concentric broadcast rings, drifting outward from the initials. */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {[0, 1, 2].map((ring) => (
          <span
            key={ring}
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
              still ? '' : 'animate-pulse-ring'
            }`}
            style={{
              width: `${28 + ring * 16}rem`,
              height: `${28 + ring * 16}rem`,
              borderColor: `${voice.accent}22`,
              animationDelay: `${ring * 0.7}s`,
              animationDuration: '5.5s',
            }}
          />
        ))}
      </div>

      {/* The initials, set enormous and nearly invisible. */}
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none
                   font-display font-bold leading-none tracking-tighter"
        style={{
          fontSize: 'clamp(11rem, 34vw, 30rem)',
          color: voice.accent,
          opacity: 0.1,
        }}
      >
        {voice.initials}
      </span>

      {/* The speaker's waveform along the floor. */}
      <div className="absolute inset-x-0 bottom-0 h-[28vh] opacity-30">
        <Waveform bars={88} seed={index * 137 + 11} color={voice.accent} minHeight={0.06} />
      </div>

      {/* Film grain — a static SVG turbulence, no runtime cost. */}
      <div
        className="absolute inset-0 opacity-[0.16] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Vignette, so the type on top always has contrast to sit against. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(85% 75% at 50% 45%, transparent 30%, rgba(6,8,22,0.72) 100%)',
        }}
      />
    </div>
  )
}
