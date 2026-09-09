// The signed-in account control in the header.

import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function UserMenu() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!user) return null

  // No navigate() after signing out: the auth status flips to "anon" and
  // RequireAuth redirects on its own. Doing both would race.
  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
  }

  function replayIntro() {
    setOpen(false)
    navigate('/welcome', { state: { next: location.pathname } })
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br
                   from-ink-700 to-ink-900 text-xs font-bold text-white ring-1 ring-white/40
                   transition hover:-translate-y-0.5 hover:shadow-lift focus:outline-none
                   focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        {user.initials}
      </button>

      {open && (
        <div
          role="menu"
          className="animate-fade-in absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl
                     bg-white/95 shadow-lift ring-1 ring-ink-900/[0.08] backdrop-blur-xl"
        >
          <div className="border-b border-ink-900/[0.06] px-4 py-3">
            <p className="truncate font-display text-sm font-bold text-ink-900">{user.name}</p>
            <p className="truncate text-xs text-ink-400">{user.email}</p>
          </div>
          <div className="p-1.5">
            <button
              role="menuitem"
              onClick={replayIntro}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm
                         font-medium text-ink-700 transition hover:bg-ink-900/[0.05]"
            >
              <span aria-hidden>🎬</span> Replay the greats
            </button>
            <button
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm
                         font-medium text-ink-700 transition hover:bg-accent-50 hover:text-accent-700
                         disabled:opacity-50"
            >
              <span aria-hidden>↩</span> {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
