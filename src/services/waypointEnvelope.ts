/**
 * Waypoint Phase-2 binary batch envelope (Biome-compatible).
 *
 * Layout (little-endian uint32 lengths):
 *   [4 header_len][JSON FrameHeader][4 sub_count] × [4 jpeg_len][JPEG bytes]
 *
 * One WebSocket binary message per gen_frame() batch (temporal_compression JPEGs).
 * Coordinated with Codex / run/server/app/stream/envelope.py — do not invent encodings.
 */

export interface WaypointFrameHeader {
  frame_id: number
  gen_ms: number
  temporal_compression: number
  client_ts?: number | null
}

export interface ParsedBatch {
  header: WaypointFrameHeader
  jpegs: Uint8Array[]
}

export function parseBatchEnvelope(buf: ArrayBuffer): ParsedBatch {
  const dv = new DataView(buf)
  const dec = new TextDecoder()
  let p = 0
  if (buf.byteLength < 8) throw new Error('envelope too short')

  const hlen = dv.getUint32(p, true)
  p += 4
  if (p + hlen > buf.byteLength) throw new Error('envelope header truncated')
  const header = JSON.parse(dec.decode(new Uint8Array(buf, p, hlen))) as WaypointFrameHeader
  p += hlen

  const sub = dv.getUint32(p, true)
  p += 4
  const jpegs: Uint8Array[] = []
  for (let i = 0; i < sub; i++) {
    if (p + 4 > buf.byteLength) throw new Error('envelope jpeg length truncated')
    const jl = dv.getUint32(p, true)
    p += 4
    if (p + jl > buf.byteLength) throw new Error('envelope jpeg truncated')
    jpegs.push(new Uint8Array(buf, p, jl))
    p += jl
  }
  return { header, jpegs }
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

export interface WaypointHello {
  type: 'hello'
  session_id: string
  engine: string
  width: number
  height: number
  temporal_compression: number
  seed?: string
  mock?: boolean
}

export interface WaypointControlMessage {
  type: 'control'
  buttons: string[]
  dx: number
  dy: number
  scroll: number
  ts: number
}

export function encodeControl(msg: Omit<WaypointControlMessage, 'type'>): string {
  return JSON.stringify({ type: 'control', ...msg })
}

/** KeyboardEvent.code → Waypoint keycap (docs/13-action-and-input-space.md). */
export const KEYCAPS: Record<string, string> = {
  KeyW: 'W',
  KeyA: 'A',
  KeyS: 'S',
  KeyD: 'D',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  Space: 'SPACE',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
}

export const MOUSE_BTN: Record<number, string> = {
  0: 'MOUSE_LEFT',
  1: 'MOUSE_MIDDLE',
  2: 'MOUSE_RIGHT',
}
