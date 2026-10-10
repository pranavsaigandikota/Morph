/**
 * Native Waypoint presentation — product is 1280×720 only.
 * See docs/PRODUCT_NATIVE_720P.md. No 360p selector, fallback, or demo mode.
 * Mild filters cannot invent generative detail.
 */

/** Product-native Waypoint frame size (experimental 720p backend target). */
export const NATIVE_FRAME_W = 1280
export const NATIVE_FRAME_H = 720

/** Prefer 1× native pixels; CSS may shrink responsively, not stretch muddy 360p. */
export const PREFERRED_DISPLAY_SCALE = 1

export function preferredDisplaySize(
  scale: number = PREFERRED_DISPLAY_SCALE,
): { width: number; height: number } {
  return {
    width: Math.round(NATIVE_FRAME_W * scale),
    height: Math.round(NATIVE_FRAME_H * scale),
  }
}

/** True when reported frame matches product native 720p. */
export function isProductNativeResolution(width: number, height: number): boolean {
  return width >= NATIVE_FRAME_W && height >= NATIVE_FRAME_H
}

/**
 * Draw a JPEG frame for clarity at native / near-native size.
 * Mild contrast/saturation only — does not fix model drift.
 */
export function drawClearFrame(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  width: number,
  height: number,
): void {
  if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
    ctx.canvas.width = width
    ctx.canvas.height = height
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Light clarity only — avoid aggressive sharpening / halos.
  ctx.filter = 'contrast(1.03) saturate(1.02)'
  ctx.drawImage(img, 0, 0, width, height)
  ctx.filter = 'none'
}
