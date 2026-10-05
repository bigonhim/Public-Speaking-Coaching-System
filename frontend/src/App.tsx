import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { LevelState } from './api/types'
import { getLevel } from './api/client'
import { Wordmark } from './components/ui/Logo'
import { UserMenu } from './components/UserMenu'

const NAV = [
  { to: '/', label: 'Practice', end: true },
  { to: '/progress', label: 'Progress', end: false },
  { to: '/how-its-scored', label: 'Scoring', end: false },
]

// Persistent gamification cue, as a small display on the console. Refetches on
// navigation so it reflects a level gained in the session you just finished.
function LevelReadout() {
  const location = useLocation()
  const [level, setLevel] = useState<LevelState | null>(null)
  useEffect(() => {
    getLevel().then(setLevel).catch(() => setLevel(null))
  }, [location.pathname])

  if (!level) return null
  return (
    <div
      className="lcd flex h-11 items-center gap-3 rounded-[10px] px-4 font-mono"
      title={`${level.name} — ${level.award || 'just getting started'}`}
    >
      <span className="lcd-glow text-[13px] font-semibold">
        <span className="sr-only">Level </span>
        <span aria-hidden>LV </span>
        {String(level.current_level).padStart(2, '0')}
      </span>
      <span className="hidden text-xs uppercase tracking-[0.1em] text-lcd-text lg:inline">{level.name}</span>
    </div>
  )
}

function MainNav() {
  return (
    <nav aria-label="Main" className="order-last flex w-full gap-2.5 sm:order-none sm:w-auto">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `key flex-1 px-4 sm:flex-none ${isActive ? 'key-on' : ''}`}
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="led led-on h-1.5 w-1.5" aria-hidden />}
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-4 px-4 py-5 sm:px-8 sm:py-[26px]">
        <NavLink to="/" aria-label="Cadence, practice" className="rounded-md transition-opacity hover:opacity-80">
          <Wordmark tagline />
        </NavLink>
        <MainNav />
        <div className="flex items-center gap-3">
          <LevelReadout />
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-10 sm:px-8">
        <Outlet />
      </main>

      <footer className="mx-auto w-full max-w-[1240px] px-4 pb-10 pt-2 sm:px-8">
        <div className="flex flex-col items-center justify-between gap-2 border-t border-ink-900/10 pt-6 text-center font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-500 sm:flex-row sm:text-left">
          <span>Cadence · one-minute takes</span>
          <span>Pace / fillers / pauses / relevance · your practice stays yours</span>
        </div>
      </footer>
    </div>
  )
}

export default App
