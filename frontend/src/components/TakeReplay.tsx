// The take on a timeline, on the console's display: a bar wherever the speaker
// was talking (taller where they were going faster), a flag on every filler,
// and the silences between words shaded in, the long ones called out. Built
// from the session's word timestamps and the scorer's own thresholds.

import type { ScoringConfig, Word } from '../api/types'
import { findFillers, findPauses, rateContour } from '../lib/replay'
import { formatClock } from '../lib/scoring'
import { Module } from './ui/Hardware'

const BARS = 96
/** Labels closer together than this (as a share of the take) would overprint
 *  each other, so later ones keep their flag but lose the label. */
const LABEL_GAP = 0.1

interface Props {
  words: Word[]
  durationSec: number
  config: ScoringConfig | null
  className?: string
}

export function TakeReplay({ words, durationSec, config, className = '' }: Props) {
  const total = Math.max(durationSec, words.length ? words[words.length - 1].end : 0, 1)
  const pct = (sec: number) => `${(Math.max(0, Math.min(1, sec / total)) * 100).toFixed(2)}%`

  const bars = rateContour(words, total, BARS)
  const pauses = config ? findPauses(words, config.pause_min_sec, config.long_pause_sec) : []
  const fillers = config ? findFillers(words, config.fillers) : []
  const fillerBars = new Set(fillers.map((f) => Math.min(BARS - 1, Math.floor((f.start / total) * BARS))))

  // Fillers label the top row and long pauses the row under it, so the two
  // never overprint each other; each row thins its own labels.
  const spaced = <T extends { at: number }>(items: T[]) => {
    let last = -Infinity
    return items.map((item) => {
      const labelled = item.at - last >= LABEL_GAP
      if (labelled) last = item.at
      return { ...item, labelled }
    })
  }
  const flags = spaced(fillers.map((f) => ({ ...f, at: f.start / total })))
  const longPauses = spaced(pauses.filter((p) => p.long).map((p) => ({ ...p, at: p.start / total })))
  const longest = pauses.reduce((m, p) => Math.max(m, p.end - p.start), 0)

  const stats = [
    { label: 'Words', value: String(words.length) },
    { label: 'Fillers', value: config ? String(fillers.length) : '--' },
    { label: 'Pauses', value: config ? String(pauses.length) : '--' },
    { label: 'Longest', value: config && pauses.length ? `${longest.toFixed(1)}s` : '--' },
  ]

  const summary =
    words.length === 0
      ? 'No speech was detected in this take.'
      : `${words.length} words over ${formatClock(total)}, ${fillers.length} filler${
          fillers.length === 1 ? '' : 's'
        }, ${longPauses.length} long pause${longPauses.length === 1 ? '' : 's'}.`

  return (
    <Module label="03 · Replay" aside={formatClock(total)} className={`flex flex-col ${className}`}>
      <div className="lcd flex flex-1 flex-col justify-between gap-6 px-4 py-5 font-mono sm:px-[22px]">
        <p className="sr-only">{summary}</p>
        {words.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-lcd-dim">No speech was detected in this take.</p>
        ) : (
          <div className="grid grid-cols-[52px_1fr] items-center gap-x-3 gap-y-2.5 sm:grid-cols-[64px_1fr]" aria-hidden>
            <span className="text-[10px] tracking-[0.14em] text-lcd-dim">VOICE</span>
            <div className="relative h-[128px]">
              <div className="absolute inset-x-0 bottom-0 top-[46px] flex items-center gap-[2px]">
                {bars.map((v, i) => (
                  <span
                    key={i}
                    className="block flex-1 rounded-[1px]"
                    style={{
                      height: v > 0 ? `${Math.round(v * 100)}%` : '2px',
                      background: fillerBars.has(i) ? '#FF6A2B' : v > 0 ? '#A9A497' : '#2A2C28',
                    }}
                  />
                ))}
              </div>
              {pauses.map((p) => (
                <span
                  key={p.start}
                  className="absolute bottom-0 top-[46px]"
                  style={{
                    left: pct(p.start),
                    width: pct(p.end - p.start),
                    background: p.long
                      ? 'repeating-linear-gradient(135deg, rgba(255,106,43,0.5) 0 2px, transparent 2px 6px)'
                      : 'repeating-linear-gradient(135deg, rgba(169,164,151,0.22) 0 2px, transparent 2px 6px)',
                    borderLeft: p.long ? '1px solid #FF6A2B' : undefined,
                    borderRight: p.long ? '1px solid #FF6A2B' : undefined,
                  }}
                />
              ))}
              {longPauses.map(
                (p) =>
                  p.labelled && (
                    <span
                      key={`label-${p.start}`}
                      className="absolute top-[24px] whitespace-nowrap text-[10px] tracking-[0.06em] text-[#FF8A55]"
                      style={{ left: pct(p.start) }}
                    >
                      PAUSE {(p.end - p.start).toFixed(1)}S
                    </span>
                  ),
              )}
              {flags.map((f) => (
                <span key={`${f.index}-${f.text}`}>
                  <span className="absolute bottom-0 top-[20px] w-px bg-lcd-glow" style={{ left: pct(f.start) }} />
                  {f.labelled && (
                    <span
                      className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-[3px] bg-lcd-glow px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-lcd"
                      style={{ left: pct(f.start) }}
                    >
                      {f.text}
                    </span>
                  )}
                </span>
              ))}
            </div>
            <span />
            <div className="flex justify-between text-[10px] text-lcd-dim">
              <span>0:00</span>
              <span>{formatClock(total / 2)}</span>
              <span>{formatClock(total)}</span>
            </div>
          </div>
        )}
        {words.length > 0 && (
          <dl className="grid grid-cols-4 gap-3 border-t border-white/10 pt-4">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-[10px] uppercase tracking-[0.14em] text-lcd-dim">{s.label}</dt>
                <dd className="mt-1 text-2xl font-medium tabular-nums text-lcd-text">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <ul className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500">
        <li className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[#A9A497]" aria-hidden />
          Speech · taller is faster
        </li>
        {config && (
          <>
            <li className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-lcd-glow" aria-hidden />
              Filler
            </li>
            <li className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: 'repeating-linear-gradient(135deg, #8D8A80 0 1px, transparent 1px 3px)' }}
                aria-hidden
              />
              Pause {config.pause_min_sec}s+
            </li>
            <li className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: 'repeating-linear-gradient(135deg, #FF6A2B 0 1px, transparent 1px 3px)' }}
                aria-hidden
              />
              Long pause {config.long_pause_sec}s+
            </li>
          </>
        )}
      </ul>
    </Module>
  )
}
