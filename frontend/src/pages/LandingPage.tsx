// The public landing page — what a signed-out visitor sees at `/`.
//
// It is one story told in seven bands, each with its own background so the
// page reads as distinct sections rather than a stack of cards:
//
//   1. Hero            the promise, and the real audience reacting
//   2. The problem     you cannot hear yourself the way a room does
//   3. How it works    breathe, speak, review
//   4. What we measure the four numbers, and a sample take
//   5. The voices      a line from the reel, with its craft note
//   6. The climb       the seven levels
//   7. The close       the call to sign up
//
// Everything stated here is something the app does. There are no testimonials,
// user counts or pricing claims, because there is nothing real to put in them.

import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { AudienceFace } from '../components/AudienceFace'
import { RoomDemo } from '../components/landing/RoomDemo'
import { VoicesBand } from '../components/landing/VoicesBand'
import { Wordmark } from '../components/ui/Logo'
import { LADDER } from '../lib/levels'
import { COMPONENTS, verdict } from '../lib/scoring'

// --- Content ------------------------------------------------------------------

// One row per thing Cadence measures: how a habit feels from the inside, and
// how it lands. Illustrative, not measurements of anyone.
const GAPS = [
  { feels: 'Energetic', hears: '170 words a minute, too fast to follow' },
  { feels: 'Thinking out loud', hears: '“Um”, “like”, “you know”' },
  { feels: 'A dramatic pause', hears: 'Four seconds of dead air' },
  { feels: 'Covering everything', hears: 'Wandering off the topic' },
]

// A sample results sheet. The scores are what backend/coach/services/scoring.py
// returns for these measurements under config/scoring.yaml, and the note is the
// one feedback.py writes for them — so the example is a take the app could
// really produce, not numbers picked to look good.
const SAMPLE = {
  topic: 'Describe a person who changed the way you think.',
  meta: '1m 3s · 170 words',
  overall: 83,
  parts: [
    { key: 'pace', raw: '162 words a minute', score: 82 },
    { key: 'filler', raw: '2 in the take', score: 87 },
    { key: 'pause', raw: '1 pause over 3 seconds', score: 85 },
    { key: 'relevance', raw: 'Mostly on topic', score: 80 },
  ],
  note: 'You spoke quite fast (162 wpm). Aim for 120–150 — try pausing at full stops.',
}

// What unlocks each rung, in plain words. Mirrors the `levels:` block of
// backend/coach/config/scoring.yaml; update both together.
const UNLOCKS: Record<number, string> = {
  1: 'Record your first full take.',
  2: 'Three takes in, beat your first score by five points.',
  3: 'Pace in range in three of your last five takes.',
  4: 'Few fillers in three of your last five.',
  5: 'Strongly on topic in three of your last five.',
  6: 'Two takes at 80 or more, with every area at 70 or more.',
  7: 'Score 85 or more in four of your last five.',
}

// --- Small pieces -------------------------------------------------------------

function SignUpLink({ className = 'btn-primary btn-lg' }: { className?: string }) {
  return (
    <Link to="/register" className={className}>
      Create your account
      <ArrowRight size={18} aria-hidden />
    </Link>
  )
}

/** The white frame each "how it works" step is illustrated in. */
function Vignette({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-44 items-center justify-center rounded-2xl border border-brand-100 bg-white"
      aria-hidden
    >
      {children}
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${score}%` }} />
    </div>
  )
}

// --- Page -----------------------------------------------------------------------

export function LandingPage() {
  return (
    <div className="bg-white">
      <header className="sticky top-0 z-40 border-b border-ink-900/[0.07] bg-white/90 backdrop-blur">
        <div className="wrap flex h-16 items-center justify-between gap-4">
          <Link to="/" className="transition-opacity hover:opacity-80" aria-label="Cadence home">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-ink-600 md:flex">
            <a href="#how" className="transition-colors hover:text-ink-950">How it works</a>
            <a href="#measure" className="transition-colors hover:text-ink-950">What we measure</a>
            <a href="#climb" className="transition-colors hover:text-ink-950">The climb</a>
          </nav>
          {/* On a phone the header keeps only "Sign in": the sign-up button is
              the first thing in the hero, directly underneath. */}
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn-ghost sm:bg-transparent sm:ring-0 sm:hover:bg-ink-50">
              Sign in
            </Link>
            <Link to="/register" className="btn-primary hidden sm:inline-flex">
              Create account
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* 1 — Hero ------------------------------------------------------- */}
        <section className="bg-gradient-to-b from-white to-brand-50">
          <div className="wrap grid gap-14 pb-20 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:pb-28 lg:pt-24">
            <div className="animate-fade-up">
              <p className="eyebrow">A speaking coach for spoken practice</p>
              <h1 className="h-hero mt-5">
                Say it out loud, to a room that{' '}
                <em className="whitespace-nowrap text-brand-600">listens back.</em>
              </h1>
              <p className="lede mt-6 max-w-xl">
                Cadence gives you a topic and a virtual audience that reacts to your voice as you
                speak. When you stop, you get a score you can explain: pace, fillers, pauses and
                relevance.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <SignUpLink />
                <Link to="/login" className="btn-ghost btn-lg">
                  Sign in
                </Link>
              </div>
              <p className="mt-5 text-sm text-ink-500">
                Talk for a minute or more. All you need is a microphone.
              </p>
            </div>
            <RoomDemo />
          </div>
        </section>

        {/* 2 — The problem ------------------------------------------------ */}
        <section className="bg-white">
          <div className="wrap band grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-20">
            <div>
              <p className="eyebrow">The problem</p>
              <h2 className="h-section mt-4">You can’t hear yourself the way a room does.</h2>
              <p className="lede mt-6">
                Speaking feels different from the inside than it sounds from a seat. Rehearsing in
                your head hides exactly the habits an audience notices first, so most of us only
                find out in front of real people.
              </p>
            </div>
            <div>
              <div className="grid grid-cols-[1fr_1.5fr] gap-x-6 pb-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
                <span>How it feels</span>
                <span>What the room hears</span>
              </div>
              <dl>
                {GAPS.map((gap) => (
                  <div
                    key={gap.feels}
                    className="grid grid-cols-[1fr_1.5fr] items-baseline gap-x-6 border-t border-ink-900/10 py-5"
                  >
                    <dt className="text-ink-500">{gap.feels}</dt>
                    <dd className="font-display text-xl leading-snug text-ink-950 sm:text-2xl">
                      {gap.hears}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* 3 — How a take works ------------------------------------------- */}
        <section id="how" className="scroll-mt-16 bg-brand-50">
          <div className="wrap band">
            <div className="max-w-2xl">
              <p className="eyebrow">How it works</p>
              <h2 className="h-section mt-4">One take, three steps.</h2>
            </div>
            <ol className="mt-14 grid gap-12 md:grid-cols-3 md:gap-8">
              <li>
                <Vignette>
                  <span className="relative flex h-28 w-28 items-center justify-center">
                    <span className="absolute inset-0 rounded-full bg-brand-100" />
                    <span className="absolute inset-4 rounded-full bg-brand-200 motion-safe:animate-[breathe_8s_ease-in-out_infinite]" />
                    <span className="relative h-10 w-10 rounded-full bg-brand-600" />
                  </span>
                </Vignette>
                <p className="mt-6 font-display text-lg text-brand-600">01</p>
                <h3 className="mt-1 font-display text-2xl font-medium text-ink-950">Breathe</h3>
                <p className="mt-3 leading-relaxed text-ink-600">
                  A short breathing warm-up and a three-two-one countdown settle you before the
                  recording starts. Skip it whenever you like.
                </p>
              </li>
              <li>
                <Vignette>
                  <span className="flex items-end gap-3">
                    <AudienceFace seed="member-0-3" state="attentive" size={64} phase={0} />
                    <AudienceFace seed="member-1-3" state="nodding" size={72} phase={0.4} />
                    <AudienceFace seed="member-2-3" state="attentive" size={64} phase={0.7} />
                  </span>
                </Vignette>
                <p className="mt-6 font-display text-lg text-brand-600">02</p>
                <h3 className="mt-1 font-display text-2xl font-medium text-ink-950">Speak</h3>
                <p className="mt-3 leading-relaxed text-ink-600">
                  You get a topic and talk for at least a minute, longer if you can. The audience reacts to how you sound as you
                  go, never to your words.
                </p>
              </li>
              <li>
                <Vignette>
                  <span className="flex items-center gap-7">
                    <span className="font-display text-6xl font-medium tracking-tight text-ink-950">
                      {SAMPLE.overall}
                    </span>
                    <span className="flex w-24 flex-col gap-2.5">
                      {SAMPLE.parts.map((part) => (
                        <ScoreBar key={part.key} score={part.score} />
                      ))}
                    </span>
                  </span>
                </Vignette>
                <p className="mt-6 font-display text-lg text-brand-600">03</p>
                <h3 className="mt-1 font-display text-2xl font-medium text-ink-950">Review</h3>
                <p className="mt-3 leading-relaxed text-ink-600">
                  Your take is transcribed and scored out of 100, with the measurement behind every
                  number and notes on what to work on next.
                </p>
              </li>
            </ol>
          </div>
        </section>

        {/* 4 — What we measure -------------------------------------------- */}
        <section id="measure" className="scroll-mt-16 bg-white">
          <div className="wrap band grid gap-14 lg:grid-cols-2 lg:gap-20">
            <div>
              <p className="eyebrow">What we measure</p>
              <h2 className="h-section mt-4">Four numbers, and you can check every one.</h2>
              <p className="lede mt-6">
                No mystery score. Each take is measured on four things, and the results show the
                raw measurement next to every number it produced.
              </p>
              <dl className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
                {COMPONENTS.map((c) => (
                  <div key={c.key} className="border-t border-ink-900/10 pt-4">
                    <dt className="font-display text-xl font-medium text-ink-950">{c.label}</dt>
                    <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-600">{c.blurb}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <figure className="card self-start overflow-hidden shadow-lift">
              <div className="flex items-start justify-between gap-4 border-b border-ink-900/[0.07] px-6 py-5">
                <div className="min-w-0">
                  <p className="font-display text-lg leading-snug text-ink-950">{SAMPLE.topic}</p>
                  <p className="mt-1 text-sm text-ink-500">{SAMPLE.meta}</p>
                </div>
                <span className="chip shrink-0 py-1 text-xs">Sample take</span>
              </div>
              <div className="flex items-baseline gap-3 px-6 pt-6">
                <span className="font-display text-7xl font-medium leading-none tracking-tight text-ink-950">
                  {SAMPLE.overall}
                </span>
                <span className="text-ink-500">out of 100</span>
                <span className="ml-auto rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">
                  {verdict(SAMPLE.overall).label}
                </span>
              </div>
              <ul className="mt-6 px-6">
                {SAMPLE.parts.map((part) => {
                  const meta = COMPONENTS.find((c) => c.key === part.key)
                  return (
                    <li key={part.key} className="border-t border-ink-900/[0.07] py-4">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="font-semibold text-ink-900">{meta?.label}</span>
                        <span className="font-semibold tabular-nums text-ink-900">{part.score}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-ink-500">{part.raw}</p>
                      <div className="mt-2.5">
                        <ScoreBar score={part.score} />
                      </div>
                    </li>
                  )
                })}
              </ul>
              <figcaption className="border-t border-ink-900/[0.07] bg-brand-50/60 px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                  Coaching note
                </p>
                <p className="mt-1.5 leading-relaxed text-ink-800">{SAMPLE.note}</p>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* 5 — The voices ------------------------------------------------- */}
        <VoicesBand />

        {/* 6 — The climb -------------------------------------------------- */}
        <section id="climb" className="scroll-mt-16 bg-brand-50">
          <div className="wrap band">
            <div className="max-w-2xl">
              <p className="eyebrow">The climb</p>
              <h2 className="h-section mt-4">Seven levels, earned by how you speak.</h2>
              <p className="lede mt-5">
                Each level unlocks on something specific your takes show. Once you have earned one,
                it is yours: levels never go back down.
              </p>
            </div>
            <ol className="mt-14 grid gap-y-8 lg:grid-cols-7 lg:gap-x-4">
              {LADDER.map((rung, i) => {
                const summit = i === LADDER.length - 1
                return (
                  <li key={rung.level} className="relative flex gap-5 lg:block">
                    {/* The line to the next rung: down the side on a phone,
                        across the top on a desktop. */}
                    {!summit && (
                      <span
                        className="absolute left-5 top-10 h-[calc(100%-0.5rem)] w-px bg-brand-200
                                   lg:left-10 lg:top-5 lg:h-px lg:w-[calc(100%-1.5rem)]"
                        aria-hidden
                      />
                    )}
                    <span
                      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-lg ${
                        summit
                          ? 'bg-brand-600 text-white'
                          : 'border border-brand-200 bg-white text-brand-700'
                      }`}
                    >
                      {rung.level}
                    </span>
                    <div className="lg:mt-5 lg:pr-2">
                      {/* "The Communicator" is too long for a seventh of the
                          row; the article adds nothing in a list of seven. */}
                      <h3 className="font-display text-xl font-medium leading-tight text-ink-950 lg:text-lg">
                        {rung.name.replace(/^The /, '')}
                      </h3>
                      <p className="mt-1.5 text-sm leading-snug text-ink-600">
                        {UNLOCKS[rung.level]}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        {/* 7 — The close -------------------------------------------------- */}
        <section className="bg-brand-700 text-white">
          <div className="wrap band text-center">
            <h2 className="h-section mx-auto max-w-2xl text-white">
              Your first take is a minute away.
            </h2>
            <p className="lede mx-auto mt-5 max-w-xl text-white/75">
              Create an account, take a topic, and hear what the room hears.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
              <SignUpLink className="btn btn-lg bg-white text-brand-700 hover:bg-brand-50 focus-visible:ring-white focus-visible:ring-offset-brand-700" />
              <Link
                to="/login"
                className="text-sm font-semibold text-white underline-offset-4 hover:underline"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white">
        <div className="wrap flex flex-col items-center justify-between gap-5 py-10 sm:flex-row">
          <div className="flex items-center gap-4">
            <Wordmark size={28} />
            <span className="hidden text-sm text-ink-500 sm:inline">
              Speaking practice, one take at a time.
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm font-medium text-ink-600">
            <Link to="/login" className="transition-colors hover:text-ink-950">Sign in</Link>
            <Link to="/register" className="transition-colors hover:text-ink-950">Create account</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
