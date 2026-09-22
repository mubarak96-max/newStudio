import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import {
  assetTargetId,
  type AssetTarget,
  type AssetVersion,
  type CompositionPlan,
  type Lineage,
  type VisualAsset,
  type VisualProfile,
} from "../../lib/story-types.ts";
import { db } from "../config.mts";
import { extensionFor, imageSize } from "../providers/image-files.mts";
import type { ImageReference } from "../providers/images.mts";
import { getObject, publicUrl, putObject, s3Config } from "../storage/s3.mts";
import { planImage, sceneReference, type EntityForImage, type PlannedImage } from "./request.mts";

export type PreparedImage = {
  target: AssetTarget;
  targetId: string;
  note: string | null;
  planned: PlannedImage;
  references: ImageReference[];
  pinned: AssetVersion["references"];
};

/**
 * Builds the prompt and loads the approved references for one image. Both the
 * one-at-a-time and the batch paths use it, so a batch result and an instant
 * result for the same target are made from exactly the same inputs.
 */
export async function prepareImage(bookId: string, target: AssetTarget, note: string | null): Promise<PreparedImage> {
  const book = (await db.doc(`books/${bookId}`).get()).data();
  const profile = book?.visualProfile as VisualProfile | undefined;
  if (!profile) throw new Error("The book has no visual profile. Run visual planning first.");
  const entityDoc = target.entityId ? (await db.doc(`books/${bookId}/entities/${target.entityId}`).get()).data() : undefined;
  const entity: EntityForImage | null =
    entityDoc && entityDoc.visual?.spec
      ? { entityId: target.entityId!, name: entityDoc.canonicalName, type: entityDoc.type, visual: entityDoc.visual }
      : null;
  const composition = target.compositionId
    ? (((await db.doc(`books/${bookId}/compositions/${target.compositionId}`).get()).data() as CompositionPlan | undefined) ?? null)
    : null;
  const planned = planImage(target, { profile, entity, composition, note });

  // Only approved references condition a new image, pinned by version.
  const s3 = s3Config();
  const references: ImageReference[] = [];
  const pinned: AssetVersion["references"] = [];
  for (const candidates of planned.referenceTargets) {
    for (const candidate of candidates) {
      const asset = (await db.doc(`books/${bookId}/visualAssets/${candidate}`).get()).data() as VisualAsset | undefined;
      const version = asset?.versions?.find((item) => item.versionId === asset.approvedVersionId);
      if (!version) continue;
      const bytes = await getObject(s3, version.s3Key);
      if (!bytes) continue;
      references.push({ contentType: version.contentType, bytes });
      pinned.push({ targetId: candidate, versionId: version.versionId });
      break;
    }
  }
  // A cut-out is told the first reference is its scene; without an approved
  // background that sentence would point at the character sheet instead.
  const sceneAttached = pinned.some((pin) => pin.targetId.endsWith("__background"));
  const prompt = sceneAttached ? planned.prompt : planned.prompt.replace(` ${sceneReference}`, "");
  return { target, targetId: assetTargetId(target), note, planned: { ...planned, prompt }, references, pinned };
}

export async function markAsset(
  bookId: string,
  lineage: Lineage,
  target: AssetTarget,
  fields: Partial<Pick<VisualAsset, "status" | "error" | "lastJobId" | "episodeId" | "batchId">>,
): Promise<void> {
  await db
    .doc(`books/${bookId}/visualAssets/${assetTargetId(target)}`)
    .set({ ...lineage, ...target, targetId: assetTargetId(target), ...fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Uploads the image to S3 and appends it as a new version; the approved version is left alone. */
export async function saveVersion(
  bookId: string,
  lineage: Lineage,
  item: {
    target: AssetTarget;
    note: string | null;
    prompt: string;
    role: string;
    alpha: AssetVersion["alpha"];
    episodeId: string | null;
    references: AssetVersion["references"];
  },
  image: { bytes: Buffer; contentType: string; model: string; costUsd: number; costExact: boolean; provider: AssetVersion["provider"] },
): Promise<AssetVersion> {
  const s3 = s3Config();
  const versionId = randomUUID();
  const s3Key = `books/${bookId}/assets/${versionId}/${item.role}.${extensionFor(image.contentType)}`;
  await putObject(s3, s3Key, image.bytes, image.contentType);
  const size = imageSize(image.bytes);
  const version: AssetVersion = {
    versionId,
    s3Key,
    url: publicUrl(s3, s3Key),
    contentType: image.contentType,
    width: size?.width ?? null,
    height: size?.height ?? null,
    sizeBytes: image.bytes.length,
    checksum: createHash("sha256").update(image.bytes).digest("hex"),
    model: image.model,
    costUsd: image.costUsd,
    prompt: item.prompt,
    note: item.note,
    references: item.references,
    alpha: item.alpha,
    provider: image.provider,
    costExact: image.costExact,
    createdAt: new Date().toISOString(),
  };
  await db.doc(`books/${bookId}/visualAssets/${assetTargetId(item.target)}`).set(
    {
      ...lineage,
      ...item.target,
      targetId: assetTargetId(item.target),
      episodeId: item.episodeId,
      versions: FieldValue.arrayUnion(version),
      status: "generated",
      error: null,
      batchId: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return version;
}
