// Reveals a quote word by word, at roughly the speed someone would say it.
//
// Each word is its own inline-block so lines still wrap normally; the spacing
// is a margin rather than a non-breaking space, which would glue the quote into
// one unbreakable line on narrow screens.

import { useMemo } from 'react'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

interface Props {
  text: string
  className?: string
  /** Seconds between words. */
  stagger?: number
}

export function QuoteReveal({ text, className = '', stagger = 0.055 }: Props) {
  const still = usePrefersReducedMotion()
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text])

  if (still) return <span className={className}>“{text}”</span>

  return (
    // The quotation marks are decorative here; the plain text is exposed to
    // assistive tech in one piece rather than as 30 separate word fragments.
    <span className={className}>
      <span aria-hidden>
        {words.map((word, i) => (
          <span
            key={`${word}-${i}`}
            className="mr-[0.26em] inline-block animate-word-rise"
            style={{ animationDelay: `${(i * stagger).toFixed(3)}s` }}
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
