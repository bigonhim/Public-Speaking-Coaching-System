// The seven-rung progression ladder. The current rung is highlighted; unlocked
// rungs below show a check; the next rung up shows progress toward it.

import type { LevelState } from '../api/types'
import { LADDER } from '../lib/levels'

interface Props {
  level: LevelState
}

export function LevelLadder({ level }: Props) {
  const current = level.current_level
  const nextLevel = level.next_level

  return (
    <div className="card p-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold text-ink-900">Your journey</h2>
        <span className="chip py-1">Level {current} of 7</span>
      </div>

      <ol className="space-y-2">
        {[...LADDER].reverse().map((rung) => {
          const unlocked = rung.level <= current
          const isCurrent = rung.level === current
          const isNext = rung.level === nextLevel
          return (
            <li
              key={rung.level}
              className={`flex items-center gap-4 rounded-2xl border p-3 transition ${
                isCurrent
                  ? 'border-brand-200 bg-gradient-to-br from-brand-50 to-white shadow-soft'
                  : isNext
                    ? 'border-ink-900/10 bg-white'
                    : 'border-transparent bg-ink-50/60'
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  unlocked
                    ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow'
                    : 'bg-ink-100 text-ink-400'
                }`}
              >
                {unlocked ? '★' : rung.level}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`truncate font-semibold ${unlocked ? 'text-ink-800' : 'text-ink-400'}`}
                  >
                    {rung.name}
                  </span>
                  {isCurrent && (
                    <span className="rounded-full bg-gradient-to-br from-brand-500 to-brand-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      You are here
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-ink-400">{rung.award}</p>

                {isNext && (
                  <div className="mt-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-[width] duration-700"
                        style={{ width: `${Math.round(level.progress_fraction * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-ink-500">{level.progress_text}</p>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
