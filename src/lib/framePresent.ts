/**
 * Small-frame presentation helpers for native Waypoint 640×360 JPEGs.
 * Prefer a clear, modest display over a blurry fullscreen stretch.
 * Filters cannot invent lost generative detail.
 */

export const NATIVE_FRAME_W = 640
export const NATIVE_FRAME_H = 360
/** Prefer up to 1.5× native — still readable, less muddy than full-bleed. */
export const PREFERRED_DISPLAY_SCALE = 1.5

export function preferredDisplaySize(
  scale: number = PREFERRED_DISPLAY_SCALE,
): { width: number; height: number } {
  return {
    width: Math.round(NATIVE_FRAME_W * scale),
    height: Math.round(NATIVE_FRAME_H * scale),
  }
}

/**
 * Draw a JPEG frame for clarity at small size.
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
  ctx.filter = 'contrast(1.12) saturate(1.06) brightness(1.03)'
  ctx.drawImage(img, 0, 0, width, height)
  ctx.filter = 'none'
}
