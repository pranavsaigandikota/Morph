/**
 * @deprecated Prefer waypointEnvelope.ts — Waypoint Phase-2 is the live Codex protocol.
 * Kept as a thin re-export so older notes still resolve.
 */
export {
  encodeControl,
  parseBatchEnvelope,
  type WaypointControlMessage as WorldControlMessage,
  type WaypointFrameHeader,
  type WaypointHello,
} from './waypointEnvelope'
