import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { LevelState } from './api/types'
import { getLevel } from './api/client'
import { Wordmark, LogoMark } from './components/ui/Logo'
import { UserMenu } from './components/UserMenu'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `relative rounded-full px-4 py-1.5 text-sm font-semibold transition ${
    isActive ? 'text-white' : 'text-ink-500 hover:text-ink-800'
  }`

// Persistent gamification cue. Refetches on navigation so it reflects a level
// gained in the session you just finished.
function LevelChip() {
  const location = useLocation()
  const [level, setLevel] = useState<LevelState | null>(null)
  useEffect(() => {
    getLevel().then(setLevel).catch(() => setLevel(null))
  }, [location.pathname])

  if (!level) return null
  return (
    <div
      className="hidden items-center gap-2 rounded-full bg-white/80 px-2 py-1 pr-3.5 ring-1 ring-ink-900/[0.07] backdrop-blur sm:flex"
      title={`${level.name} — ${level.award || 'just getting started'}`}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white shadow-glow">
        {level.current_level}
      </span>
      <span className="text-sm font-semibold text-ink-700">{level.name}</span>
    </div>
  )
}

// Segmented nav: an active-pill toggle that slides between Practice / Progress.
function MainNav() {
  return (
    <nav className="flex items-center gap-1 rounded-full bg-ink-900/[0.04] p-1 ring-1 ring-ink-900/[0.05]">
      <NavLink to="/" end className={navClass}>
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 shadow-glow" />
            )}
            Practice
          </>
        )}
      </NavLink>
      <NavLink to="/progress" className={navClass}>
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 shadow-glow" />
            )}
            Progress
          </>
        )}
      </NavLink>
    </nav>
  )
}

function App() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky glass header */}
      <header className="sticky top-0 z-40">
        <div className="glass border-b border-white/50">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <NavLink to="/" className="transition hover:opacity-90">
              <Wordmark />
            </NavLink>
            <div className="flex items-center gap-3">
              <LevelChip />
              <MainNav />
              <UserMenu />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-ink-900/[0.06] pt-6 text-sm text-ink-400 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="font-medium text-ink-500">
              Cadence — speak with confidence, every time.
            </span>
          </div>
          <p className="text-xs">
            Feedback on pace, fillers, pauses &amp; relevance. Your practice stays yours.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
