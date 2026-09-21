import type { AssetTarget } from "../../lib/story-types.ts";
import { asString, nullableString } from "../coerce.mts";
import { db, imageModel } from "../config.mts";
import type { JobDefinition } from "../job-runner.mts";
import { generateImage } from "../providers/images.mts";
import { markAsset, prepareImage, saveVersion } from "./assets.mts";

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

/** One image, returned at once through OpenRouter. */
export const imageJob: JobDefinition<Record<string, never>> = {
  type: "image",
  version: "images-v2",
  initialState: () => ({}),
  run: async (context) => {
    const { bookId, jobId } = context;
    const job = (await db.doc(`books/${bookId}/jobs/${jobId}`).get()).data() ?? {};
    const target = readTarget(job.target);
    const note = nullableString(job.note);
    const lineage = { sourceId: context.sourceId, canonicalHash: context.canonicalHash };

    try {
      const prepared = await prepareImage(bookId, target, note);
      await context.onActivity({ label: `Generating ${prepared.targetId}`, detail: imageModel, done: 0, total: 1, unit: "images" });
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
      const version = await saveVersion(
        bookId,
        lineage,
        { ...prepared.planned, target, note, references: prepared.pinned },
        { ...image, costExact: true, provider: "openrouter" },
      );
      return `${prepared.targetId} version ${version.versionId} (${version.width ?? "?"}x${version.height ?? "?"}, ${prepared.pinned.length} reference(s))`;
    } catch (error) {
      await markAsset(bookId, lineage, target, {
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 1_000) : String(error),
        lastJobId: jobId,
      });
      throw error;
    }
  },
};
