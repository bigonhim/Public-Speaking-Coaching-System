// The console's building blocks. Every redesigned screen is a chassis holding
// modules; a module is a recessed plate with a printed label, usually holding a
// dark display (`.lcd`) and a row of keys. The look itself lives in index.css
// (.chassis, .plate, .lcd, .key) so plain markup can use it too.

import { useId, type ReactNode } from 'react'

/** The machined case, with a screw in each corner. */
export function Chassis({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`chassis p-4 sm:p-[34px] ${className}`}>
      <span className="screw left-[13px] top-[13px] hidden [--screw:35deg] sm:block" aria-hidden />
      <span className="screw right-[13px] top-[13px] hidden [--screw:-20deg] sm:block" aria-hidden />
      <span className="screw bottom-[13px] left-[13px] hidden [--screw:70deg] sm:block" aria-hidden />
      <span className="screw bottom-[13px] right-[13px] hidden [--screw:10deg] sm:block" aria-hidden />
      {children}
    </div>
  )
}

interface ModuleProps {
  /** Printed along the top, e.g. "01 · Topic". Doubles as the section heading. */
  label: string
  /** Printed at the right end of the label row. */
  aside?: ReactNode
  children: ReactNode
  className?: string
  /** The label's heading level. */
  heading?: 'h1' | 'h2'
}

/** A recessed plate on the chassis with its printed label. */
export function Module({ label, aside, children, className = '', heading: Heading = 'h2' }: ModuleProps) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={`plate min-w-0 p-4 sm:px-5 sm:pb-5 sm:pt-[18px] ${className}`}>
      <div className="module-label">
        <Heading id={id}>{label}</Heading>
        {aside !== undefined && <span className="shrink-0 whitespace-nowrap text-right">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

// --- VU meter -------------------------------------------------------------------

interface Tick {
  /** Position along the scale, 0..1. */
  at: number
  label?: string
}

interface VuMeterProps {
  /** Needle position along the scale, 0..1. Null parks it below the scale. */
  value: number | null
  /** Printed on the meter face, e.g. "PACE · WPM". */
  title: string
  ticks: Tick[]
  /** The stretch of the scale to aim for, 0..1 at each end. */
  band?: [number, number]
  className?: string
}

// Geometry, in the face's 280×150 viewBox: the needle pivots just below the
// bottom edge and sweeps ±50° across an arc of radius 120.
const PIVOT_X = 140
const PIVOT_Y = 160
const SWEEP = 50

function arcPoint(at: number, r: number) {
  const theta = ((-SWEEP + at * SWEEP * 2) * Math.PI) / 180
  return { x: PIVOT_X + r * Math.sin(theta), y: PIVOT_Y - r * Math.cos(theta) }
}

function arcPath(from: number, to: number, r: number) {
  const a = arcPoint(from, r)
  const b = arcPoint(to, r)
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} A${r} ${r} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
}

/** An analogue needle meter. Decorative to assistive tech: whatever it shows is
 *  also printed as text beside it. */
export function VuMeter({ value, title, ticks, band, className = '' }: VuMeterProps) {
  const clamped = value === null ? null : Math.max(0, Math.min(1, value))
  // Parked well below the scale, clear of the end labels.
  const angle = clamped === null ? -SWEEP - 12 : -SWEEP + clamped * SWEEP * 2

  return (
    <div
      className={`relative aspect-[280/150] w-full overflow-hidden rounded-xl ${className}`}
      style={{
        background: 'linear-gradient(180deg, #F7F0DC, #E9DEC0)',
        boxShadow:
          'inset 0 2px 8px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(0,0,0,0.2), 0 1px 0 #fff',
      }}
      aria-hidden
    >
      <svg viewBox="0 0 280 150" className="absolute inset-0 h-full w-full">
        <path d={arcPath(0, 1, 120)} fill="none" stroke="#3A3630" strokeWidth="1.5" />
        {band && (
          <path d={arcPath(band[0], band[1], 120)} fill="none" stroke="#F2541B" strokeWidth="7" opacity="0.85" />
        )}
        {ticks.map((t) => {
          const inner = arcPoint(t.at, 112)
          const outer = arcPoint(t.at, 128)
          const text = arcPoint(t.at, 96)
          return (
            <g key={t.at}>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#3A3630" strokeWidth="1.5" />
              {t.label && (
                <text
                  x={text.x}
                  y={text.y + 3}
                  fontFamily="Geist Mono, monospace"
                  fontSize="10"
                  fill="#3A3630"
                  textAnchor="middle"
                >
                  {t.label}
                </text>
              )}
            </g>
          )
        })}
        <text
          x={PIVOT_X}
          y="118"
          fontFamily="Geist Mono, monospace"
          fontSize="10"
          letterSpacing="2"
          fill="#3A3630"
          textAnchor="middle"
        >
          {title}
        </text>
        <g
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: `${PIVOT_X}px ${PIVOT_Y}px`,
            // A touch of overshoot, like a needle with some mass behind it.
            transition: 'transform 220ms cubic-bezier(0.3, 1.4, 0.5, 1)',
          }}
        >
          <line x1={PIVOT_X} y1={PIVOT_Y} x2={PIVOT_X} y2="40" stroke="#1D1C1A" strokeWidth="2" strokeLinecap="round" />
        </g>
        <circle cx={PIVOT_X} cy={PIVOT_Y} r="16" fill="#2A2824" />
      </svg>
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(170deg, rgba(255,255,255,0.45), rgba(255,255,255,0) 40%)' }}
      />
    </div>
  )
}

// --- Record button --------------------------------------------------------------

interface RecButtonProps {
  /** Live: lit, ringing, and showing STOP. */
  live?: boolean
  onClick: () => void
  disabled?: boolean
  /** Accessible name, e.g. "Begin a take". */
  label: string
}

/** The big domed record button in its chrome bezel. */
export function RecButton({ live = false, onClick, disabled = false, label }: RecButtonProps) {
  return (
    <div
      className="flex h-[184px] w-[184px] shrink-0 items-center justify-center rounded-full"
      style={{
        background:
          'conic-gradient(from 210deg, #FFFFFF, #C9C4B9, #F4F2ED, #B7B1A5, #FFFFFF, #C9C4B9, #FFFFFF)',
        boxShadow:
          'inset 0 2px 0 rgba(255,255,255,0.9), 0 18px 30px -10px rgba(60,40,10,0.4), 0 0 0 1px rgba(0,0,0,0.08)',
      }}
    >
      <div className="flex h-[156px] w-[156px] items-center justify-center rounded-full bg-[#1E1F1C] shadow-[inset_0_4px_10px_rgba(0,0,0,0.7)]">
        <div className="relative h-[132px] w-[132px]">
          {live && (
            <span className="absolute inset-0 rounded-full motion-safe:animate-rec-ring" aria-hidden />
          )}
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className="relative flex h-full w-full flex-col items-center justify-center gap-2 rounded-full font-mono
                       text-[15px] font-semibold tracking-[0.18em] text-ink-900 transition-[transform,box-shadow]
                       duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70
                       focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E1F1C] enabled:active:translate-y-1
                       disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: live
                ? 'radial-gradient(circle at 40% 30%, #FFB48A, #FF5B1F 55%, #D8430F)'
                : 'radial-gradient(circle at 40% 30%, #FF9A66, #F2541B 55%, #C23C0C)',
              boxShadow: live
                ? 'inset 0 3px 2px rgba(255,255,255,0.5), inset 0 -8px 16px rgba(120,30,0,0.35), 0 2px 0 #8E2A06, 0 0 24px rgba(255,91,31,0.45)'
                : 'inset 0 3px 2px rgba(255,255,255,0.45), inset 0 -8px 16px rgba(120,30,0,0.45), 0 6px 0 #8E2A06, 0 10px 18px rgba(0,0,0,0.4)',
            }}
          >
            {live ? (
              <>
                <span className="h-[18px] w-[18px] rounded-[3px] bg-ink-900" aria-hidden />
                <span className="text-[13px]">STOP</span>
              </>
            ) : (
              'REC'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Meter presets ----------------------------------------------------------------

/** The input-level meter: aim to keep the needle in the band. */
export function LevelMeter({ volume, className }: { volume: number | null; className?: string }) {
  return (
    <VuMeter
      value={volume}
      title="MIC LEVEL"
      band={[0.15, 0.85]}
      ticks={[
        { at: 0, label: 'LOW' },
        { at: 0.25 },
        { at: 0.5 },
        { at: 0.75 },
        { at: 1, label: 'HIGH' },
      ]}
      className={className}
    />
  )
}

const PACE_FLOOR = 90
const PACE_SPAN = 100 // the face reads 90..190 words a minute

/** The pace meter, in words a minute, with the scorer's target band. */
export function PaceMeter({
  wpm,
  target,
  className,
}: {
  wpm: number | null
  target: [number, number]
  className?: string
}) {
  const at = (v: number) => (v - PACE_FLOOR) / PACE_SPAN
  return (
    <VuMeter
      value={wpm === null ? null : at(wpm)}
      title="PACE · WPM"
      band={[at(target[0]), at(target[1])]}
      ticks={[90, 110, 130, 150, 170, 190].map((v) => ({ at: at(v), label: String(v) }))}
      className={className}
    />
  )
}
