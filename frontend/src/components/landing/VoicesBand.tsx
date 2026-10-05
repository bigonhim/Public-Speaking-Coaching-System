// The landing page's one dark band: a line from the Hall of Voices and the
// craft note that goes with it.
//
// Text only, on purpose. The reel behind sign-in plays recordings; a public
// page quotes the words with attribution and leaves the recordings out (see
// public/voices/README.md, "Before you ship this publicly").

import { useState } from 'react'
import { VOICES } from '../../data/voices'

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

export function VoicesBand() {
  const [index, setIndex] = useState(0)
  const voice = VOICES[index]
  const count = COUNT_WORDS[VOICES.length] ?? String(VOICES.length)

  return (
    <section className="bg-ink-950 text-white">
      <div className="wrap band">
        <div className="max-w-2xl">
          <p className="eyebrow text-brand-300">The Hall of Voices</p>
          <h2 className="h-section mt-4 text-white">Every one of them practised.</h2>
          <p className="lede mt-5 text-white/65">
            {count} speakers open the app when you sign in: one line each, and a note on the craft
            behind it. It is the same craft Cadence measures in you.
          </p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[13rem_1fr] lg:gap-16">
          <div
            role="group"
            aria-label="Choose a speaker"
            className="-mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:flex-col
                       lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {VOICES.map((v, i) => (
              <button
                key={v.id}
                onClick={() => setIndex(i)}
                aria-pressed={i === index}
                className={`shrink-0 rounded-lg px-3.5 py-2.5 text-left text-sm font-medium transition-colors
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
                              i === index
                                ? 'bg-white/10 text-white'
                                : 'text-white/55 hover:bg-white/5 hover:text-white'
                            }`}
              >
                {v.speaker}
                <span className="block text-xs font-normal text-white/40">{v.year}</span>
              </button>
            ))}
          </div>

          {/* Tall enough for the longest line, so choosing a speaker never
              moves the page underneath the reader. */}
          <div aria-live="polite" className="lg:min-h-[23rem]">
            <figure key={voice.id} className="animate-fade-in">
              <blockquote className="font-display text-[1.625rem] leading-[1.28] tracking-[-0.01em] sm:text-4xl sm:leading-[1.22]">
                “{voice.quote}”
              </blockquote>
              <figcaption className="mt-6 text-sm text-white/60">
                <span className="font-semibold text-white">{voice.speaker}</span> · {voice.occasion},{' '}
                {voice.year}
              </figcaption>
              <div className="mt-8 max-w-xl border-l-2 border-brand-400 pl-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-300">
                  {voice.craft.technique}
                </p>
                <p className="mt-2 leading-relaxed text-white/75">{voice.craft.note}</p>
              </div>
            </figure>
          </div>
        </div>
      </div>
    </section>
  )
}
