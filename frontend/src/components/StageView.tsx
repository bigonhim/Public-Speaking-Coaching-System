// The immersive "on stage" view shown while recording. A full-screen dark
// auditorium: the topic reminder and running clock up top, a large reacting
// audience filling the centre, live captions below, and a slim mic-level +
// stop control at the foot. The parent (PracticePage) still owns the recorder
// and analysis lifecycle — this is presentation.

import { VirtualAudience } from './VirtualAudience'
import { LiveTranscript } from './LiveTranscript'
import { formatDuration } from '../lib/scoring'

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
}: Props) {
  const pct = Math.round(volume * 100)
  const belowMin = elapsedSec < minSec
  // Smaller faces for a fuller house so the crowd still fits comfortably.
  const faceSize = roomSize >= 12 ? 84 : roomSize >= 9 ? 96 : roomSize >= 6 ? 116 : 132

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gradient-to-b from-ink-950 via-brand-950 to-ink-950 text-white">
      {/* stage light from above */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(122,80,255,0.28), transparent 70%)' }}
        aria-hidden
      />

      {/* Top: topic reminder + running clock */}
      <div className="relative flex items-center justify-between gap-4 px-5 py-4 sm:px-10 sm:py-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-200/70">
            Speaking on
          </p>
          <p className="truncate text-sm font-semibold text-white/90 sm:text-lg">{topic}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 rounded-full bg-white/10 px-3.5 py-1.5 ring-1 ring-white/15">
          <span className="relative flex h-2.5 w-2.5">
            {speaking && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-accent-400 animate-ping" />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                speaking ? 'bg-accent-500' : 'bg-accent-300/50'
              }`}
            />
          </span>
          <span className="font-display text-lg font-bold tabular-nums">
            {formatDuration(elapsedSec)}
          </span>
        </div>
      </div>

      {/* Centre: the audience, the star of the show */}
      <div className="relative flex flex-1 items-center justify-center px-4 sm:px-10">
        <VirtualAudience engagement={engagement} size={roomSize} faceSize={faceSize} bare />
      </div>

      {/* Live captions */}
      <div className="relative px-4 sm:px-10">
        <LiveTranscript finalText={finalText} interim={interim} supported={transcriptSupported} />
      </div>

      {/* Foot: mic level + stop */}
      <div className="relative flex flex-col items-center gap-3 px-4 py-6 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            {/* comfortable projection band */}
            <div className="absolute inset-y-0 left-[15%] w-[70%] bg-emerald-400/15" aria-hidden />
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-brand-400 via-brand-400 to-accent-400 transition-[width] duration-100"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-center text-xs text-white/40">Keep your voice in the green band</p>
        </div>
        <button onClick={onStop} className="btn-accent px-8 py-3.5 text-base">
          <span className="h-3 w-3 rounded-[3px] bg-white" /> Stop &amp; analyze
        </button>
        {belowMin && (
          <p className="-mt-1 text-xs text-white/40">Aim for at least {minSec}s for a full read.</p>
        )}
      </div>
    </div>
  )
}
