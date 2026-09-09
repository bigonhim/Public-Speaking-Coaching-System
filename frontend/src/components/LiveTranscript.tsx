// Teleprompter-style live captions for the stage. Final words read solid,
// the in-flight guess trails off dimmer, and the panel auto-scrolls to keep the
// latest words in view. Speaker-facing only — see useSpeechTranscription.

import { useEffect, useRef } from 'react'

interface Props {
  finalText: string
  interim: string
  supported: boolean
}

export function LiveTranscript({ finalText, interim, supported }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep the newest words in view as the transcript grows.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [finalText, interim])

  const empty = !finalText && !interim

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-2 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Live transcript
      </div>
      <div
        ref={scrollRef}
        className="h-28 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center backdrop-blur sm:h-32"
      >
        {!supported ? (
          <p className="mt-4 text-sm text-white/40">
            Live captions aren’t supported in this browser — your full transcript still
            appears in your results.
          </p>
        ) : empty ? (
          <p className="mt-4 text-sm text-white/35">Your words will appear here as you speak…</p>
        ) : (
          <p className="text-lg leading-relaxed text-white/85">
            {finalText}{' '}
            <span className="text-white/45">{interim}</span>
            <span className="ml-0.5 inline-block h-5 w-0.5 translate-y-1 animate-pulse bg-brand-300 align-middle" />
          </p>
        )}
      </div>
    </div>
  )
}
