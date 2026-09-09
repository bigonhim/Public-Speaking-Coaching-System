// Client-side mirrors of the server's account rules.
//
// The backend (Django's AUTH_PASSWORD_VALIDATORS) remains the authority — this
// exists so the form can answer while you type instead of after a round trip.
// Anything relaxed here is still caught there; the failure mode is a late error
// message, never a weak password getting through.

// Deliberately permissive. Real addresses break every clever regex, so this
// only catches obvious typos and leaves the verdict to the server.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** A short list of the passwords that actually get tried first in credential
 *  stuffing. Django checks a 20k-entry list server-side; this covers the ones
 *  worth flagging before the user hits submit. */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty', 'qwerty123', 'qwertyuiop', 'letmein', 'welcome', 'welcome1',
  'admin123', 'iloveyou', 'sunshine', 'princess', 'football', 'baseball',
  'monkey123', 'abc12345', 'trustno1', 'dragon123', 'passw0rd', 'starwars',
  'whatever', 'changeme', 'secret123', 'superman', 'michael1',
])

export const MIN_PASSWORD_LENGTH = 8

export function nameError(value: string): string | null {
  const name = value.trim()
  if (!name) return 'Please tell us what to call you.'
  if (name.length > 80) return 'Please keep this under 80 characters.'
  return null
}

export function emailError(value: string): string | null {
  const email = value.trim()
  if (!email) return 'Please enter your email address.'
  if (!EMAIL_RE.test(email)) return "That doesn't look like a valid email address."
  if (email.length > 150) return 'That email address is too long.'
  return null
}

export interface PasswordRule {
  id: string
  label: string
  ok: boolean
}

/** Live checklist shown under the password field while registering. */
export function passwordRules(password: string, email: string, name: string): PasswordRule[] {
  const lower = password.toLowerCase()
  const localPart = email.split('@')[0]?.trim().toLowerCase() ?? ''

  // Django's UserAttributeSimilarityValidator compares against the username,
  // email and name. Approximated here by containment in either direction,
  // which catches the cases people actually try.
  const resemblesIdentity = [localPart, name.trim().toLowerCase()]
    .filter((part) => part.length >= 4)
    .some((part) => lower.includes(part) || part.includes(lower))

  return [
    {
      id: 'length',
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      ok: password.length >= MIN_PASSWORD_LENGTH,
    },
    {
      id: 'variety',
      label: "Not all numbers, and not a password you'd find on a list",
      ok: password.length > 0 && !/^\d+$/.test(password) && !COMMON_PASSWORDS.has(lower),
    },
    {
      id: 'personal',
      label: "Doesn't reuse your name or email",
      ok: password.length > 0 && !resemblesIdentity,
    },
  ]
}

export function passwordError(password: string, email: string, name: string): string | null {
  if (!password) return 'Please choose a password.'
  const failed = passwordRules(password, email, name).find((r) => !r.ok)
  return failed ? failed.label : null
}

export interface PasswordStrength {
  /** 0–4, for a four-segment meter. */
  score: number
  label: string
  /** Tailwind background class for the filled segments. */
  barClass: string
  textClass: string
}

export function passwordStrength(password: string, email: string, name: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: '', barClass: 'bg-ink-200', textClass: 'text-ink-400' }
  }

  let points = 0
  if (password.length >= 8) points += 1
  if (password.length >= 12) points += 1
  if (password.length >= 16) points += 1
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length
  if (classes >= 2) points += 1
  if (classes >= 3) points += 1

  // A rule failure caps the meter — a 20-character password that is your own
  // email should never read as "strong".
  const broken = passwordRules(password, email, name).some((r) => !r.ok)
  const score = broken ? Math.min(points, 1) : Math.min(points, 4)

  const scale: PasswordStrength[] = [
    { score, label: 'Too short', barClass: 'bg-accent-500', textClass: 'text-accent-600' },
    { score, label: 'Weak', barClass: 'bg-accent-500', textClass: 'text-accent-600' },
    { score, label: 'Fair', barClass: 'bg-filler', textClass: 'text-yellow-700' },
    { score, label: 'Good', barClass: 'bg-relevance', textClass: 'text-emerald-700' },
    { score, label: 'Strong', barClass: 'bg-relevance', textClass: 'text-emerald-700' },
  ]
  return scale[score]
}
