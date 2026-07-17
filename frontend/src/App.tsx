import { NavLink, Outlet } from 'react-router-dom'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
    isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
  }`

function App() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <NavLink to="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white shadow-sm">
            ◎
          </span>
          <span className="text-lg font-extrabold tracking-tight text-slate-800">
            Speaking Coach
          </span>
        </NavLink>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={navClass}>
            Practice
          </NavLink>
          <NavLink to="/progress" className={navClass}>
            Progress
          </NavLink>
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

export default App
