// A decorative equalizer — the brand mark's five bars, scaled up to a horizon.
//
// Heights come from a seeded generator so a given `seed` always draws the same
// silhouette: each speaker in the reel gets a shape of their own that does not
// reshuffle on every render. Animation is pure CSS (transform only), so a wall
// of 72 bars costs nothing to keep moving.

import { useMemo } from 'react'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

interface Props {
  bars?: number
  /** Same seed, same silhouette. */
  seed?: number
  className?: string
  /** CSS colour for the bars; defaults to inheriting via currentColor. */
  color?: string
  /** Shortest and tallest bar, as a fraction of the container height. */
  minHeight?: number
  maxHeight?: number
}

/** Mulberry32 — tiny, fast, and stable across renders for a given seed. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function Waveform({
  bars = 64,
  seed = 7,
  className = '',
  color,
  minHeight = 0.12,
  maxHeight = 1,
}: Props) {
  const still = usePrefersReducedMotion()

  const shape = useMemo(() => {
    const rand = seededRandom(seed)
    return Array.from({ length: bars }, (_, i) => {
      // A slow envelope keeps the silhouette from reading as pure noise: it
      // swells toward the middle the way a spoken phrase does.
      const envelope = Math.sin((i / (bars - 1)) * Math.PI) ** 0.6
      const jitter = 0.45 + rand() * 0.55
      const height = minHeight + (maxHeight - minHeight) * envelope * jitter
      return {
        height: `${Math.round(height * 100)}%`,
        delay: `${(rand() * 1.8).toFixed(2)}s`,
        duration: `${(1.1 + rand() * 1.4).toFixed(2)}s`,
      }
    })
  }, [bars, seed, minHeight, maxHeight])

  return (
    <div
      className={`flex h-full w-full items-center justify-between gap-[2px] ${className}`}
      aria-hidden
    >
      {shape.map((bar, i) => (
        <span
          key={i}
          className={`min-w-px flex-1 rounded-full ${still ? '' : 'animate-wave'}`}
          style={{
            height: bar.height,
            background: color ?? 'currentColor',
            animationDelay: still ? undefined : bar.delay,
            animationDuration: still ? undefined : bar.duration,
          }}
        />
      ))}
    </div>
  )
}
