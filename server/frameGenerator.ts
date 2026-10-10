import { deflateSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcBuf), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

/** Encode raw RGB pixels into a PNG buffer (no alpha). */
export function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0
    rgb.copy(raw, rowStart + 1, y * stride, (y + 1) * stride)
  }

  const compressed = deflateSync(raw)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

export interface ViewState {
  yaw: number
  pitch: number
  x: number
  z: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/**
 * Procedurally paint a first-person research-facility view (RGB buffer).
 * Synthetic mock imagery for frontend development — not engine output.
 */
export function generateFacilityRgb(
  width: number,
  height: number,
  view: ViewState,
  frameId: number,
): Buffer {
  const rgb = Buffer.alloc(width * height * 3)
  const fog = 0.55
  const time = frameId * 0.08

  for (let y = 0; y < height; y++) {
    const ny = (y / height) * 2 - 1
    for (let x = 0; x < width; x++) {
      const nx = (x / width) * 2 - 1
      const rayYaw = view.yaw + nx * 0.7
      const rayPitch = view.pitch + ny * 0.45

      // Floor / ceiling split via pitch
      const horizon = 0.12 + Math.sin(rayPitch) * 0.35
      const isFloor = ny > horizon

      let r = 18
      let g = 24
      let b = 32

      if (isFloor) {
        const depth = 1 / Math.max(0.08, (ny - horizon) * 2.2)
        const fx = view.x + Math.cos(rayYaw) * depth * 4
        const fz = view.z + Math.sin(rayYaw) * depth * 4
        const tile = (Math.floor(fx) + Math.floor(fz)) & 1
        const shade = clamp(1.15 - depth * 0.08, 0.25, 1)
        if (tile) {
          r = 42 * shade
          g = 52 * shade
          b = 62 * shade
        } else {
          r = 28 * shade
          g = 34 * shade
          b = 42 * shade
        }
        // Hazard strip markings
        if (Math.abs((fx % 8) - 4) < 0.15) {
          r = 200 * shade
          g = 140 * shade
          b = 30 * shade
        }
      } else {
        // Ceiling panels + overhead lights
        const depth = 1 / Math.max(0.08, (horizon - ny) * 2.4)
        const cx = view.x + Math.cos(rayYaw) * depth * 3.5
        const cz = view.z + Math.sin(rayYaw) * depth * 3.5
        const panel = (Math.floor(cx / 2) + Math.floor(cz / 2)) & 1
        const shade = clamp(1.05 - depth * 0.07, 0.2, 1)
        r = (panel ? 36 : 22) * shade
        g = (panel ? 48 : 30) * shade
        b = (panel ? 58 : 40) * shade

        // Flickering light fixtures
        const light = Math.sin(cx * 1.7 + time) * Math.cos(cz * 1.3 - time * 0.7)
        if (light > 0.82) {
          r = 180 * shade
          g = 210 * shade
          b = 220 * shade
        }
      }

      // Side walls via ray distance approximation
      const wallHit = Math.abs(Math.sin(rayYaw * 2 + view.x * 0.2))
      if (wallHit > 0.92 && Math.abs(ny) < 0.55) {
        const shade = 0.55 + 0.2 * Math.sin(ny * 20 + frameId * 0.02)
        r = 55 * shade
        g = 72 * shade
        b = 88 * shade
        // Window glow
        if (Math.abs(ny) < 0.2 && wallHit > 0.97) {
          r = 40
          g = 180
          b = 170
        }
      }

      // Soft vignette + scanline for “generated” feel
      const vig = 1 - (nx * nx + ny * ny) * 0.35
      const scan = y % 3 === 0 ? 0.92 : 1
      const mockTint = 1 + 0.03 * Math.sin(time + x * 0.01)

      const i = (y * width + x) * 3
      rgb[i] = clamp(r * vig * scan * mockTint * fog + 8, 0, 255)
      rgb[i + 1] = clamp(g * vig * scan * fog + 10, 0, 255)
      rgb[i + 2] = clamp(b * vig * scan * fog + 14, 0, 255)
    }
  }

  // Burn a small MOCK watermark into the bottom-right pixels
  stampMockLabel(rgb, width, height)

  return rgb
}

/** PNG-encoded facility frame (legacy mock path). */
export function generateFacilityFrame(
  width: number,
  height: number,
  view: ViewState,
  frameId: number,
): Buffer {
  return encodePng(width, height, generateFacilityRgb(width, height, view, frameId))
}

/** RGBA buffer for jpeg-js encode. */
export function generateFacilityRgba(
  width: number,
  height: number,
  view: ViewState,
  frameId: number,
): Buffer {
  const rgb = generateFacilityRgb(width, height, view, frameId)
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    rgba[j] = rgb[i]!
    rgba[j + 1] = rgb[i + 1]!
    rgba[j + 2] = rgb[i + 2]!
    rgba[j + 3] = 255
  }
  return rgba
}

function stampMockLabel(rgb: Buffer, width: number, height: number): void {
  const label = [
    '### # # ### # #',
    '# # # # # # # #',
    '### # # # # ## ',
    '# # # # # # # #',
    '# # ### ### # #',
  ]
  const ox = width - 78
  const oy = height - 22
  for (let ly = 0; ly < label.length; ly++) {
    const row = label[ly]!
    for (let lx = 0; lx < row.length; lx++) {
      if (row[lx] !== '#') continue
      const px = ox + lx * 2
      const py = oy + ly * 2
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = px + dx
          const y = py + dy
          if (x < 0 || y < 0 || x >= width || y >= height) continue
          const i = (y * width + x) * 3
          rgb[i] = 249
          rgb[i + 1] = 115
          rgb[i + 2] = 22
        }
      }
    }
  }
}

export function applyControls(
  view: ViewState,
  keys: string[],
  mouseDx: number,
  mouseDy: number,
): ViewState {
  const next = { ...view }
  next.yaw += mouseDx * 0.0025
  next.pitch = clamp(next.pitch + mouseDy * 0.002, -0.6, 0.6)

  const speed = 0.18
  const forward = keys.includes('w') ? 1 : keys.includes('s') ? -1 : 0
  const strafe = keys.includes('d') ? 1 : keys.includes('a') ? -1 : 0
  next.x += Math.cos(next.yaw) * forward * speed + Math.cos(next.yaw + Math.PI / 2) * strafe * speed
  next.z += Math.sin(next.yaw) * forward * speed + Math.sin(next.yaw + Math.PI / 2) * strafe * speed
  return next
}
