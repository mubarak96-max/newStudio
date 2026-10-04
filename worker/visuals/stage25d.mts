import type { Beat, LayerPlan, Stage25dPlan } from "../../lib/story-types.ts";

type Envelope = Stage25dPlan["cameraEnvelope"];

/** Extra margin beyond the largest requested move, so a clamp never lands exactly on an edge. */
const safetyMargin = 0.03;
/** Every composition allows at least a gentle drift, even when its Beats only hold. */
const minimumPan = 0.02;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function emptyEnvelope(): Envelope {
  return { maxPanX: 0, maxPanY: 0, maxZoom: 1, maxTilt: 0 };
}

export function widenEnvelope(envelope: Envelope, camera: Beat["camera"]): void {
  for (const pose of [camera.from, camera.to]) {
    envelope.maxPanX = Math.max(envelope.maxPanX, Math.abs(pose.x));
    envelope.maxPanY = Math.max(envelope.maxPanY, Math.abs(pose.y));
    envelope.maxZoom = Math.max(envelope.maxZoom, pose.zoom);
    envelope.maxTilt = Math.max(envelope.maxTilt, Math.abs(pose.rotate));
  }
}

/**
 * Depth bands: the background owns the far third, foreground layers split the
 * near half evenly in stacking order. A wide shot's background gets a depth
 * mesh because distant scenery carries real relief; close shots give their
 * nearest subject a mesh for facial and body relief. Flat planes elsewhere.
 */
export function assignDepth(layers: LayerPlan[], _framing: string): LayerPlan[] {
  void _framing;
  const foregrounds = layers.filter((layer) => layer.role !== "background").length;
  let index = 0;
  return layers.map((layer) => {
    // The master is the whole scene in one image; it plays alone, flat.
    if (layer.kind === "master") {
      return { ...layer, depthRange: [0, 0.35] as [number, number], renderMode: "plane" as const, mesh: null };
    }
    if (layer.role === "background") {
      return {
        ...layer,
        depthRange: [0, 0.35] as [number, number],
        renderMode: "plane",
        mesh: null,
      };
    }
    const far = 0.5 + (0.45 * index) / foregrounds;
    const near = 0.5 + (0.45 * (index + 1)) / foregrounds;
    index += 1;
    return {
      ...layer,
      depthRange: [round(far), round(near)] as [number, number],
      renderMode: "plane",
      mesh: null,
    };
  });
}

/**
 * A layer at depth d moves by (0.4 + 0.6 d) of the camera pan. The background
 * edge is exposed by the pan scaled by its own factor, and a tilt swings the
 * corners out by roughly half the rotation, so the overscan covers both.
 */
export function planStage25d(envelope: Envelope, layers: LayerPlan[]): Stage25dPlan {
  const factor = (layer: LayerPlan) => round(0.4 + 0.6 * layer.depthRange[1]);
  // The plate is what the camera travels across in layered mode; the master
  // is a whole scene and never the thing parallax is measured against.
  const background = layers.find((layer) => layer.kind === "plate") ?? layers.find((layer) => layer.role === "background" && layer.kind !== "master");
  const backgroundFactor = background ? factor(background) : 1;
  const plannedSafeCamera = {
    maxPanX: round(Math.max(envelope.maxPanX, minimumPan) + safetyMargin),
    maxPanY: round(Math.max(envelope.maxPanY, minimumPan) + safetyMargin),
    maxZoom: round(Math.max(envelope.maxZoom, 1.05)),
    maxTilt: round(envelope.maxTilt + 0.01),
  };
  const tiltSpill = plannedSafeCamera.maxTilt / 2;
  const x = round(plannedSafeCamera.maxPanX * backgroundFactor + tiltSpill + safetyMargin);
  const y = round(plannedSafeCamera.maxPanY * backgroundFactor + tiltSpill + safetyMargin);
  return {
    cameraEnvelope: {
      maxPanX: round(envelope.maxPanX),
      maxPanY: round(envelope.maxPanY),
      maxZoom: round(envelope.maxZoom),
      maxTilt: round(envelope.maxTilt),
    },
    plannedSafeCamera,
    backgroundOverscan: { x, y },
    backgroundCanvas: { width: round(1 + 2 * x), height: round(1 + 2 * y) },
    parallax: Object.fromEntries(layers.map((layer) => [layer.layerId, factor(layer)])),
  };
}
