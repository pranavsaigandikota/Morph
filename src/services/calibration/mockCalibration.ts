/**
 * MOCK calibration captures for UI development.
 * Labeled clearly — not live Waypoint screenshots.
 */

import {
  CALIBRATION_QUAD,
  DIRECTION_LABEL,
  DIRECTION_YAW_DEG,
  type CalibrationCapture,
  type CalibrationDirection,
  type CalibrationSession,
} from '../../types/calibration'

function mockCaptureSvg(direction: CalibrationDirection, index: number): string {
  const label = DIRECTION_LABEL[direction]
  const hue = (index * 67 + 160) % 360
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},28%,14%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 40) % 360},22%,8%)"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <polygon points="220,220 320,120 420,220" fill="hsl(${hue},35%,22%)" opacity="0.9"/>
  <rect x="280" y="200" width="80" height="90" fill="hsl(${(hue + 20) % 360},30%,18%)"/>
  <path d="M0 260 Q160 240 320 255 T640 250 L640 360 L0 360 Z" fill="hsl(${hue},18%,12%)"/>
  <text x="24" y="40" fill="#2ee6d6" font-family="DM Sans,sans-serif" font-size="18" font-weight="700">MOCK · UI SIMULATION</text>
  <text x="24" y="72" fill="#eef3f8" font-family="Syne,sans-serif" font-size="28" font-weight="800">${label}</text>
  <text x="24" y="100" fill="#6b7c90" font-family="DM Sans,sans-serif" font-size="13">Not a live Waypoint capture · awaiting calibration API</text>
  <text x="24" y="340" fill="#9aabbe" font-family="ui-monospace,monospace" font-size="12">yaw≈${DIRECTION_YAW_DEG[direction]}° · estimated only</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function createMockCalibrationSession(opts: {
  worldPrompt: string
  style: string
  sceneSeed: string | null
  generationSeed: number | null
  directions?: CalibrationDirection[]
}): CalibrationSession {
  const planned = opts.directions ?? [...CALIBRATION_QUAD]
  return {
    id: `cal_mock_${Date.now().toString(36)}`,
    worldPrompt: opts.worldPrompt,
    style: opts.style,
    sceneSeed: opts.sceneSeed,
    generationSeed: opts.generationSeed,
    phase: 'world_created',
    plannedDirections: planned,
    captures: [],
    source: 'mock',
    createdAtMs: Date.now(),
    completedAtMs: null,
  }
}

/** Simulate capturing one direction — UI-only MOCK still. */
export function mockCaptureDirection(
  session: CalibrationSession,
  direction: CalibrationDirection,
): CalibrationCapture {
  const index = session.plannedDirections.indexOf(direction)
  return {
    id: `cap_${direction}_${Date.now().toString(36)}`,
    direction,
    imageUrl: mockCaptureSvg(direction, index < 0 ? session.captures.length : index),
    capturedAtMs: Date.now(),
    source: 'mock_ui',
    confidence: 0.55 + (index % 3) * 0.1,
    reviewStatus: 'accepted',
    yawDeg: DIRECTION_YAW_DEG[direction],
  }
}

const STORAGE_KEY = 'ws_calibration_session_v1'

export function persistCalibrationSession(session: CalibrationSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    /* ignore */
  }
}

export function loadCalibrationSession(): CalibrationSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CalibrationSession
  } catch {
    return null
  }
}

export function clearCalibrationSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
