// The signed-in account control in the header.

import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Clapperboard, LogOut } from 'lucide-react'
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
        className={`key h-11 w-11 rounded-full p-0 tracking-[0.04em] ${open ? 'key-on' : ''}`}
      >
        {user.initials}
      </button>

      {open && (
        <div
          role="menu"
          className="animate-fade-in absolute right-0 z-50 mt-3 w-64 overflow-hidden rounded-2xl
                     bg-chassis-top shadow-lift"
        >
          <div className="border-b border-ink-900/[0.08] px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink-900">{user.name}</p>
            <p className="truncate font-mono text-[11px] text-ink-500">{user.email}</p>
          </div>
          <div className="p-1.5">
            <button
              role="menuitem"
              onClick={replayIntro}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm
                         font-medium text-ink-700 transition-colors hover:bg-ink-900/[0.05]"
            >
              <Clapperboard size={16} className="text-ink-500" aria-hidden /> Replay the greats
            </button>
            <button
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm
                         font-medium text-ink-700 transition-colors hover:bg-ink-900/[0.05]
                         disabled:opacity-50"
            >
              <LogOut size={16} className="text-ink-500" aria-hidden />{' '}
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
