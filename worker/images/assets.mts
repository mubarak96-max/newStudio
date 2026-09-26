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
import { versionIssues } from "../../lib/asset-validation.ts";
import { ruleVersions } from "../../lib/rules.ts";
import { db } from "../config.mts";
import { extensionFor, imageSize } from "../providers/image-files.mts";
import type { ImageReference } from "../providers/images.mts";
import { getObject, publicUrl, putObject, s3Config } from "../storage/s3.mts";
import { planImage, imagePlanKey, type EntityForImage, type PlannedImage } from "./request.mts";

export type PreparedImage = {
  target: AssetTarget;
  targetId: string;
  note: string | null;
  planned: PlannedImage;
  references: ImageReference[];
  pinned: AssetVersion["references"];
  planKey: string;
  visualProfileVersion: number;
  expectation: { cutOut: boolean } | null;
};

/**
 * Builds the prompt and loads the approved references for one image. Both the
 * one-at-a-time and the batch paths use it, so a batch result and an instant
 * result for the same target are made from exactly the same inputs.
 */
export async function loadImagePlan(bookId: string, target: AssetTarget, note: string | null) {
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

  return { book, profile, entity, composition, planned };
}

export async function prepareImage(bookId: string, target: AssetTarget, note: string | null, expected?: Lineage): Promise<PreparedImage> {
  const { book, profile, entity, composition, planned } = await loadImagePlan(bookId, target, note);
  if (expected && (book?.activeSourceId !== expected.sourceId || book?.canonical?.hash !== expected.canonicalHash)) throw new Error("Image request belongs to a superseded source.");
  // Only approved references condition a new image, pinned by version.
  const lineage = { sourceId: String(book?.activeSourceId), canonicalHash: String(book?.canonical?.hash), visualProfileVersion: profile.version };
  if (book?.ruleVersions?.prompts !== ruleVersions.prompts) throw new Error("Visual plans need rebuilding under the current photographic direction rules.");
  if (composition && (!composition.shotSnapshot.direction || composition.sourceId !== lineage.sourceId || composition.canonicalHash !== lineage.canonicalHash)) throw new Error("Scene direction is missing or stale; rebuild story and visuals.");
  const allAssets = new Map((await db.collection(`books/${bookId}/visualAssets`).get()).docs.map((doc) => [doc.id, doc.data() as VisualAsset]));
  const s3 = s3Config();
  const references: ImageReference[] = [];
  const pinned: AssetVersion["references"] = [];
  for (const candidates of planned.referenceTargets) {
    let attached = false;
    for (const candidate of candidates) {
      const asset = allAssets.get(candidate);
      const version = asset?.versions?.find((item) => item.versionId === asset.approvedVersionId);
      if (!asset || !version || versionIssues(asset, version, lineage, allAssets).length) continue;
      const dependency = await loadImagePlan(bookId, asset, null);
      if (version.planKey !== imagePlanKey(dependency.planned, dependency.profile.version)) continue;
      const bytes = await getObject(s3, version.s3Key);
      if (!bytes) continue;
      references.push({ contentType: version.contentType, bytes });
      pinned.push({ targetId: candidate, versionId: version.versionId });
      attached = true;
      break;
    }
    if (!attached) throw new Error(`Required approved reference unavailable: ${candidates.join(" or ")}. Generate and validate dependencies first.`);
  }
  const base = planImage(target, { profile, entity, composition, note: null });
  const planKey = imagePlanKey(base, profile.version);
  return { target, targetId: assetTargetId(target), note, planned, references, pinned, planKey, visualProfileVersion: profile.version, expectation: target.kind !== "reference" ? { cutOut: planned.alpha === "chroma-green" } : null };
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
    check?: AssetVersion["check"];
    planKey?: string;
    visualProfileVersion?: number;
    versionId?: string;
    expectedBatchId?: string;
    expectedJobId?: string;
  },
  image: { bytes: Buffer; contentType: string; model: string; costUsd: number; costExact: boolean; provider: AssetVersion["provider"] },
): Promise<AssetVersion> {
  const s3 = s3Config();
  const versionId = item.versionId ?? randomUUID();
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
    check: item.check ?? null,
    planKey: item.planKey ?? "",
    visualProfileVersion: item.visualProfileVersion ?? 0,
    createdAt: new Date().toISOString(),
  };
  const currentPlan = await loadImagePlan(bookId, item.target, null);
  if (version.planKey !== imagePlanKey(currentPlan.planned, currentPlan.profile.version)) version.check = { ...version.check!, ok: false, issues: [...(version.check?.issues ?? []), "Visual plan changed during generation."], checkedAt: new Date().toISOString() };
  const assetRef = db.doc(`books/${bookId}/visualAssets/${assetTargetId(item.target)}`);
  await db.runTransaction(async (transaction) => {
    const existing = (await transaction.get(assetRef)).data() as VisualAsset | undefined;
    if (existing?.versions?.some((candidate) => candidate.versionId === versionId)) return;
    if (item.expectedBatchId && existing?.batchId !== item.expectedBatchId) return;
    if (item.expectedJobId && existing?.lastJobId !== item.expectedJobId) return;
    const book = (await transaction.get(db.doc(`books/${bookId}`))).data();
    if (book?.activeSourceId !== lineage.sourceId || book?.canonical?.hash !== lineage.canonicalHash) return;
    let current = true;
    for (const pin of item.references) {
      const dependency = (await transaction.get(db.doc(`books/${bookId}/visualAssets/${pin.targetId}`))).data();
      if (dependency?.approvedVersionId !== pin.versionId) current = false;
    }
    if (!current) version.check = { ...version.check!, ok: false, issues: [...(version.check?.issues ?? []), "A conditioning reference changed during generation."], checkedAt: new Date().toISOString() };
    transaction.set(assetRef, {
      ...lineage, ...item.target, targetId: assetTargetId(item.target), episodeId: item.episodeId,
      versions: FieldValue.arrayUnion(version), status: version.check?.ok ? "approved" : "generated",
      ...(version.check?.ok ? { approvedVersionId: versionId } : {}),
      error: version.check?.ok ? null : version.check?.issues.join(" ").slice(0, 1000) ?? "Unchecked image.",
      batchId: null, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return version;
}
