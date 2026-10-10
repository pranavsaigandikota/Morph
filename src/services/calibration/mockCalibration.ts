/**
 * MOCK user-guided calibration captures.
 * Does NOT auto-rotate by fixed degrees (Codex: automatic fixed-angle = NO-GO).
 * Does NOT use browser screenshots as proof of backend-generated frames.
 */

import {
  DIRECTION_LABEL,
  type CalibrationCapture,
  type CalibrationSession,
  type SuggestedDirectionLabel,
} from '../../types/calibration'

function mockGuidedCaptureSvg(
  label: SuggestedDirectionLabel,
  layoutIndex: number,
): string {
  const title = DIRECTION_LABEL[label]
  const hue = (layoutIndex * 53 + 170) % 360
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue},26%,12%)"/>
      <stop offset="100%" stop-color="hsl(${(hue + 35) % 360},20%,7%)"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#g)"/>
  <polygon points="480,480 640,260 800,480" fill="hsl(${hue},32%,20%)" opacity="0.9"/>
  <rect x="560" y="420" width="160" height="180" fill="hsl(${(hue + 18) % 360},28%,16%)"/>
  <path d="M0 520 Q320 480 640 510 T1280 500 L1280 720 L0 720 Z" fill="hsl(${hue},16%,10%)"/>
  <text x="40" y="56" fill="#f97316" font-family="DM Sans,sans-serif" font-size="28" font-weight="700">MOCK · UI SIMULATION</text>
  <text x="40" y="110" fill="#eef3f8" font-family="Syne,sans-serif" font-size="44" font-weight="800">Capture View</text>
  <text x="40" y="160" fill="#9aabbe" font-family="DM Sans,sans-serif" font-size="20">Not a live Waypoint frame · not a browser screenshot of LIVE</text>
  <text x="40" y="200" fill="#6b7c90" font-family="DM Sans,sans-serif" font-size="18">Optional label: ${title} · not a measured heading</text>
  <text x="40" y="680" fill="#6b7c90" font-family="ui-monospace,monospace" font-size="16">1280×720 product target · awaiting verified capture API</text>
</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function createMockCalibrationSession(opts: {
  worldPrompt: string
  style: string
  sceneSeed: string | null
  generationSeed: number | null
}): CalibrationSession {
  return {
    id: `cal_mock_${Date.now().toString(36)}`,
    worldPrompt: opts.worldPrompt,
    style: opts.style,
    sceneSeed: opts.sceneSeed,
    generationSeed: opts.generationSeed,
    phase: 'world_created',
    captures: [],
    source: 'mock',
    seedRestoreRequired: true,
    seedRestoreDone: false,
    createdAtMs: Date.now(),
    completedAtMs: null,
    policy: {
      automaticFixedAngleCalibration: 'no-go',
      captureMode: 'user_guided_visual',
    },
  }
}

/**
 * Simulate "Capture View" for the current look direction.
 * MOCK only — does not read canvas / invent LIVE provenance.
 */
export function mockCaptureCurrentView(
  session: CalibrationSession,
  suggestedLabel: SuggestedDirectionLabel = 'unlabeled',
): CalibrationCapture {
  const layoutIndex = session.captures.length
  return {
    id: `cap_${Date.now().toString(36)}_${layoutIndex}`,
    suggestedLabel,
    imageUrl: mockGuidedCaptureSvg(suggestedLabel, layoutIndex),
    capturedAtMs: Date.now(),
    source: 'mock_ui',
    imageSha256: null,
    reviewStatus: 'pending',
    confidence: null,
    layoutIndex,
  }
}

const STORAGE_KEY = 'ws_calibration_session_v2'

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
    const parsed = JSON.parse(raw) as CalibrationSession
    // Reject legacy v1 auto-angle sessions (missing policy / seedRestore fields).
    if (!parsed.policy || parsed.policy.automaticFixedAngleCalibration !== 'no-go') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearCalibrationSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem('ws_calibration_session_v1')
  } catch {
    /* ignore */
  }
}

/** MOCK stand-in for restoring the original clean seed before explore. */
export async function mockRestoreOriginalSeed(): Promise<void> {
  await new Promise((r) => setTimeout(r, 600))
}
