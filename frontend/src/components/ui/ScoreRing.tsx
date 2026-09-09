// A circular progress ring for a 0..100 score. Purely presentational.

interface Props {
  value: number // 0..100
  size?: number
  stroke?: number
  color: string
  label?: string
  sublabel?: string
}

export function ScoreRing({ value, size = 160, stroke = 13, color, label, sublabel }: Props) {
  const clamped = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - clamped / 100)
  const gid = `ring-${color.replace('#', '')}`

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.75" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#edeaf7" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)',
            filter: `drop-shadow(0 4px 10px ${color}55)`,
          }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-5xl font-bold tabular-nums text-ink-900">
          {label ?? clamped.toFixed(0)}
        </span>
        {sublabel && (
          <span className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}
