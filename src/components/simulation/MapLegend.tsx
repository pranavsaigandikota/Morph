const ITEMS = [
  { color: '#2a3544', label: 'Walls' },
  { color: '#ef4444', label: 'Fire' },
  { color: '#94a3b8', label: 'Smoke' },
  { color: '#a3e635', label: 'Chemical' },
  { color: '#f5a623', label: 'Collapse' },
  { color: '#34d399', label: 'Exit' },
  { color: '#2ee6d6', label: 'Agent' },
]

export function MapLegend() {
  return (
    <div className="flex flex-wrap gap-3">
      {ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs text-soft">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
          {item.label}
        </div>
      ))}
    </div>
  )
}
