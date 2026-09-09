// Form fields for the sign-in and sign-up screens.
//
// Floating labels are done with a transparent placeholder plus `peer` variants,
// so the label is a real <label> the whole time — screen readers and password
// managers see an ordinary labelled input, and the animation is pure CSS.

import { useId, useState, type ReactNode } from 'react'

interface TextFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  type?: string
  error?: string | null
  hint?: ReactNode
  autoComplete?: string
  autoFocus?: boolean
  inputMode?: 'text' | 'email' | 'numeric'
  disabled?: boolean
  /** Rendered inside the field, right-aligned (the password reveal toggle). */
  trailing?: ReactNode
  name?: string
}

export function TextField({
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  error,
  hint,
  autoComplete,
  autoFocus,
  inputMode,
  disabled,
  trailing,
  name,
}: TextFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          inputMode={inputMode}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          // A space, not "", so :placeholder-shown works as the "is empty" test.
          placeholder=" "
          className={`peer block w-full rounded-2xl border-0 bg-white/90 px-4 pb-2 pt-6 text-[15px]
                      font-medium text-ink-900 shadow-sm ring-1 ring-inset backdrop-blur
                      transition placeholder:text-transparent focus:outline-none focus:ring-2
                      disabled:cursor-not-allowed disabled:opacity-60 ${
                        error
                          ? 'ring-accent-400 focus:ring-accent-500'
                          : 'ring-ink-900/10 hover:ring-ink-900/20 focus:ring-brand-500'
                      } ${trailing ? 'pr-12' : ''}`}
        />
        <label
          htmlFor={id}
          className={`pointer-events-none absolute left-4 top-1.5 text-[11px] font-bold uppercase
                      tracking-[0.12em] transition-all
                      peer-placeholder-shown:top-[1.15rem] peer-placeholder-shown:text-[15px]
                      peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case
                      peer-placeholder-shown:tracking-normal peer-placeholder-shown:text-ink-400
                      peer-focus:top-1.5 peer-focus:text-[11px] peer-focus:font-bold
                      peer-focus:uppercase peer-focus:tracking-[0.12em] ${
                        error
                          ? 'text-accent-600 peer-focus:text-accent-600'
                          : 'text-brand-600 peer-focus:text-brand-600'
                      }`}
        >
          {label}
        </label>
        {trailing && (
          <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>
        )}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 flex items-start gap-1.5 px-1 text-xs font-medium text-accent-600">
          <span aria-hidden>⚠</span>
          {error}
        </p>
      ) : (
        hint && (
          <div id={hintId} className="mt-1.5 px-1 text-xs text-ink-400">
            {hint}
          </div>
        )
      )}
    </div>
  )
}

interface PasswordFieldProps extends Omit<TextFieldProps, 'type' | 'trailing'> {
  autoComplete: 'current-password' | 'new-password'
}

export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // The label carries the state because the icon alone is ambiguous:
          // an eye can mean "it is visible" or "click to reveal".
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="rounded-xl px-2.5 py-2 text-ink-400 transition hover:bg-ink-900/[0.04]
                     hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          {visible ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M9.4 5.2A9.7 9.7 0 0112 5c5 0 9 4.5 9 7 0 .9-.5 2-1.4 3.1M6.2 6.6C4 8.1 3 10.2 3 12c0 2.5 4 7 9 7 1.4 0 2.7-.3 3.8-.9"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          )}
        </button>
      }
    />
  )
}
