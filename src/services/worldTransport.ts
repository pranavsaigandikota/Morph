import type { WorldControlMessage, WorldFrameMeta, WorldStatusMessage } from '../types/world'

export type TransportInbound =
  | { kind: 'meta'; meta: WorldFrameMeta }
  | { kind: 'frame'; bytes: ArrayBuffer; meta: WorldFrameMeta }
  | { kind: 'status'; status: WorldStatusMessage }
  | { kind: 'unknown'; raw: unknown }

/**
 * FrameTransport isolates WebSocket wire framing from the UI.
 *
 * Current mock protocol (v1):
 *   1. Text JSON message with type "frame_meta" | "status"
 *   2. Binary message containing image bytes for the prior meta
 *
 * Engine team can replace decode/encode without touching React components.
 */
export class FrameTransport {
  private pendingMeta: WorldFrameMeta | null = null
  private onInbound: (msg: TransportInbound) => void

  constructor(onInbound: (msg: TransportInbound) => void) {
    this.onInbound = onInbound
  }

  handleMessage(data: ArrayBuffer | string): void {
    if (typeof data === 'string') {
      this.handleText(data)
      return
    }
    this.handleBinary(data)
  }

  /** Future: single binary envelope — magic + metaLen + metaJSON + image */
  static encodeFramedBinary(meta: WorldFrameMeta, image: ArrayBuffer): ArrayBuffer {
    const metaBytes = new TextEncoder().encode(JSON.stringify(meta))
    const buffer = new ArrayBuffer(8 + metaBytes.length + image.byteLength)
    const view = new DataView(buffer)
    view.setUint32(0, 0x57534631) // "WSF1"
    view.setUint32(4, metaBytes.length)
    new Uint8Array(buffer, 8, metaBytes.length).set(metaBytes)
    new Uint8Array(buffer, 8 + metaBytes.length).set(new Uint8Array(image))
    return buffer
  }

  static tryDecodeFramedBinary(data: ArrayBuffer): TransportInbound | null {
    if (data.byteLength < 8) return null
    const view = new DataView(data)
    if (view.getUint32(0) !== 0x57534631) return null
    const metaLen = view.getUint32(4)
    if (8 + metaLen > data.byteLength) return null
    const metaJson = new TextDecoder().decode(new Uint8Array(data, 8, metaLen))
    const meta = JSON.parse(metaJson) as WorldFrameMeta
    const image = data.slice(8 + metaLen)
    return { kind: 'frame', bytes: image, meta }
  }

  encodeControl(msg: WorldControlMessage): string {
    return JSON.stringify(msg)
  }

  encodePause(): string {
    return JSON.stringify({ type: 'pause' })
  }

  encodeResume(): string {
    return JSON.stringify({ type: 'resume' })
  }

  private handleText(text: string): void {
    try {
      const parsed = JSON.parse(text) as { type?: string }
      if (parsed.type === 'frame_meta') {
        this.pendingMeta = parsed as WorldFrameMeta
        this.onInbound({ kind: 'meta', meta: this.pendingMeta })
        return
      }
      if (parsed.type === 'status') {
        this.onInbound({ kind: 'status', status: parsed as WorldStatusMessage })
        return
      }
      this.onInbound({ kind: 'unknown', raw: parsed })
    } catch {
      this.onInbound({ kind: 'unknown', raw: text })
    }
  }

  private handleBinary(data: ArrayBuffer): void {
    const framed = FrameTransport.tryDecodeFramedBinary(data)
    if (framed) {
      this.onInbound(framed)
      this.pendingMeta = null
      return
    }
    if (!this.pendingMeta) {
      this.onInbound({ kind: 'unknown', raw: data })
      return
    }
    const meta = this.pendingMeta
    this.pendingMeta = null
    this.onInbound({ kind: 'frame', bytes: data, meta })
  }
}
