import { randomUUID } from "node:crypto";
import {
  assetTargetId,
  type AssembledLayer,
  type Beat,
  type CameraPose,
  type CompositionAssembly,
  type CompositionPlan,
  type VisualAsset,
} from "../../lib/story-types.ts";
import { baseScaleFor, boxInFrame, clampPose, parallaxFor, safeCameraFor } from "../../lib/stage25d.ts";
import { db } from "../config.mts";
import { getObject, publicUrl, putObject, s3Config } from "../storage/s3.mts";
import { imageDimensions, keyGreenScreen } from "./keying.mts";

/** The 9:16 canvas every layer was generated on. */
const canvasAspect = 9 / 16;

export type ApprovedLayer = { versionId: string; s3Key: string; url: string; alpha: "none" | "chroma-green" };

export async function approvedLayers(bookId: string, composition: CompositionPlan): Promise<Map<string, ApprovedLayer>> {
  const approved = new Map<string, ApprovedLayer>();
  for (const layer of composition.layers) {
    const targetId = assetTargetId({
      kind: "layer",
      entityId: null,
      stateId: null,
      compositionId: composition.compositionId,
      layerId: layer.layerId,
    });
    const asset = (await db.doc(`books/${bookId}/visualAssets/${targetId}`).get()).data() as VisualAsset | undefined;
    const version = asset?.versions?.find((item) => item.versionId === asset.approvedVersionId);
    if (version) approved.set(layer.layerId, { versionId: version.versionId, s3Key: version.s3Key, url: version.url, alpha: version.alpha });
  }
  return approved;
}

export function fingerprintOf(approved: Map<string, ApprovedLayer>): string {
  return [...approved.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([layerId, version]) => `${layerId}:${version.versionId}`)
    .join("|");
}

/**
 * Builds the playable composition from the approved layer images: keys the
 * green-screen cut-outs to real transparency, checks each layer against the
 * shared 9:16 canvas, and derives the scale and safe camera from the actual
 * background rather than the plan's intent.
 */
export async function assembleComposition(
  bookId: string,
  composition: CompositionPlan,
  approved: Map<string, ApprovedLayer>,
  previous: CompositionAssembly | undefined,
): Promise<CompositionAssembly> {
  const s3 = s3Config();
  const issues: string[] = [];
  const reused = new Map((previous?.layers ?? []).map((layer) => [layer.layerId, layer]));
  const parallaxOf = (layerId: string, depthNear: number) => composition.stage25d?.parallax?.[layerId] ?? parallaxFor(depthNear);

  // Master first: layered playback needs the derived plate and every cut-out
  // approved together. Anything missing and the approved master plays flat,
  // which is worse 2.5D but never a broken or mis-scaled picture.
  const master = composition.layers.find((layer) => layer.kind === "master");
  const derived = composition.layers.filter((layer) => layer.kind !== "master");
  const derivedReady = derived.length > 0 && derived.every((layer) => approved.has(layer.layerId));
  const mode: "layered" | "flat" = derivedReady ? "layered" : "flat";
  const playing = mode === "layered" ? derived : master ? [master] : composition.layers;
  if (mode === "flat" && master && derived.length > 0) {
    issues.push(
      `${derived.filter((layer) => !approved.has(layer.layerId)).length} derived layer(s) are not approved; playing the master flat.`,
    );
  }
  const background = playing.find((layer) => layer.role === "background");
  const backgroundParallax = background ? parallaxOf(background.layerId, background.depthRange[1]) : 0.4;
  const planned = composition.stage25d?.plannedSafeCamera;
  const scale = baseScaleFor(planned?.maxPanX ?? 0.05, planned?.maxPanY ?? 0.05, backgroundParallax);

  const layers: AssembledLayer[] = [];
  for (const layer of playing) {
    const version = approved.get(layer.layerId);
    if (!version) {
      issues.push(`${layer.layerId}: no approved image yet.`);
      continue;
    }
    const earlier = reused.get(layer.layerId);
    if (earlier && earlier.sourceVersionId === version.versionId) {
      layers.push({ ...earlier, scale, parallax: parallaxOf(layer.layerId, layer.depthRange[1]) });
      continue;
    }
    const bytes = await getObject(s3, version.s3Key);
    if (!bytes) {
      issues.push(`${layer.layerId}: approved image is missing from storage.`);
      continue;
    }
    let assembled: Omit<AssembledLayer, "scale" | "parallax">;
    if (version.alpha === "chroma-green") {
      const keyed = await keyGreenScreen(bytes);
      const s3Key = `books/${bookId}/assets/${randomUUID()}/${layer.layerId}-keyed.webp`;
      await putObject(s3, s3Key, keyed.bytes, keyed.contentType);
      if (keyed.opaqueFraction < 0.01) issues.push(`${layer.layerId}: almost nothing survived keying; the subject may itself be green.`);
      if (keyed.opaqueFraction > 0.9) issues.push(`${layer.layerId}: the green screen was not found; the cut-out would hide the scene.`);
      assembled = {
        layerId: layer.layerId,
        role: layer.role,
        entityId: layer.entityId,
        entityIds: layer.entityIds ?? (layer.entityId ? [layer.entityId] : []),
        url: publicUrl(s3, s3Key),
        s3Key,
        width: keyed.width,
        height: keyed.height,
        zOrder: layer.zOrder,
        depthRange: layer.depthRange,
        opaqueFraction: Math.round(keyed.opaqueFraction * 1000) / 1000,
        bbox: keyed.bbox,
        sourceVersionId: version.versionId,
      };
    } else {
      const size = await imageDimensions(bytes);
      assembled = {
        layerId: layer.layerId,
        role: layer.role,
        entityId: layer.entityId,
        entityIds: layer.entityIds ?? (layer.entityId ? [layer.entityId] : []),
        url: version.url,
        s3Key: version.s3Key,
        width: size.width,
        height: size.height,
        zOrder: layer.zOrder,
        depthRange: layer.depthRange,
        opaqueFraction: 1,
        bbox: { x: 0, y: 0, w: 1, h: 1 },
        sourceVersionId: version.versionId,
      };
    }
    if (assembled.height > 0 && Math.abs(assembled.width / assembled.height - canvasAspect) > 0.03) {
      issues.push(`${layer.layerId}: ${assembled.width}×${assembled.height} is not the 9:16 canvas; it is fitted by cropping.`);
    }
    layers.push({ ...assembled, scale, parallax: parallaxOf(layer.layerId, layer.depthRange[1]) });
  }
  if (!layers.some((layer) => layer.role === "background")) issues.push("No approved background: this composition cannot play.");
  // Playing the master flat is a supported outcome, not a failure: the reader
  // still sees the right scene with camera movement over it.
  const playable = layers.some((layer) => layer.role === "background");
  const blocking = issues.filter((issue) => !issue.includes("playing the master flat"));

  return {
    status: playable && blocking.length === 0 ? "composed" : "issues",
    mode,
    layers: layers.sort((left, right) => left.zOrder - right.zOrder),
    safeCamera: safeCameraFor(scale, backgroundParallax, planned?.maxZoom ?? 1.2),
    issues,
    fingerprint: fingerprintOf(approved),
    composedAt: new Date().toISOString(),
  };
}

/**
 * Stretches a planned move to the margin the images actually allow, keeping
 * its shape: the ratio between the two poses, and between x and y, is
 * preserved, so a gentle drift stays gentler than a pan.
 */
function scaleToSafeCamera(
  camera: Beat["camera"],
  safe: CompositionAssembly["safeCamera"],
): { from: CameraPose; to: CameraPose } {
  const intent = Math.max(Math.abs(camera.from.x), Math.abs(camera.to.x), Math.abs(camera.from.y), Math.abs(camera.to.y));
  if (intent <= 0) return { from: camera.from, to: camera.to };
  const room = Math.min(safe.maxPanX, safe.maxPanY);
  const gain = Math.max(1, room / intent);
  const stretch = (pose: CameraPose): CameraPose => ({ ...pose, x: pose.x * gain, y: pose.y * gain });
  return { from: stretch(camera.from), to: stretch(camera.to) };
}

/**
 * Fits a Beat to its assembled composition: the camera is clamped to what the
 * images allow, and each tappable entity gets the box of its own cut-out.
 */
export function fitBeat(beat: Beat, assembly: CompositionAssembly | undefined): { beat: Beat; clamped: boolean } {
  if (!assembly) return { beat, clamped: false };
  // Beats plan a move in intent, not in pixels. The images decide how far the
  // camera can really travel, so the intended move is stretched to use that
  // margin: planning at a flat ±0.04 made the depth effect invisible.
  const scaled = scaleToSafeCamera(beat.camera, assembly.safeCamera);
  const from = clampPose(scaled.from, assembly.safeCamera);
  const to = clampPose(scaled.to, assembly.safeCamera);
  const clamped = JSON.stringify(from) !== JSON.stringify(beat.camera.from) || JSON.stringify(to) !== JSON.stringify(beat.camera.to);
  const scale = assembly.layers[0]?.scale ?? 1;
  const inspectables = beat.inspectables.map((item) => {
    const layer = assembly.layers.find(
      (candidate) => candidate.role !== "background" && (candidate.entityId === item.entityId || candidate.entityIds?.includes(item.entityId)),
    );
    return { entityId: item.entityId, hotspot: layer?.bbox ? boxInFrame(layer.bbox, scale) : null };
  });
  return { beat: { ...beat, camera: { ...beat.camera, from, to }, inspectables }, clamped };
}
