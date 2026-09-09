// The Cadence brand mark: a rounded gradient tile holding a stylized voice
// "cadence" — five equalizer bars that read as rhythm/sound. Purely decorative.

interface Props {
  size?: number
  className?: string
  /** Gently animate the bars (used on the marketing hero, not in the nav). */
  animated?: boolean
}

export function LogoMark({ size = 36, className = '', animated = false }: Props) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[30%] bg-gradient-to-br from-brand-500 via-brand-600 to-accent-500 shadow-glow ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        className="relative"
      >
        {[
          { x: 2, h: 8 },
          { x: 7, h: 16 },
          { x: 12, h: 22 },
          { x: 17, h: 12 },
          { x: 22, h: 6 },
        ].map((b, i) => (
          <rect
            key={b.x}
            x={b.x - 1.5}
            y={12 - b.h / 2}
            width="3"
            height={b.h}
            rx="1.5"
            fill="white"
            fillOpacity={0.92}
            className={animated ? 'origin-center animate-breathe' : ''}
            style={animated ? { animationDelay: `${i * 0.16}s` } : undefined}
          />
        ))}
      </svg>
    </span>
  )
}

/** Full lockup: mark + wordmark. `tone="light"` is for dark backdrops (the
 *  sign-in stage panel and the welcome reel). */
export function Wordmark({
  size = 36,
  tone = 'dark',
}: {
  size?: number
  tone?: 'dark' | 'light'
}) {
  const light = tone === 'light'
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span
          className={`font-display text-lg font-bold tracking-tight ${
            light ? 'text-white' : 'text-ink-900'
          }`}
        >
          Cadence
        </span>
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
            light ? 'text-white/55' : 'text-ink-400'
          }`}
        >
          Speaking Coach
        </span>
      </span>
    </span>
  )
}
