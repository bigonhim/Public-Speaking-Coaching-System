import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { LevelState } from './api/types'
import { getLevel } from './api/client'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
    isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
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
      className="hidden items-center gap-2 rounded-full border border-brand-100 bg-white/70 px-3 py-1.5 sm:flex"
      title={`${level.name} — ${level.award || 'just getting started'}`}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
        {level.current_level}
      </span>
      <span className="text-sm font-semibold text-slate-700">{level.name}</span>
    </div>
  )
}

function App() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 pb-16">
      <header className="flex items-center justify-between gap-3 py-5">
        <NavLink to="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-bold text-white shadow-sm">
            ◎
          </span>
          <span className="text-lg font-extrabold tracking-tight text-slate-800">
            Speaking Coach
          </span>
        </NavLink>
        <div className="flex items-center gap-3">
          <LevelChip />
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>
              Practice
            </NavLink>
            <NavLink to="/progress" className={navClass}>
              Progress
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

export default App
