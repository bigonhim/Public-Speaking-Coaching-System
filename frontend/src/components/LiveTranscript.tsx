// Live captions on the console's display while recording. Final words read
// solid, the in-flight guess trails off dimmer, and the panel auto-scrolls to
// keep the latest words in view. Speaker-facing only — see
// useSpeechTranscription.

import { useEffect, useRef } from 'react'

interface Props {
  finalText: string
  interim: string
  supported: boolean
  /** Height of the scrolling caption box. */
  className?: string
}

export function LiveTranscript({ finalText, interim, supported, className = 'h-24 sm:h-28' }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep the newest words in view as the transcript grows.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [finalText, interim])

  const empty = !finalText && !interim

  return (
    <div className="border-t border-white/10 pt-3">
      <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-lcd-dim">
        <span className="h-1.5 w-1.5 rounded-full bg-[#FF5B1F] motion-safe:animate-blink" aria-hidden />
        Live transcript
      </div>
      <div ref={scrollRef} className={`overflow-y-auto font-mono text-[13px] leading-relaxed ${className}`}>
        {!supported ? (
          <p className="text-lcd-dim">
            Live captions aren’t supported in this browser — your full transcript still appears in
            your results.
          </p>
        ) : empty ? (
          <p className="text-lcd-dim">Your words will appear here as you speak…</p>
        ) : (
          <p className="text-lcd-text">
            {finalText} <span className="text-lcd-dim">{interim}</span>
            <span className="ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 bg-lcd-glow motion-safe:animate-blink" aria-hidden />
          </p>
        )}
      </div>
    </div>
  )
}
