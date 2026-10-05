// The Cadence mark: a signal-orange keycap with three level bars cut into it.
// Purely decorative.

interface Props {
  size?: number
  className?: string
  /** Gently animate the bars (used on loading states, not in the nav). */
  animated?: boolean
}

const BARS = [
  { x: 3.5, h: 10 },
  { x: 10, h: 18 },
  { x: 16.5, h: 10 },
]

export function LogoMark({ size = 24, className = '', animated = false }: Props) {
  const edge = Math.max(1, Math.round(size * 0.08))
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-[24%] ${className}`}
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(#FF8A55, #E24A14)',
        boxShadow: `inset 0 -${edge}px 0 rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.4)`,
      }}
      aria-hidden
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
        {BARS.map((b, i) => (
          <rect
            key={b.x}
            x={b.x}
            y={12 - b.h / 2}
            width="4"
            height={b.h}
            rx="2"
            fill="#1D1C1A"
            className={animated ? 'origin-center animate-breathe' : ''}
            style={animated ? { animationDelay: `${i * 0.18}s`, transformBox: 'fill-box' } : undefined}
          />
        ))}
      </svg>
    </span>
  )
}

/** Full lockup: mark + wordmark. `tone="light"` is for dark backdrops (the
 *  sign-in panel and the welcome reel). `tagline` adds the printed
 *  "Speaking coach" plate used in the app header. */
export function Wordmark({
  size = 24,
  tone = 'dark',
  tagline = false,
}: {
  size?: number
  tone?: 'dark' | 'light'
  tagline?: boolean
}) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span
        className={`text-[1.45rem] font-semibold leading-none tracking-[-0.04em] ${
          tone === 'light' ? 'text-white' : 'text-ink-900'
        }`}
      >
        cadence
      </span>
      {tagline && (
        <span
          className={`ml-1 hidden border-l pl-3 font-mono text-[11px] uppercase tracking-[0.12em] md:inline ${
            tone === 'light' ? 'border-white/25 text-white/70' : 'border-ink-300 text-ink-500'
          }`}
        >
          Speaking coach
        </span>
      )}
    </span>
  )
}
