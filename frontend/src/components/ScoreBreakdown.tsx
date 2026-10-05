// The transparency centrepiece, built as a readout and a mixing desk. The
// overall score sits on its own display with the verdict scale lit up to where
// it landed; each of the four parts gets a channel strip showing its score, the
// raw measurement behind it, and how many points it put into the overall — so a
// user can explain their own score from this screen alone.

import type { SessionDetail } from '../api/types'
import { COMPONENTS, VERDICT_SCALE, verdict } from '../lib/scoring'
import { Module } from './ui/Hardware'

const SEGMENTS = 20

interface Props {
  session: SessionDetail
}

function OverallReadout({ overall }: { overall: number | null }) {
  const v = verdict(overall)
  const shown = overall === null ? '--' : String(Math.round(overall))
  const reached =
    overall === null ? -1 : VERDICT_SCALE.reduce((at, s, i) => (overall >= s.min ? i : at), -1)

  return (
    <Module label="01 · Overall" aside="out of 100" heading="h2" className="flex flex-[5_1_400px] flex-col">
      <div className="lcd flex flex-1 flex-col justify-between px-6 pb-6 pt-5 sm:px-[26px]">
        <div className="relative font-mono text-[132px] font-medium leading-none tracking-[-0.04em] sm:text-[176px]">
          {/* The unlit segments behind the digits, as on a real display. */}
          <span className="absolute left-0 top-0 text-[#1F221E]" aria-hidden>
            {'8'.repeat(shown.length)}
          </span>
          <span className="lcd-glow relative">
            <span className="sr-only">Overall score </span>
            {shown}
          </span>
        </div>
        <ol className="mt-4 grid grid-cols-5 gap-1.5" aria-label="Verdict scale">
          {VERDICT_SCALE.map((s, i) => {
            const current = i === reached
            return (
              <li key={s.label} aria-current={current ? 'true' : undefined}>
                <div
                  className="h-2 rounded-sm"
                  style={{
                    background: current ? '#FF6A2B' : i < reached ? '#B8481A' : '#2A2C28',
                    boxShadow: current ? '0 0 10px rgba(255,106,43,0.8)' : undefined,
                  }}
                  aria-hidden
                />
                {/* On a phone the five labels can't fit side by side, so only
                    the verdict reached keeps its label there. */}
                <div
                  className={`mt-2 font-mono text-[9.5px] uppercase leading-snug tracking-[0.08em] ${
                    current ? 'whitespace-nowrap text-lcd-text sm:whitespace-normal' : 'hidden text-lcd-dim sm:block'
                  }`}
                >
                  {s.label}
                  <br />
                  {s.min > 0 ? `${s.min}+` : ''}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
      <p className="mt-4 px-0.5 text-[15px] leading-relaxed text-ink-700">
        <strong className="font-semibold text-ink-900">{v.label}.</strong> {v.blurb}
      </p>
    </Module>
  )
}

export function ScoreBreakdown({ session }: Props) {
  const { scores, metrics, weights } = session

  return (
    <div className="flex flex-wrap gap-4 sm:gap-[22px]">
      <OverallReadout overall={scores.overall} />

      <Module
        label="02 · Channels"
        aside={scores.overall === null ? undefined : `Weighted mix → ${Math.round(scores.overall)}`}
        className="flex-[7_1_560px]"
      >
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {COMPONENTS.map((c) => {
            const score = scores[c.key]
            const weight = weights[c.key]
            const lit = score === null ? 0 : Math.round((Math.max(0, Math.min(100, score)) / 100) * SEGMENTS)
            return (
              <li
                key={c.key}
                className="flex flex-col items-center gap-3 rounded-[14px] bg-lcd-panel px-2.5 py-4 text-lcd-text shadow-[inset_0_2px_8px_rgba(0,0,0,0.6),0_1px_0_#fff]"
              >
                <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-lcd-soft">{c.label}</h3>
                <div className="flex h-[196px] gap-3" aria-hidden>
                  {/* LED ladder, bottom up; the top two lit segments burn brightest. */}
                  <div className="flex w-4 flex-col-reverse gap-[3px]">
                    {Array.from({ length: SEGMENTS }, (_, i) => {
                      const on = i < lit
                      const peak = on && i >= lit - 2
                      return (
                        <span
                          key={i}
                          className="block flex-1 rounded-[1.5px]"
                          style={{
                            background: on ? (peak ? '#FF8A55' : '#E85A1E') : '#2A2C28',
                            boxShadow: peak ? '0 0 8px rgba(255,120,60,0.8)' : undefined,
                          }}
                        />
                      )
                    })}
                  </div>
                  {/* Fader, parked at the score. */}
                  <div className="relative w-6">
                    <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-sm bg-[#0B0C0A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]" />
                    <div
                      className="absolute inset-x-0 -mb-[15px] h-[30px] rounded"
                      style={{
                        bottom: `${score === null ? 0 : Math.max(0, Math.min(100, score))}%`,
                        background: 'linear-gradient(#F4F2ED, #C9C4B9)',
                        boxShadow: '0 3px 6px rgba(0,0,0,0.5), inset 0 1px 0 #fff',
                      }}
                    >
                      <span className="absolute inset-x-[3px] top-[14px] h-0.5 bg-brand-500" />
                    </div>
                  </div>
                </div>
                <div className="font-mono text-[34px] font-medium leading-none tracking-[-0.03em] tabular-nums">
                  {score === null ? '--' : Math.round(score)}
                </div>
                <div className="text-center font-mono text-[11px] uppercase leading-normal text-lcd-soft">
                  {c.rawMetric(metrics)}
                  <br />
                  <span className="text-[#FF8A55]">
                    +{score === null ? '0.0' : (score * weight).toFixed(1)} / {Math.round(weight * 100)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </Module>
    </div>
  )
}
