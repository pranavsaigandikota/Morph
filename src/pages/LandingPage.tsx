import { Link } from 'react-router-dom'
import { WORLD_SCENES } from '../data/scenes'

export function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Atmospheric background */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 20% 10%, rgba(46,230,214,0.12), transparent 55%),
            radial-gradient(ellipse 60% 40% at 85% 20%, rgba(245,166,35,0.08), transparent 50%),
            linear-gradient(180deg, #0a0e12 0%, #06080b 45%, #0c1218 100%)
          `,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(rgba(36,48,64,0.45) 1px, transparent 1px),
            linear-gradient(90deg, rgba(36,48,64,0.45) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px',
          maskImage: 'linear-gradient(180deg, black 0%, transparent 70%)',
        }}
      />

      <section className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-7xl flex-col justify-center px-4 py-16 sm:px-6">
        <div className="animate-fade-up max-w-3xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-signal">
            Hackathon · Generative Worlds · Autonomous Rescue
          </p>
          <h1 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight text-bright sm:text-6xl md:text-7xl">
            WorldShift<span className="text-signal"> AI</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-soft sm:text-xl">
            Step into streamed AI worlds and train rescue agents in a deterministic facility
            simulator — built for judges, ready for the world engine.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/world"
              className="rounded-md bg-signal px-5 py-2.5 text-sm font-bold text-void transition hover:bg-signal/90"
            >
              Enter World Explorer
            </Link>
            <Link
              to="/simulation"
              className="rounded-md border border-line bg-panel px-5 py-2.5 text-sm font-semibold text-bright transition hover:border-signal/40"
            >
              Open Rescue Lab
            </Link>
          </div>
        </div>

        <div className="animate-fade-up mt-16 grid gap-4 sm:grid-cols-3" style={{ animationDelay: '120ms' }}>
          {[
            {
              title: 'AI World Explorer',
              body: 'Live generative frames over WebSocket with WASD, pointer lock, and telemetry.',
              to: '/world',
            },
            {
              title: 'Rescue Simulation Lab',
              body: 'Static recorded-evaluation package — maps, trajectories, and charts with no backend.',
              to: '/simulation',
            },
            {
              title: 'Agent Evaluation',
              body: 'Offline episode metrics and training history from the rescue data handoff.',
              to: '/agents',
            },
          ].map((card) => (
            <Link
              key={card.title}
              to={card.to}
              className="group rounded-xl border border-line bg-panel/70 p-5 transition hover:border-signal/35 hover:bg-elevated"
            >
              <h2 className="font-display text-lg font-bold text-bright group-hover:text-signal">
                {card.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{card.body}</p>
            </Link>
          ))}
        </div>

        <div className="animate-fade-up mt-14" style={{ animationDelay: '200ms' }}>
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="font-display text-2xl font-bold">Scene selection</h2>
            <span className="text-xs uppercase tracking-wider text-muted">Start with Facility</span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {WORLD_SCENES.map((scene) => (
              <div
                key={scene.id}
                className={`relative overflow-hidden rounded-xl border p-5 ${
                  scene.available
                    ? 'border-signal/30 bg-elevated'
                    : 'border-line bg-panel/50 opacity-70'
                }`}
              >
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-40"
                  style={{
                    background: scene.available
                      ? 'radial-gradient(circle, rgba(46,230,214,0.35), transparent 70%)'
                      : 'radial-gradient(circle, rgba(107,124,144,0.25), transparent 70%)',
                  }}
                />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{scene.id}</p>
                <h3 className="mt-1 font-display text-xl font-bold">{scene.title}</h3>
                <p className="mt-2 text-sm text-soft">{scene.subtitle}</p>
                <p className="mt-3 text-xs text-muted">{scene.atmosphere}</p>
                {scene.available ? (
                  <Link
                    to={`/world?scene=${scene.id}`}
                    className="mt-4 inline-flex rounded-md bg-signal/15 px-3 py-1.5 text-sm font-semibold text-signal transition hover:bg-signal/25"
                  >
                    Launch scene
                  </Link>
                ) : (
                  <span className="mt-4 inline-flex text-xs font-semibold uppercase tracking-wider text-muted">
                    Locked
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
