// Who is signed in, for the whole app.
//
// The session itself lives in an HttpOnly cookie the JS side cannot read, so
// this context is a *cache* of the server's answer, never the source of truth.
// It is seeded once at boot from GET /auth/me and re-synced whenever the server
// tells us the session is gone.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '../api/types'
import * as api from '../api/client'

export type AuthStatus = 'loading' | 'authed' | 'anon'

interface AuthValue {
  user: User | null
  status: AuthStatus
  signIn: (email: string, password: string, remember: boolean) => Promise<User>
  signUp: (name: string, email: string, password: string) => Promise<User>
  signOut: () => Promise<void>
  /** Re-read the account from the server (e.g. after finishing a session). */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  // StrictMode double-invokes effects in development; this keeps the boot
  // request to one.
  //
  // Note there is deliberately no "cancelled" flag paired with this guard.
  // Together they deadlock: the first pass sets the ref and starts the request,
  // the StrictMode cleanup marks it cancelled, and the second pass returns
  // early — so nothing ever resolves and the app sits on the splash forever.
  // React 18+ does not warn about setState after unmount, so the guard alone is
  // both sufficient and correct.
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current) return
    booted.current = true

    api
      .getMe()
      .then((me) => {
        setUser(me)
        setStatus('authed')
      })
      .catch(() => {
        setUser(null)
        setStatus('anon')
        // No session, so no CSRF cookie yet — prime one for the sign-in POST.
        void api.ensureCsrfToken()
      })
  }, [])

  // A 401 from any coach endpoint means the cookie expired mid-visit.
  useEffect(() => {
    api.setSessionExpiredHandler(() => {
      setUser(null)
      setStatus('anon')
    })
    return () => api.setSessionExpiredHandler(null)
  }, [])

  const signIn = useCallback(async (email: string, password: string, remember: boolean) => {
    const me = await api.login(email, password, remember)
    setUser(me)
    setStatus('authed')
    return me
  }, [])

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const me = await api.register(name, email, password)
    setUser(me)
    setStatus('authed')
    return me
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      // Drop the local user even if the call failed: the alternative is an app
      // that looks signed in but cannot do anything.
      setUser(null)
      setStatus('anon')
      await api.ensureCsrfToken() // logout rotated the token
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      setUser(await api.getMe())
      setStatus('authed')
    } catch {
      setUser(null)
      setStatus('anon')
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ user, status, signIn, signUp, signOut, refresh }),
    [user, status, signIn, signUp, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
