const ITEMS = [
  { color: '#2a3544', label: 'Walls' },
  { color: '#8a5a2b', label: 'Blocked' },
  { color: '#c9b77a', label: 'Doors' },
  { color: '#a3e635', label: 'Hazards' },
  { color: '#34d399', label: 'Goal' },
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
