import { Link } from 'react-router-dom'

const MODES = [
  {
    to: '/create',
    eyebrow: 'Create Anything',
    title: 'Imagine any world',
    body: 'Freeform prompts → SDXL seed → first-person Waypoint exploration. Not limited to emergencies.',
    cta: 'Describe a world',
    accent: 'signal' as const,
  },
  {
    to: '/world',
    eyebrow: 'Explore',
    title: 'Walk the generation',
    body: 'Real streamed frames from Codex Waypoint. WASD + drag-look. Gen FPS vs canvas FPS.',
    cta: 'Enter Explorer',
    accent: 'aurora' as const,
  },
  {
    to: '/mission',
    eyebrow: 'Survive',
    title: 'Pilot a rescue',
    body: 'Interactive isometric mission on the verified facility grid. Then compare your path to A*.',
    cta: 'Start mission',
    accent: 'hazard' as const,
  },
  {
    to: '/agents',
    eyebrow: 'Adapt',
    title: 'AI Showdown',
    body: 'Random 19.5%/8% · Guided PPO 99.5%/99% · A* 100%/100%. Recorded — not live inference.',
    cta: 'See the numbers',
    accent: 'ok' as const,
  },
]

export function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 ws-atmosphere animate-drift" aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-[0.35] ws-grid-mask" aria-hidden />

      <section className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-6xl flex-col justify-center px-4 py-14 sm:px-6">
        <div className="animate-fade-up max-w-3xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-signal">
            Create · Explore · Survive · Adapt
          </p>
          <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl md:text-7xl">
            WorldShift
            <span className="ws-shimmer-text"> AI</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-soft sm:text-xl">
            A judge-ready game loop: invent any world, explore it live on GPU, complete a rescue
            challenge, and compare against verified agents.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/create"
              className="animate-breathe rounded-xl bg-signal px-5 py-2.5 text-sm font-bold text-void"
            >
              Create Anything
            </Link>
            <Link
              to="/mission"
              className="rounded-xl border border-line bg-panel/80 px-5 py-2.5 text-sm font-semibold text-bright hover:border-hazard/40"
            >
              Play Rescue
            </Link>
          </div>
        </div>

        <div
          className="animate-fade-up mt-12 grid gap-4 sm:grid-cols-2"
          style={{ animationDelay: '90ms' }}
        >
          {MODES.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className="group relative overflow-hidden rounded-2xl border border-line/90 bg-panel/75 p-5 transition hover:border-signal/45"
            >
              <div
                className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full opacity-50 transition group-hover:opacity-80"
                style={{
                  background:
                    m.accent === 'signal'
                      ? 'radial-gradient(circle, rgba(46,230,214,0.35), transparent 70%)'
                      : m.accent === 'hazard'
                        ? 'radial-gradient(circle, rgba(245,166,35,0.32), transparent 70%)'
                        : m.accent === 'aurora'
                          ? 'radial-gradient(circle, rgba(124,108,255,0.32), transparent 70%)'
                          : 'radial-gradient(circle, rgba(52,211,153,0.28), transparent 70%)',
                }}
              />
              <p
                className={`text-xs font-semibold uppercase tracking-wider ${
                  m.accent === 'signal'
                    ? 'text-signal'
                    : m.accent === 'hazard'
                      ? 'text-hazard'
                      : m.accent === 'aurora'
                        ? 'text-aurora'
                        : 'text-ok'
                }`}
              >
                {m.eyebrow}
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold">{m.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-soft">{m.body}</p>
              <span className="mt-4 inline-flex text-sm font-bold text-bright group-hover:text-signal">
                {m.cta} →
              </span>
            </Link>
          ))}
        </div>

        <p
          className="animate-fade-up mt-10 text-xs text-muted"
          style={{ animationDelay: '160ms' }}
        >
          Rescue Lab & AI Showdown run from static JSON without a GPU. World Explorer needs Codex
          Waypoint on :8000. MOCK and LIVE stay clearly labeled.
        </p>
      </section>
    </div>
  )
}
