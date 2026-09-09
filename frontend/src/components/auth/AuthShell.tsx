// The frame both /login and /register sit in.
//
// Left: a dark stage panel that quietly previews what happens after sign-in —
// the same voices, the same waveform language as the reel. Right: the form.
// Below lg the stage collapses to a compact band so the form is above the fold
// on a phone rather than pushed off it by decoration.

import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Wordmark } from '../ui/Logo'
import { Waveform } from '../ui/Waveform'
import { VOICES } from '../../data/voices'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'

const ROTATE_MS = 7000

const PROOF_POINTS = [
  { icon: '🎯', label: 'Pace, fillers, pauses & relevance — scored every take' },
  { icon: '👥', label: 'A virtual room that reacts while you speak' },
  { icon: '📈', label: 'Climb from Novice to Master Orator' },
]

/** Cycles a line from the reel behind the sign-in form. */
function RotatingVoice() {
  const still = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (still) return
    const id = setInterval(() => setIndex((i) => (i + 1) % VOICES.length), ROTATE_MS)
    return () => clearInterval(id)
  }, [still])

  const voice = VOICES[index]
  return (
    // `key` restarts the entrance animation on every change.
    <figure key={voice.id} className="animate-fade-up">
      <blockquote className="font-display text-[1.35rem] font-semibold leading-snug text-white/90 xl:text-2xl">
        “{voice.quote}”
      </blockquote>
      <figcaption className="mt-4 flex items-center gap-3">
        <span
          className="h-9 w-0.5 rounded-full"
          style={{ background: voice.accent }}
          aria-hidden
        />
        <span>
          <span className="block text-sm font-bold text-white">{voice.speaker}</span>
          <span className="block text-xs text-white/50">
            {voice.occasion} · {voice.year}
          </span>
        </span>
      </figcaption>
    </figure>
  )
}

interface Props {
  /** Small label above the heading, e.g. "Welcome back". */
  eyebrow: string
  title: ReactNode
  subtitle: ReactNode
  children: ReactNode
  /** The "no account yet?" / "already have one?" line under the form. */
  footer: ReactNode
}

export function AuthShell({ eyebrow, title, subtitle, children, footer }: Props) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.04fr_0.96fr]">
      {/* --- The stage (lg and up) --------------------------------------- */}
      <aside className="relative hidden overflow-hidden bg-gradient-stage-dark p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          className="pointer-events-none absolute -right-24 -top-28 h-96 w-96 rounded-full opacity-70 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(122,80,255,0.62), transparent 65%)' }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-16 h-96 w-96 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(255,86,48,0.5), transparent 65%)' }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.09]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '52px 52px',
            maskImage: 'radial-gradient(80% 60% at 50% 20%, #000, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(80% 60% at 50% 20%, #000, transparent 75%)',
          }}
          aria-hidden
        />

        <div className="relative">
          <Link to="/login" className="inline-block transition hover:opacity-90">
            <Wordmark tone="light" />
          </Link>
        </div>

        <div className="relative max-w-lg">
          <span className="eyebrow text-brand-200">The room is waiting</span>
          <h2 className="mt-4 font-display text-[2.6rem] font-bold leading-[1.05] tracking-tight xl:text-5xl">
            Every great speaker
            <br />
            <span className="bg-gradient-to-r from-brand-300 via-accent-300 to-brand-200 bg-clip-text text-transparent">
              started with a first take.
            </span>
          </h2>
          <div className="mt-9 border-t border-white/10 pt-8">
            <RotatingVoice />
          </div>
        </div>

        <div className="relative">
          <ul className="space-y-2.5">
            {PROOF_POINTS.map((p) => (
              <li key={p.label} className="flex items-center gap-3 text-sm text-white/65">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs"
                  aria-hidden
                >
                  {p.icon}
                </span>
                {p.label}
              </li>
            ))}
          </ul>
          <div className="mt-8 h-12 text-white/15">
            <Waveform bars={72} seed={19} minHeight={0.1} />
          </div>
        </div>
      </aside>

      {/* --- The form ---------------------------------------------------- */}
      <main className="flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-12 xl:px-20">
        {/* Compact brand band, phones and tablets only. */}
        <div className="mb-8 flex items-center justify-between lg:hidden">
          <Wordmark />
          <div className="h-8 w-24 text-brand-300">
            <Waveform bars={22} seed={19} minHeight={0.15} />
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <header className="animate-fade-up">
            <span className="eyebrow">{eyebrow}</span>
            <h1 className="mt-3 font-display text-[2rem] font-bold leading-tight tracking-tight text-ink-900 sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-500">{subtitle}</p>
          </header>

          <div className="mt-8">{children}</div>

          <div className="mt-8 border-t border-ink-900/[0.07] pt-6 text-sm text-ink-500">
            {footer}
          </div>
        </div>
      </main>
    </div>
  )
}
