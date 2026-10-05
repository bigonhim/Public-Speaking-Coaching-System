// The console in record mode, shown full-screen while a take is recording so
// nothing else on the page can be clicked away to mid-take. The audience gets
// the big monitor; the clock, topic and live captions share the display beside
// it; the transport row carries the two meters and the lit STOP button.
// The parent (PracticePage) still owns the recorder and analysis lifecycle —
// this is presentation.

import { VirtualAudience } from './VirtualAudience'
import { LiveTranscript } from './LiveTranscript'
import { Chassis, LevelMeter, Module, PaceMeter, RecButton } from './ui/Hardware'
import { Wordmark } from './ui/Logo'
import { formatClock } from '../lib/scoring'

interface Props {
  topic: string
  roomSize: number
  engagement: number
  elapsedSec: number
  volume: number // 0..1
  speaking: boolean
  finalText: string
  interim: string
  transcriptSupported: boolean
  onStop: () => void
  minSec?: number
  /** The scorer's pace band, words a minute. */
  paceTarget?: [number, number]
}

// The pace needle waits until there is enough speech to average over; before
// that it would swing on the first two words.
const PACE_SETTLE_SEC = 8
const PACE_SETTLE_WORDS = 8

/** Words a minute so far, from the live captions. A rough guide only: the
 *  scored pace comes from the full transcription afterwards. */
function livePace(finalText: string, interim: string, elapsedSec: number): number | null {
  const words = `${finalText} ${interim}`.trim().split(/\s+/).filter(Boolean).length
  if (elapsedSec < PACE_SETTLE_SEC || words < PACE_SETTLE_WORDS) return null
  return (words / elapsedSec) * 60
}

export function StageView({
  topic,
  roomSize,
  engagement,
  elapsedSec,
  volume,
  speaking,
  finalText,
  interim,
  transcriptSupported,
  onStop,
  minSec = 45,
  paceTarget = [120, 150],
}: Props) {
  const belowMin = elapsedSec < minSec
  const wpm = transcriptSupported ? livePace(finalText, interim, elapsedSec) : null
  // Smaller faces for a fuller house so the crowd still fits the monitor.
  const faceSize = roomSize >= 12 ? 72 : roomSize >= 9 ? 84 : roomSize >= 6 ? 96 : 116

  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-canvas"
      style={{ backgroundImage: 'radial-gradient(ellipse 85% 60% at 30% 0%, #efede8, #d9d6cf 58%, #ccc8c0)' }}
    >
      <div className="mx-auto flex min-h-full max-w-[1240px] flex-col px-4 py-5 sm:px-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <Wordmark tagline />
          <div className="lcd flex h-11 items-center gap-3 rounded-[10px] px-4 font-mono">
            <span className="lcd-glow flex items-center gap-2 text-xs uppercase tracking-[0.14em]">
              <span
                className={`h-2 w-2 rounded-full bg-[#FF5B1F] shadow-[0_0_8px_#FF5B1F] ${
                  speaking ? '' : 'motion-safe:animate-blink'
                }`}
                aria-hidden
              />
              Rec
            </span>
            <span className="text-[15px] tabular-nums text-lcd-text">{formatClock(elapsedSec, true)}</span>
          </div>
        </div>

        <Chassis className="animate-fade-in">
          <div className="flex flex-wrap gap-4 sm:gap-[22px]">
            <Module
              label="02 · Room"
              aside={roomSize === 0 ? 'Empty' : `${roomSize} listening`}
              className="flex flex-[7_1_520px] flex-col"
            >
              <div className="lcd flex min-h-[300px] flex-1 items-center justify-center px-4 py-6">
                <div
                  className="pointer-events-none absolute inset-0 -z-[1]"
                  style={{ background: 'radial-gradient(ellipse 70% 80% at 50% 40%, rgba(255,140,80,0.10), transparent 70%)' }}
                  aria-hidden
                />
                <VirtualAudience engagement={engagement} size={roomSize} faceSize={faceSize} />
              </div>
            </Module>

            <Module label="01 · On air" className="flex flex-[5_1_380px] flex-col">
              <div className="lcd flex flex-1 flex-col px-5 py-5 sm:px-6">
                <p className="text-sm leading-snug text-lcd-soft">{topic}</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 font-mono">
                  <span
                    className="lcd-glow text-[64px] font-medium leading-none tracking-[-0.04em] tabular-nums sm:text-[84px]"
                    role="timer"
                    aria-label={`Recording time ${formatClock(elapsedSec)}`}
                  >
                    {formatClock(elapsedSec, true)}
                  </span>
                  <span className="text-xs uppercase tracking-[0.12em] text-lcd-dim">
                    {belowMin ? `min ${formatClock(minSec, true)}` : 'long enough to score'}
                  </span>
                </div>
                <div className="mt-auto pt-4">
                  <LiveTranscript
                    finalText={finalText}
                    interim={interim}
                    supported={transcriptSupported}
                    className="h-28 sm:h-36"
                  />
                </div>
              </div>
            </Module>
          </div>

          <Module label="03 · Transport" className="mt-4 sm:mt-[22px]">
            <div className="flex flex-wrap items-center justify-around gap-x-7 gap-y-6">
              <div className="flex w-full max-w-[280px] flex-col items-center gap-2.5">
                <LevelMeter volume={volume} />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-500">
                  Keep the needle in the band
                </span>
              </div>
              <div className="flex flex-col items-center gap-3.5">
                <RecButton live onClick={onStop} label="Stop and score this take" />
                <span className="max-w-[240px] text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-500">
                  {belowMin ? `Aim for at least ${minSec}s for a full read` : 'Press to stop · scored when you stop'}
                </span>
              </div>
              <div className="flex w-full max-w-[280px] flex-col items-center gap-2.5">
                <PaceMeter wpm={wpm} target={paceTarget} />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-500">
                  {!transcriptSupported
                    ? 'Pace needs live captions'
                    : wpm === null
                      ? 'Pace · listening…'
                      : `Pace · about ${Math.round(wpm)} wpm`}
                </span>
              </div>
            </div>
          </Module>
        </Chassis>
      </div>
    </div>
  )
}
