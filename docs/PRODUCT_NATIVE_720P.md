# Product decision: native 720p only

**Decision date:** 2026-10-10  
**Status:** Binding for all future frontend work on World Explorer / Create Anything.

## Decision

WorldShift’s user-facing Waypoint product is **native 1280×720 only**.

| Rule | Requirement |
|------|-------------|
| Product resolution | **1280×720** (16:9) |
| 360p / 640×360 experience | **Retired** from the product |
| 360p selector | **Do not implement** |
| 360p fallback mode | **Do not implement** |
| 360p demo mode | **Do not implement** |
| Old Git release (360p-era) | Retained for **recovery / archaeology only** — not a product feature |

## Alignment target

Future frontend work assumes the **experimental native 1280×720 Waypoint backend** and its documented API contract once Codex publishes the **final validated 720p integration** document.

Until that contract lands:

- **Do not** merge experimental backend changes into this frontend as authoritative.
- **Do not** rewrite stream adapters (`useWorldStream`, envelope parsers, `worldApi` wire shape) to chase unvalidated 720p prototypes.
- **Do** keep optimizing presentation, controls, recovery UX, and status accuracy for native-720p playback.

Authoritative SDXL HQ starters already target **1280×720** (`HQ_TARGET` / contact sheet). Turbo ≤4-step seeds remain a secondary verified path for Create Anything, not a 360p product mode.

## Frontend focus (allowed now)

1. **Native-720p playback performance** — canvas/CSS sized for 1280×720, avoid muddy upscale of retired 360p assumptions  
2. **Responsive controls** — look/WASD/stability remain usable at 720p viewport sizes  
3. **Visual recovery transitions** — restore / scene-start / unsuitable-anchor policy (no blurry Waypoint anchors)  
4. **Accurate status indicators** — show live frame width×height; flag streams below 1280×720 as non-product without offering a 360p mode  

## Must remain intact

- Rescue Mission (`/mission`)  
- AI Showdown (`/agents`)  
- Simulation Lab / static rescue data  
- Production backend port **8000** workflow on Windows  
- Existing verified release history in Git (reference only)

## Adapter freeze (720p)

See also [codex/ADAPTER_FREEZE.md](./codex/ADAPTER_FREEZE.md).

Stream adapter rewrites wait for Codex’s **validated 720p integration contract**. Presentation constants and telemetry labels may target 720p now; wire-protocol changes may not.
