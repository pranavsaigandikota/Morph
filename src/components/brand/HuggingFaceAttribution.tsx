import { HUGGING_FACE_MODELS, type ModelCapability } from '../../data/huggingFaceModels'

const CAP_LABEL: Record<ModelCapability, string> = {
  live: 'LIVE',
  experimental: 'EXPERIMENTAL',
  mock: 'MOCK',
}

const CAP_CLASS: Record<ModelCapability, string> = {
  live: 'border-ok/40 bg-ok/10 text-ok',
  experimental: 'border-hazard/40 bg-hazard/10 text-hazard',
  mock: 'border-mock/40 bg-mock/10 text-mock',
}

interface Props {
  compact?: boolean
}

export function HuggingFaceAttribution({ compact = false }: Props) {
  return (
    <section
      className={`rounded-2xl border border-line bg-panel/80 ${compact ? 'p-4' : 'p-5 sm:p-6'}`}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Powered by Hugging Face
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-bright sm:text-xl">
            Models behind WorldShift
          </h2>
        </div>
        <a
          href="https://huggingface.co"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-signal hover:underline"
        >
          huggingface.co →
        </a>
      </div>
      <p className="mt-2 max-w-2xl text-xs text-soft">
        Capabilities differ by surface. LIVE means wired to a real backend path when available;
        EXPERIMENTAL and MOCK are labeled honestly and must not be mistaken for verified physical
        evidence.
      </p>
      <ul className={`mt-4 grid gap-3 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
        {HUGGING_FACE_MODELS.map((m) => (
          <li key={m.id} className="rounded-xl border border-line bg-ink/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-bright">{m.name}</p>
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CAP_CLASS[m.capability]}`}
              >
                {CAP_LABEL[m.capability]}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-soft">{m.role}</p>
            <p className="mt-1.5 text-[10px] leading-snug text-muted">{m.notes}</p>
            <a
              href={m.cardUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-[11px] font-semibold text-signal hover:underline"
            >
              Model card →
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
