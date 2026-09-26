import { ruleVersions } from "../../lib/rules.ts";
import { eligibleLayers } from "./eligibility.mts";
import { createHash, randomUUID } from "node:crypto";
import {
  type AssembledLayer,
  type Beat,
  type CompositionAssembly,
  type CompositionPlan,
  type VisualAsset,
  type VisualProfile,
} from "../../lib/story-types.ts";
import { baseScaleFor, boxInFrame, clampPose, parallaxFor, safeCameraFor } from "../../lib/stage25d.ts";
import { getObject, publicUrl, putObject, s3Config } from "../storage/s3.mts";
import { imageDimensions, keyGreenScreen } from "./keying.mts";

/** The 9:16 canvas every layer was generated on. */
const canvasAspect = 9 / 16;

export type ApprovedLayer = { versionId: string; s3Key: string; url: string; alpha: "none" | "chroma-green" };

export async function approvedLayers(bookId: string, composition: CompositionPlan): Promise<Map<string, ApprovedLayer>> {
  const { db } = await import("../config.mts");
  const [snapshot, book] = await Promise.all([db.collection(`books/${bookId}/visualAssets`).get(), db.doc(`books/${bookId}`).get()]);
  const assets = new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as VisualAsset]));
  const profile = book.data()?.visualProfile as VisualProfile | undefined;
  return profile ? eligibleLayers(composition, assets, profile) : new Map();
}

export function fingerprintOf(approved: Map<string, ApprovedLayer>, composition: CompositionPlan): string {
  return createHash("sha256").update(JSON.stringify([
    ruleVersions.composition, ruleVersions.imageChecks, composition.layers, composition.shotSnapshot, composition.stage25d,
    [...approved.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, version]) => [id, version.versionId]),
  ])).digest("hex");
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
  io?: { read: (key: string) => Promise<Buffer | null>; write: (key: string, bytes: Buffer, contentType: string) => Promise<unknown>; url: (key: string) => string },
): Promise<CompositionAssembly> {
  const s3 = io ? null : s3Config();
  const storage = io ?? { read: (key: string) => getObject(s3!, key), write: (key: string, bytes: Buffer, contentType: string) => putObject(s3!, key, bytes, contentType), url: (key: string) => publicUrl(s3!, key) };
  const issues: string[] = [];
  const reused = new Map((previous?.status === "composed" && previous.fingerprint === fingerprintOf(approved, composition) ? previous.layers : []).map((layer) => [layer.layerId, layer]));
  const parallaxOf = (layerId: string, depthNear: number) => composition.stage25d?.parallax?.[layerId] ?? parallaxFor(depthNear);

  // Master first: layered playback needs the derived plate and every cut-out
  // approved together. Anything missing and the approved master plays flat,
  // which is worse 2.5D but never a broken or mis-scaled picture.
  const master = composition.layers.find((layer) => layer.kind === "master");
  if (!master || !approved.has(master.layerId)) return { status: "issues", mode: "flat", layers: [], safeCamera: { maxPanX: 0, maxPanY: 0, maxZoom: 1, maxTilt: 0 }, issues: ["No validated complete master scene."], fingerprint: fingerprintOf(approved, composition), composedAt: new Date().toISOString() };
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
    const bytes = await storage.read(version.s3Key);
    if (!bytes) {
      issues.push(`${layer.layerId}: approved image is missing from storage.`);
      continue;
    }
    let assembled: Omit<AssembledLayer, "scale" | "parallax">;
    if (version.alpha === "chroma-green") {
      const keyed = await keyGreenScreen(bytes);
      const s3Key = `books/${bookId}/assets/${randomUUID()}/${layer.layerId}-keyed.webp`;
      await storage.write(s3Key, keyed.bytes, keyed.contentType);
      if (keyed.opaqueFraction < 0.01) issues.push(`${layer.layerId}: almost nothing survived keying; the subject may itself be green.`);
      if (keyed.opaqueFraction > 0.9) issues.push(`${layer.layerId}: the green screen was not found; the cut-out would hide the scene.`);
      assembled = {
        layerId: layer.layerId,
        role: layer.role,
        entityId: layer.entityId,
        entityIds: layer.entityIds ?? (layer.entityId ? [layer.entityId] : []),
        url: storage.url(s3Key),
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

  if (mode === "layered" && blocking.length > 0) {
    const fallback = await assembleComposition(bookId, { ...composition, layers: [master] }, approved, undefined, storage);
    return { ...fallback, degradationReason: blocking.join(" "), fingerprint: fingerprintOf(approved, composition) };
  }
  return {
    masterUrl: approved.get(master.layerId)!.url,
    degradationReason: mode === "flat" && derived.length ? issues.join(" ") : null,
    status: playable && blocking.length === 0 ? "composed" : "issues",
    mode,
    layers: layers.sort((left, right) => left.zOrder - right.zOrder),
    safeCamera: safeCameraFor(scale, backgroundParallax, planned?.maxZoom ?? 1.2),
    issues,
    fingerprint: fingerprintOf(approved, composition),
    composedAt: new Date().toISOString(),
  };
}

/**
 * Fits a Beat to its assembled composition: the camera is clamped to what the
 * images allow, and each tappable entity gets the box of its own cut-out.
 */
export function fitBeat(beat: Beat, assembly: CompositionAssembly | undefined): { beat: Beat; clamped: boolean } {
  if (!assembly) return { beat, clamped: false };
  const from = clampPose(beat.camera.from, assembly.safeCamera);
  const to = clampPose(beat.camera.to, assembly.safeCamera);
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
