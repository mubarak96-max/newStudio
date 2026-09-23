import type { AssetTarget, CompositionPlan } from "../../lib/story-types.ts";
import { asString, nullableString } from "../coerce.mts";
import { db, imageModel } from "../config.mts";
import type { JobDefinition } from "../job-runner.mts";
import { generateImage } from "../providers/images.mts";
import { markAsset, prepareImage, saveVersion } from "./assets.mts";
import { checkImage, type ImageExpectation } from "./checks.mts";
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
  if (target.kind !== "layer" || !target.compositionId) return null;
  const composition = (await db.doc(`books/${bookId}/compositions/${target.compositionId}`).get()).data() as CompositionPlan | undefined;
  const layer = composition?.layers.find((candidate) => candidate.layerId === target.layerId);
  if (!composition || !layer) return null;
  return { cutOut: layer.role !== "background" };
}

/** One image, returned at once through OpenRouter. */
export const imageJob: JobDefinition<Record<string, never>> = {
  type: "image",
  version: "images-v3",
  initialState: () => ({}),
  run: async (context) => {
    const { bookId, jobId } = context;
    const job = (await db.doc(`books/${bookId}/jobs/${jobId}`).get()).data() ?? {};
    const target = readTarget(job.target);
    const note = nullableString(job.note);
    const lineage = { sourceId: context.sourceId, canonicalHash: context.canonicalHash };

    try {
      const expectation = await expectationFor(bookId, target);
      let correction = note;
      let attempt = 0;
      // One automatic retry: a failed check comes back as a correction note, so
      // the model is told what was wrong rather than asked again blindly.
      for (;;) {
        attempt += 1;
        const prepared = await prepareImage(bookId, target, correction);
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

        const check = expectation ? await checkImage(image.bytes, expectation) : null;
        const version = await saveVersion(
          bookId,
          lineage,
          { ...prepared.planned, target, note: correction, references: prepared.pinned, check },
          { ...image, costExact: true, provider: "openrouter" },
        );
        const issues = check?.issues ?? [];
        if (issues.length === 0 || attempt > 1) {
          if (issues.length > 0) {
            await markAsset(bookId, lineage, target, { status: "generated", error: `Checks failed: ${issues.join(" ")}`.slice(0, 1_000), lastJobId: jobId });
          }
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
