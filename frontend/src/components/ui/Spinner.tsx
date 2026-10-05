import { LogoMark } from './Logo'

interface Props {
  label?: string
  sub?: string
}

export function Spinner({ label, sub }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-16 text-center" role="status">
      <span className="relative flex h-14 w-14 items-center justify-center">
        <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-ink-200 border-t-brand-500" />
        <LogoMark size={28} animated />
      </span>
      {label && (
        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-ink-700">{label}</p>
      )}
      {sub && <p className="max-w-xs text-sm leading-relaxed text-ink-500">{sub}</p>}
    </div>
  )
}
