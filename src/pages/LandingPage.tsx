import { Link } from 'react-router-dom'

export function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 15% 0%, rgba(46,230,214,0.14), transparent 55%),
            radial-gradient(ellipse 50% 40% at 90% 10%, rgba(245,166,35,0.08), transparent 50%),
            linear-gradient(180deg, #0a0e12 0%, #06080b 50%, #0c1218 100%)
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.3]"
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(rgba(36,48,64,0.45) 1px, transparent 1px),
            linear-gradient(90deg, rgba(36,48,64,0.45) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
          maskImage: 'linear-gradient(180deg, black 0%, transparent 75%)',
        }}
      />

      <section className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-6xl flex-col justify-center px-4 py-16 sm:px-6">
        <div className="animate-fade-up max-w-3xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-signal">
            Hackathon · Local Waypoint · Rescue eval
          </p>
          <h1 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight text-bright sm:text-6xl md:text-7xl">
            WorldShift<span className="text-signal"> AI</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-soft sm:text-xl">
            Explore genuinely generated interactive worlds on your GPU — and inspect recorded rescue
            agent evaluations offline.
          </p>
        </div>

        <div className="animate-fade-up mt-12 grid gap-5 md:grid-cols-2" style={{ animationDelay: '100ms' }}>
          <Link
            to="/world"
            className="group relative overflow-hidden rounded-2xl border border-signal/30 bg-elevated/80 p-6 transition hover:border-signal/60"
          >
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-50"
              style={{
                background: 'radial-gradient(circle, rgba(46,230,214,0.35), transparent 70%)',
              }}
            />
            <p className="text-xs font-semibold uppercase tracking-wider text-signal">Mode 1</p>
            <h2 className="mt-2 font-display text-2xl font-bold group-hover:text-signal">
              World Explorer
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-soft">
              First-person streamed video from Codex Waypoint on{' '}
              <code className="text-signal">:8000</code>. WASD, mouse look, real gen vs canvas FPS.
            </p>
            <p className="mt-4 text-xs text-muted">Requires local GPU inference server</p>
            <span className="mt-5 inline-flex rounded-md bg-signal px-4 py-2 text-sm font-bold text-void">
              Enter world
            </span>
          </Link>

          <Link
            to="/simulation"
            className="group relative overflow-hidden rounded-2xl border border-line bg-panel/80 p-6 transition hover:border-hazard/50"
          >
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-40"
              style={{
                background: 'radial-gradient(circle, rgba(245,166,35,0.3), transparent 70%)',
              }}
            />
            <p className="text-xs font-semibold uppercase tracking-wider text-hazard">Mode 2</p>
            <h2 className="mt-2 font-display text-2xl font-bold group-hover:text-hazard">
              Rescue Lab
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-soft">
              Static recorded evaluation — maps, Random / A* / PPO replays, charts. No Python or
              Grok services required.
            </p>
            <p className="mt-4 text-xs text-muted">Works from public/data/rescue/ alone</p>
            <span className="mt-5 inline-flex rounded-md border border-hazard/50 bg-hazard/15 px-4 py-2 text-sm font-bold text-hazard">
              Open Rescue Lab
            </span>
          </Link>
        </div>

        <div className="animate-fade-up mt-8 flex flex-wrap gap-3" style={{ animationDelay: '180ms' }}>
          <Link
            to="/create"
            className="rounded-md border border-line bg-panel px-4 py-2 text-sm font-semibold text-bright hover:border-signal/40"
          >
            Describe a world
          </Link>
          <Link
            to="/agents"
            className="rounded-md border border-line bg-panel px-4 py-2 text-sm font-semibold text-bright hover:border-signal/40"
          >
            Agent eval charts
          </Link>
        </div>
      </section>
    </div>
  )
}
