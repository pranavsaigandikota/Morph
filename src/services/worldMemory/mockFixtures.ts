/** Clearly labeled MOCK fixtures — not real Waypoint / SDXL outputs. */

export const MOCK_BADGE = 'MOCK — pending Codex world-memory contract'

/** Tiny procedural JPEG-like SVG data URLs for gallery placeholders. */
export function mockCheckpointImage(seed: number, label: string): string {
  const hue = (seed * 47) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},35%,18%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 40) % 360},30%,10%)"/>
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#g)"/>
  <rect x="24" y="40" width="90" height="110" fill="hsl(${hue},20%,28%)" opacity="0.85"/>
  <rect x="130" y="70" width="70" height="80" fill="hsl(${(hue + 20) % 360},25%,22%)"/>
  <circle cx="260" cy="48" r="22" fill="hsl(45,80%,60%)" opacity="0.35"/>
  <text x="16" y="24" fill="#9aabbe" font-family="sans-serif" font-size="12">${label}</text>
  <text x="16" y="168" fill="#6b7c90" font-family="sans-serif" font-size="10">MOCK still</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** MOCK “enhanced” still — brighter; not a real AI enhance result. */
export function mockEnhancedCheckpointImage(seed: number, label: string): string {
  const hue = (seed * 47) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},45%,28%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 40) % 360},40%,16%)"/>
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#g)"/>
  <rect x="24" y="40" width="90" height="110" fill="hsl(${hue},30%,42%)" opacity="0.9"/>
  <rect x="130" y="70" width="70" height="80" fill="hsl(${(hue + 20) % 360},35%,34%)"/>
  <circle cx="260" cy="48" r="22" fill="hsl(45,90%,70%)" opacity="0.55"/>
  <text x="16" y="24" fill="#eef3f8" font-family="sans-serif" font-size="12">${label}</text>
  <text x="16" y="168" fill="#2ee6d6" font-family="sans-serif" font-size="10">MOCK enhanced candidate</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
