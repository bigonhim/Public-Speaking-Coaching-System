import { LogoMark } from './Logo'

interface Props {
  label?: string
  sub?: string
}

export function Spinner({ label, sub }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-16 text-center">
      <span className="relative flex h-14 w-14 items-center justify-center">
        <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-500" />
        <LogoMark size={30} animated />
      </span>
      {label && <p className="font-display text-sm font-bold text-ink-700">{label}</p>}
      {sub && <p className="max-w-xs text-xs leading-relaxed text-ink-400">{sub}</p>}
    </div>
  )
}
