interface Props {
  label?: string
  sub?: string
}

export function Spinner({ label, sub }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
      {label && <p className="text-sm font-semibold text-slate-600">{label}</p>}
      {sub && <p className="max-w-xs text-xs text-slate-400">{sub}</p>}
    </div>
  )
}
