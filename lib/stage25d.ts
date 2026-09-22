/**
 * The 2.5D camera model shared by the assembly job (worker) and the preview
 * player (Studio), so what the worker declares safe is exactly what plays.
 *
 * Frame units: the visible 9:16 frame is 1 × 1; camera x/y are signed
 * fractions of the frame from its centre (positive right/down).
 *
 * Every layer is drawn at `scale` (the same for all layers of a composition,
 * so they stay aligned), grown by camera zoom in proportion to its parallax,
 * and shifted by the camera pan times its parallax. Nearer layers have a
 * larger parallax, so they move more: that difference is the depth effect.
 */

export type CameraPose = { x: number; y: number; zoom: number; rotate: number };
export type SafeCamera = { maxPanX: number; maxPanY: number; maxZoom: number; maxTilt: number };

/** How far a layer at depth `near` moves for a camera pan of 1. */
export function parallaxFor(depthNear: number): number {
  return Math.round((0.4 + 0.6 * depthNear) * 1000) / 1000;
}

export function layerTransform(pose: CameraPose, scale: number, parallax: number) {
  return {
    scale: scale * (1 + (pose.zoom - 1) * parallax),
    x: -pose.x * parallax,
    y: -pose.y * parallax,
    rotate: -pose.rotate * parallax,
  };
}

const maxBaseScale = 1.3;

/**
 * The base scale that lets the background travel `pan` in each direction
 * without showing an edge, capped so the painted composition is not cropped
 * away. With the background at `scale`, its edge stays outside the frame while
 * |pan · parallax| ≤ (scale − 1) / 2.
 */
export function baseScaleFor(panX: number, panY: number, backgroundParallax: number): number {
  const needed = 1 + 2 * backgroundParallax * Math.max(panX, panY);
  return Math.round(Math.min(maxBaseScale, Math.max(1, needed)) * 1000) / 1000;
}

/** The pan the background actually allows at a given base scale; zoom ≥ 1 only adds room. */
export function safeCameraFor(scale: number, backgroundParallax: number, maxZoom: number): SafeCamera {
  const pan = backgroundParallax > 0 ? (scale - 1) / (2 * backgroundParallax) : 0;
  const rounded = Math.floor(pan * 1000) / 1000;
  return { maxPanX: rounded, maxPanY: rounded, maxZoom: Math.min(1.6, Math.max(1, maxZoom)), maxTilt: 0 };
}

function clampValue(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

export function clampPose(pose: CameraPose, safe: SafeCamera): CameraPose {
  return {
    x: clampValue(pose.x, safe.maxPanX),
    y: clampValue(pose.y, safe.maxPanY),
    zoom: Math.max(1, Math.min(safe.maxZoom, pose.zoom)),
    rotate: clampValue(pose.rotate, safe.maxTilt),
  };
}

/** Where a canvas-space box appears in the frame with the camera at rest. */
export function boxInFrame(box: { x: number; y: number; w: number; h: number }, scale: number) {
  const x = 0.5 + (box.x - 0.5) * scale;
  const y = 0.5 + (box.y - 0.5) * scale;
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(1, x + box.w * scale);
  const bottom = Math.min(1, y + box.h * scale);
  if (right <= left || bottom <= top) return null;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return { x: round(left), y: round(top), w: round(right - left), h: round(bottom - top) };
}
