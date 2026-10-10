import { NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/create', label: 'Create' },
  { to: '/world', label: 'Explore' },
  { to: '/mission', label: 'Mission' },
  { to: '/simulation', label: 'Replays' },
  { to: '/agents', label: 'Showdown' },
]

export function AppShell() {
  return (
    <div className="flex min-h-full flex-col bg-void text-bright">
      <header className="relative z-40 border-b border-line/70 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <NavLink to="/" className="group flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-md border border-signal/40 bg-panel">
              <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden>
                <path d="M8 22 L16 8 L24 22 Z" stroke="#2ee6d6" strokeWidth="2.5" />
                <circle cx="16" cy="18" r="2.2" fill="#f5a623" />
              </svg>
            </span>
            <span className="font-display text-lg font-bold tracking-tight">
              WorldShift<span className="text-signal"> AI</span>
            </span>
          </NavLink>

          <nav className="flex items-center gap-0.5 overflow-x-auto text-sm">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    'whitespace-nowrap rounded-md px-2.5 py-1.5 transition-colors sm:px-3',
                    isActive
                      ? 'bg-elevated text-signal'
                      : 'text-soft hover:bg-panel hover:text-bright',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
