// Sets a quote at display size and lights it word by word as it is spoken.
//
// The whole line is on screen from the start, dimmed, so it can be read ahead
// of the voice; `spoken` says how many words the speaker has reached. The
// caller drives that from the clip's playhead, so the text keeps time with the
// audio rather than with a clock of its own.
//
// Each word is its own inline-block so lines still wrap normally; the spacing
// is a margin rather than a non-breaking space, which would glue the quote into
// one unbreakable line on narrow screens.

import { useMemo } from 'react'
import { quoteWords } from '../../data/voices'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

interface Props {
  text: string
  className?: string
  /** How many words have been spoken so far. Omit to set the line fully lit. */
  spoken?: number
}

export function QuoteReveal({ text, className = '', spoken }: Props) {
  const still = usePrefersReducedMotion()
  const words = useMemo(() => quoteWords(text), [text])

  if (still || spoken === undefined) return <span className={className}>“{text}”</span>

  return (
    // The quotation marks are decorative here; the plain text is exposed to
    // assistive tech in one piece rather than as 30 separate word fragments.
    <span className={className}>
      <span aria-hidden>
        {words.map((word, i) => (
          <span
            key={`${word}-${i}`}
            className={`mr-[0.26em] inline-block transition-[opacity,transform] duration-300 ease-out ${
              i < spoken ? 'opacity-100' : 'translate-y-[0.06em] opacity-25'
            }`}
          >
            {i === 0 ? `“${word}` : word}
            {i === words.length - 1 ? '”' : ''}
          </span>
        ))}
      </span>
      <span className="sr-only">“{text}”</span>
    </span>
  )
}
