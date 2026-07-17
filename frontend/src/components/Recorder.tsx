// Presentational recording panel: a live timer, a volume meter fed by the Web
// Audio hook, and the stop control. The parent owns the recorder lifecycle.

import { formatDuration } from '../lib/scoring'

interface Props {
  elapsedSec: number
  volume: number // 0..1
  speaking: boolean
  onStop: () => void
  minSec?: number
}

export function Recorder({ elapsedSec, volume, speaking, onStop, minSec = 45 }: Props) {
  const belowMin = elapsedSec < minSec
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex items-center gap-3">
        <span
          className={`h-3.5 w-3.5 rounded-full ${
            speaking ? 'bg-rose-500 animate-pulse' : 'bg-rose-400'
          }`}
        />
        <span className="text-4xl font-bold tabular-nums text-slate-800">
          {formatDuration(elapsedSec)}
        </span>
      </div>

      {/* Volume meter — a calm bar with a "comfortable projection" band. */}
      <div className="w-full max-w-sm">
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="absolute inset-y-0 left-[15%] w-[70%] bg-emerald-100"
            aria-hidden
            title="Comfortable projection"
          />
          <div
            className="relative h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-[width] duration-100"
            style={{ width: `${Math.round(volume * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-center text-xs text-slate-400">Keep your voice in the green band</p>
      </div>

      <button onClick={onStop} className="btn-primary px-8 py-3 text-lg">
        Stop &amp; analyze
      </button>
      {belowMin && (
        <p className="text-xs text-slate-400">Aim for at least {minSec}s for a full read.</p>
      )}
    </div>
  )
}
