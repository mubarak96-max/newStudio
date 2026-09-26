import { versionIssues } from "../../lib/asset-validation.ts";
import { dependencyWave, type ImageWork } from "./dependencies.mts";
import { imagePlanKey } from "./request.mts";
import type { VisualAsset, AssetTarget, CompositionPlan } from "../../lib/story-types.ts";
import { asString, nullableString } from "../coerce.mts";
import { db, imageModel } from "../config.mts";
import type { JobContext, JobDefinition } from "../job-runner.mts";
import { generateImage } from "../providers/images.mts";
import { markAsset, prepareImage, saveVersion, loadImagePlan } from "./assets.mts";
import { type ImageExpectation } from "./checks.mts";
import { reviewImage } from "./review.mts";
import { enqueueJob } from "../job-queue.mts";
import { imageStageReport } from "./status.mts";

export function readTarget(value: unknown): AssetTarget {
  const target = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const kind = asString(target.kind);
  if (kind !== "reference" && kind !== "variant" && kind !== "layer") throw new Error(`Unknown image target kind "${kind}".`);
  return {
    kind,
    entityId: nullableString(target.entityId),
    stateId: nullableString(target.stateId),
    compositionId: nullableString(target.compositionId),
    layerId: nullableString(target.layerId),
  };
}

/** Which mechanical checks this image is subject to. Everything else is reviewed by hand. */
export async function expectationFor(bookId: string, target: AssetTarget): Promise<ImageExpectation | null> {
  if (target.kind === "reference") return null;
  if (target.kind === "variant") return { cutOut: false };
  if (!target.compositionId) return null;
  const composition = (await db.doc(`books/${bookId}/compositions/${target.compositionId}`).get()).data() as CompositionPlan | undefined;
  const layer = composition?.layers.find((candidate) => candidate.layerId === target.layerId);
  if (!composition || !layer) return null;
  return { cutOut: layer.role !== "background" };
}

/** One image, returned at once through OpenRouter. */
export const imageJob: JobDefinition<Record<string, never>> = {
  type: "image",
  version: "images-v4",
  initialState: () => ({}),
  run: async (context) => {
    const { bookId, jobId } = context;
    const job = (await db.doc(`books/${bookId}/jobs/${jobId}`).get()).data() ?? {};
    const target = readTarget(job.target);
    const note = nullableString(job.note);
    const lineage = { sourceId: context.sourceId, canonicalHash: context.canonicalHash };

    let pending: ImageWork[] = [{ target, note }];
    const summaries: string[] = [];
    while (pending.length) {
      if (await context.cancelled()) return null;
      const assets = new Map((await db.collection(`books/${bookId}/visualAssets`).get()).docs.map((doc) => [doc.id, doc.data() as VisualAsset]));
      const wave = await dependencyWave(pending, async (target) => (await loadImagePlan(bookId, target, null)).planned, async (id) => {
        const asset = assets.get(id);
        const version = asset?.versions?.find((item) => item.versionId === asset.approvedVersionId);
        if (!asset || !version) return false;
        const { planned, profile } = await loadImagePlan(bookId, asset, null);
        return versionIssues(asset, version, lineage, assets, imagePlanKey(planned, profile.version)).length === 0;
      });
      for (const item of wave.ready) summaries.push(await generateCheckedImage(context, item.target, item.note));
      pending = wave.pending;
    }
    if (target.kind === "layer") await enqueueJob(bookId, "compose", context.sourceId, context.canonicalHash);
    return summaries.join("; ");
  },
  // The stage is done when every composition has its scene approved, not when
  // reference sheets exist.
  bookStatus: async (context) => {
    const report = await imageStageReport(context.bookId, { sourceId: context.sourceId, canonicalHash: context.canonicalHash });
    if (report.compositions === 0) return "done";
    context.log(`images: ${report.compositionsReady}/${report.compositions} compositions ready, ${report.failedChecks} approved images failed checks`);
    return report.compositionsReady === report.compositions ? "done" : "failed";
  },
};

async function generateCheckedImage(context: JobContext, target: AssetTarget, note: string | null): Promise<string> {
  const { bookId, jobId } = context;
  const lineage = { sourceId: context.sourceId, canonicalHash: context.canonicalHash };
    try {
      const expectation = await expectationFor(bookId, target);
      let correction = note;
      let attempt = 0;
      // One automatic retry: a failed check comes back as a correction note, so
      // the model is told what was wrong rather than asked again blindly.
      for (;;) {
        attempt += 1;
        const prepared = await prepareImage(bookId, target, correction, lineage);
        await context.onActivity({
          label: `Generating ${prepared.targetId}`,
          detail: attempt > 1 ? `retry after failed checks: ${imageModel}` : imageModel,
          done: 0,
          total: 1,
          unit: "images",
        });
        await markAsset(bookId, lineage, target, { status: "generating", error: null, lastJobId: jobId, episodeId: prepared.planned.episodeId });
        if (prepared.planned.referenceTargets.length > 0 && prepared.references.length === 0) {
          context.log(`${prepared.targetId}: no approved reference yet; generating from the text description alone.`);
        }
        const image = await generateImage({
          model: imageModel,
          prompt: prepared.planned.prompt,
          aspectRatio: prepared.planned.aspectRatio,
          references: prepared.references,
          label: prepared.targetId,
        });
        context.addCost(image.costUsd);

        const check = await reviewImage(image, prepared.planned.prompt, expectation, prepared.references, context.addCost);
        const version = await saveVersion(
          bookId,
          lineage,
          { ...prepared.planned, target, note: correction, references: prepared.pinned, check, planKey: prepared.planKey, visualProfileVersion: prepared.visualProfileVersion, expectedJobId: jobId },
          { ...image, costExact: true, provider: "openrouter" },
        );
        const issues = version.check?.issues ?? ["Image was not validated."];
        if (issues.some((issue) => issue.startsWith("Visual review unavailable"))) throw new Error(issues.join(" "));
        if (issues.length === 0 || attempt > 1) {
          if (issues.length > 0) throw new Error(`Image validation failed after repair: ${issues.join(" ")}`);
          return (
            `${prepared.targetId} version ${version.versionId} (${version.width ?? "?"}x${version.height ?? "?"}, ` +
            `${prepared.pinned.length} reference(s))${issues.length > 0 ? `, ${issues.length} issue(s) for review` : ""}`
          );
        }
        context.log(`${prepared.targetId}: ${issues.join(" ")} Regenerating once with the failure as a correction.`);
        correction = [note, `The previous attempt was rejected: ${issues.join(" ")} Fix exactly these problems.`].filter(Boolean).join(" ");
      }
    } catch (error) {
      await markAsset(bookId, lineage, target, {
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 1_000) : String(error),
        lastJobId: jobId,
      });
      throw error;
    }
}
