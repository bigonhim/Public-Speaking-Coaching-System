// A circular progress ring for a 0..100 score. Purely presentational.

interface Props {
  value: number // 0..100
  size?: number
  stroke?: number
  color: string
  label?: string
  sublabel?: string
}

export function ScoreRing({ value, size = 160, stroke = 12, color, label, sublabel }: Props) {
  const clamped = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - clamped / 100)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-extrabold tabular-nums text-slate-800">
          {label ?? clamped.toFixed(0)}
        </span>
        {sublabel && <span className="mt-0.5 text-xs font-medium text-slate-400">{sublabel}</span>}
      </div>
    </div>
  )
}
