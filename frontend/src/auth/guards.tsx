// Route guards. Both wait out the `loading` boot state behind a branded splash
// rather than redirecting on it — otherwise every refresh flashes the sign-in
// page for a moment before the session check comes back.

import { Navigate, useLocation, type Location } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { LogoMark } from '../components/ui/Logo'
import { isWelcomePending } from '../lib/welcome'

function BootSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <LogoMark size={54} animated />
      <p className="font-display text-lg font-semibold tracking-tight text-ink-700">Cadence</p>
      <span className="sr-only" role="status">
        Checking your session…
      </span>
    </div>
  )
}

interface RequireAuthProps {
  children: React.ReactNode
  /** Shown to a signed-out visitor at `/` in place of the redirect to sign-in:
   *  the address is the landing page for them and the app for everyone else. */
  publicHome?: React.ReactNode
}

export function RequireAuth({ children, publicHome }: RequireAuthProps) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <BootSplash />
  if (status === 'anon') {
    if (publicHome && location.pathname === '/') return <>{publicHome}</>

    // Remember where they were headed so sign-in can finish the journey.
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}

export function PublicOnly({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <BootSplash />
  if (status === 'authed') {
    const from = (location.state as { from?: Location } | null)?.from
    const next = from?.pathname ?? '/'

    // This guard, not the form, decides where a newly signed-in visitor lands.
    // The moment sign-in resolves, the status flips and this component
    // re-renders — so a navigate() inside the form would be racing a redirect
    // it always loses. The form only raises the flag; the routing happens here.
    if (isWelcomePending()) return <Navigate to="/welcome" replace state={{ next }} />
    return <Navigate to={next} replace />
  }
  return <>{children}</>
}
