// Create an account, then straight into the Hall of Voices reel.
//
// The password rules are shown as a live checklist rather than being sprung on
// submit. They mirror Django's validators (see lib/validation.ts); the server
// still has the final say.

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { AuthShell } from '../components/auth/AuthShell'
import { PasswordField, TextField } from '../components/auth/TextField'
import {
  emailError,
  nameError,
  passwordError,
  passwordRules,
  passwordStrength,
} from '../lib/validation'
import { markWelcomePending } from '../lib/welcome'

function StrengthMeter({ password, email, name }: { password: string; email: string; name: string }) {
  const strength = passwordStrength(password, email, name)
  const rules = passwordRules(password, email, name)

  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((segment) => (
            <span
              key={segment}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                password && strength.score >= segment ? strength.barClass : 'bg-ink-900/10'
              }`}
            />
          ))}
        </div>
        {password && (
          <span
            className={`w-[4.5rem] whitespace-nowrap text-right text-[11px] font-bold uppercase tracking-wide ${strength.textClass}`}
          >
            {strength.label}
          </span>
        )}
      </div>

      <ul className="space-y-1">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={`flex items-start gap-2 text-xs transition-colors ${
              rule.ok ? 'text-emerald-700' : 'text-ink-400'
            }`}
          >
            <span aria-hidden className="mt-px">
              {rule.ok ? '✓' : '○'}
            </span>
            {rule.label}
          </li>
        ))}
      </ul>
      {/* One consolidated announcement instead of a screen reader reading the
          whole checklist again on every keystroke. */}
      <p className="sr-only" aria-live="polite">
        {password
          ? `Password strength: ${strength.label}. ${rules.filter((r) => r.ok).length} of ${rules.length} requirements met.`
          : ''}
      </p>
    </div>
  )
}

export function RegisterPage() {
  const { signUp } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean; password?: boolean }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const nameIssue = nameError(name)
  const emailIssue = emailError(email)
  const passwordIssue = passwordError(password, email, name)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched({ name: true, email: true, password: true })
    setFormError(null)
    if (nameIssue || emailIssue || passwordIssue) return

    setSubmitting(true)
    try {
      // Raised before the call for the same reason as on the sign-in page:
      // PublicOnly redirects the instant this resolves, and reads the flag then.
      markWelcomePending()
      await signUp(name.trim(), email.trim(), password)
      // PublicOnly takes it from here — see auth/guards.tsx.
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      )
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Create your account"
      title={
        <>
          Your first take is <span className="text-gradient">a minute away.</span>
        </>
      }
      subtitle="No credit card, no setup. Pick a topic, speak for a minute or more, and see exactly where your delivery stands."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-600 underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="animate-fade-up space-y-4">
        {formError && (
          <div className="animate-fade-in alert-error" role="alert">
            {formError}
          </div>
        )}

        <TextField
          label="What should we call you?"
          name="name"
          autoComplete="name"
          autoFocus
          value={name}
          onChange={setName}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          error={touched.name ? nameIssue : null}
          disabled={submitting}
        />

        <TextField
          label="Email address"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={touched.email ? emailIssue : null}
          disabled={submitting}
        />

        <div>
          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            // The checklist below already says what is wrong while they type,
            // so the red message would just be saying it twice.
            error={touched.password && !password ? 'Please choose a password.' : null}
            disabled={submitting}
          />
          <StrengthMeter password={password} email={email} name={name} />
        </div>

        <button type="submit" disabled={submitting} className="btn-primary mt-2 w-full py-3 text-base">
          {submitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Creating your account…
            </>
          ) : (
            'Create account'
          )}
        </button>

        <p className="pt-1 text-center text-xs leading-relaxed text-ink-400">
          Your recordings and transcripts stay on this server, visible only to you.
        </p>
      </form>
    </AuthShell>
  )
}
