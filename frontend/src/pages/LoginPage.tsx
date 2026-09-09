// Sign in, then straight into the Hall of Voices reel.

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { AuthShell } from '../components/auth/AuthShell'
import { PasswordField, TextField } from '../components/auth/TextField'
import { emailError } from '../lib/validation'
import { markWelcomePending } from '../lib/welcome'

export function LoginPage() {
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const emailIssue = emailError(email)
  const passwordIssue = password ? null : 'Please enter your password.'
  // Errors appear once a field has been visited, or once submit has been tried
  // — never while someone is still typing their first character.
  const showEmailError = touched.email ? emailIssue : null
  const showPasswordError = touched.password ? passwordIssue : null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched({ email: true, password: true })
    setFormError(null)
    if (emailIssue || passwordIssue) return

    setSubmitting(true)
    try {
      // Raise the flag *before* signing in: the moment signIn resolves,
      // PublicOnly re-renders and redirects, and it needs to already see this.
      markWelcomePending()
      await signIn(email.trim(), password, remember)
      // No navigate() here — PublicOnly routes us on, to /welcome and then to
      // wherever the RequireAuth guard was originally taking us.
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      )
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title={
        <>
          Take the stage <span className="text-gradient">again.</span>
        </>
      }
      subtitle="Sign in to pick up your streak, your level and every take you've recorded."
      footer={
        <>
          New to Cadence?{' '}
          <Link
            to="/register"
            className="font-semibold text-brand-600 underline-offset-4 hover:underline"
          >
            Create your account
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
          label="Email address"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={setEmail}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          error={showEmailError}
          disabled={submitting}
        />

        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={showPasswordError}
          disabled={submitting}
        />

        <div className="flex items-center justify-between pt-1">
          <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-ink-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 cursor-pointer rounded border-ink-300 text-brand-600
                         focus:ring-2 focus:ring-brand-400 focus:ring-offset-0"
            />
            Keep me signed in
          </label>
        </div>

        <button type="submit" disabled={submitting} className="btn-primary mt-2 w-full py-3 text-base">
          {submitting ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>
    </AuthShell>
  )
}
