import { randomUUID } from "node:crypto";
import type { ImageBatch, ImageBatchItem, Lineage, VisualAsset } from "../../lib/story-types.ts";
import { nullableString, records } from "../coerce.mts";
import {
  db,
  geminiBatchSize,
  geminiImageModel,
  geminiInputUsdPerToken,
  geminiOutputUsdPerToken,
} from "../config.mts";
import type { JobDefinition } from "../job-runner.mts";
import { downloadResults, getBatch, readBatchResult, submitBatch, type BatchRequest } from "../providers/gemini-batch.mts";
import { markAsset, prepareImage, saveVersion } from "./assets.mts";
import { readTarget } from "./job.mts";

/** Half of the list price: the Gemini Batch API discount. */
const batchDiscount = 0.5;

/**
 * Submits the selected images as Gemini batches of up to `geminiBatchSize`.
 * The job ends once the batches are submitted; `pollImageBatches` collects the
 * results whenever Gemini finishes them.
 */
export const imageBatchJob: JobDefinition<Record<string, never>> = {
  type: "imageBatch",
  version: "images-batch-v1",
  initialState: () => ({}),
  run: async (context) => {
    const { bookId, jobId } = context;
    const job = (await db.doc(`books/${bookId}/jobs/${jobId}`).get()).data() ?? {};
    const lineage: Lineage = { sourceId: context.sourceId, canonicalHash: context.canonicalHash };
    const seen = new Set<string>();
    const wanted = records(job.items)
      .map((row) => ({ target: readTarget(row.target), note: nullableString(row.note) }))
      .filter(({ target }) => {
        const key = JSON.stringify(target);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (wanted.length === 0) throw new Error("The batch has no images.");

    const submitted: string[] = [];
    let failed = 0;
    for (let offset = 0; offset < wanted.length; offset += geminiBatchSize) {
      if (await context.cancelled()) return null;
      const chunk = wanted.slice(offset, offset + geminiBatchSize);
      const items: ImageBatchItem[] = [];
      const requests: BatchRequest[] = [];
      for (const [index, { target, note }] of chunk.entries()) {
        await context.onActivity({
          label: "Preparing Gemini batch",
          detail: `${offset + index + 1} of ${wanted.length} images`,
          done: offset + index,
          total: wanted.length,
          unit: "images",
        });
        try {
          const prepared = await prepareImage(bookId, target, note);
          items.push({
            key: prepared.targetId,
            targetId: prepared.targetId,
            target,
            note,
            prompt: prepared.planned.prompt,
            role: prepared.planned.role,
            alpha: prepared.planned.alpha,
            episodeId: prepared.planned.episodeId,
            references: prepared.pinned,
          });
          requests.push({
            key: prepared.targetId,
            prompt: prepared.planned.prompt,
            aspectRatio: prepared.planned.aspectRatio,
            references: prepared.references,
          });
        } catch (error) {
          failed += 1;
          await markAsset(bookId, lineage, target, {
            status: "failed",
            error: error instanceof Error ? error.message.slice(0, 1_000) : String(error),
            lastJobId: jobId,
          });
        }
      }
      if (requests.length === 0) continue;
      const batchId = randomUUID();
      let providerName: string;
      try {
        providerName = await submitBatch(geminiImageModel, requests, `${bookId}-${batchId}`);
      } catch (error) {
        // Studio marks images "batched" as soon as they are queued; a rejected
        // submission must release them, or the cards wait forever.
        const reason = error instanceof Error ? error.message : String(error);
        const hint = /FAILED_PRECONDITION/.test(reason)
          ? " Gemini refused batch mode for this API key's project; batch mode needs billing enabled in Google AI Studio."
          : "";
        for (const item of items) {
          await markAsset(bookId, lineage, item.target, { status: "failed", error: `${reason}${hint}`.slice(0, 1_000), batchId: null });
        }
        throw new Error(`${reason}${hint}`);
      }
      const batch: ImageBatch = {
        ...lineage,
        batchId,
        providerName,
        model: geminiImageModel,
        status: "submitted",
        providerState: "JOB_STATE_PENDING",
        items,
        counts: { total: items.length, saved: 0, failed: 0 },
        error: null,
        jobId,
        submittedAt: new Date().toISOString(),
        completedAt: null,
      };
      await db.doc(`books/${bookId}/imageBatches/${batchId}`).set({ ...batch, pollLeaseUntil: 0 });
      for (const item of items) {
        await markAsset(bookId, lineage, item.target, { status: "batched", batchId, error: null, lastJobId: jobId, episodeId: item.episodeId });
      }
      submitted.push(`${providerName} (${items.length})`);
      context.log(`submitted ${providerName} with ${items.length} image(s)`);
    }
    if (submitted.length === 0) throw new Error(`None of the ${wanted.length} images could be prepared.`);
    return `submitted ${submitted.join(", ")}${failed > 0 ? `; ${failed} could not be prepared` : ""}`;
  },
};

/** Takes the poll lease so two workers never collect the same batch. */
async function leaseBatch(bookId: string, batchId: string): Promise<boolean> {
  const ref = db.doc(`books/${bookId}/imageBatches/${batchId}`);
  return db.runTransaction(async (transaction) => {
    const data = (await transaction.get(ref)).data();
    if (!data || !["submitted", "running"].includes(data.status) || Number(data.pollLeaseUntil ?? 0) > Date.now()) return false;
    transaction.update(ref, { pollLeaseUntil: Date.now() + 10 * 60_000 });
    return true;
  });
}

async function collectBatch(bookId: string, batch: ImageBatch, log: (message: string) => void): Promise<void> {
  const ref = db.doc(`books/${bookId}/imageBatches/${batch.batchId}`);
  const status = await getBatch(batch.providerName);
  if (status.phase === "running") {
    await ref.update({ status: "running", providerState: status.state, pollLeaseUntil: 0 });
    return;
  }
  const lineage: Lineage = { sourceId: batch.sourceId, canonicalHash: batch.canonicalHash };
  // A batch result only lands on an asset still waiting for this batch; a
  // newer request for the same image keeps its own status.
  const stillWaiting = async (targetId: string) => {
    const asset = (await db.doc(`books/${bookId}/visualAssets/${targetId}`).get()).data() as VisualAsset | undefined;
    return asset?.batchId === batch.batchId;
  };
  if (status.phase === "failed") {
    for (const item of batch.items) {
      if (await stillWaiting(item.targetId)) {
        await markAsset(bookId, lineage, item.target, { status: "failed", error: status.error, batchId: null });
      }
    }
    await ref.update({ status: "failed", providerState: status.state, error: status.error, completedAt: new Date().toISOString(), pollLeaseUntil: 0 });
    log(`batch ${batch.providerName} ended: ${status.state}`);
    return;
  }

  const lines = status.responsesFile ? await downloadResults(status.responsesFile) : status.inlined;
  const results = new Map(lines.map(readBatchResult).map((result) => [result.key, result]));
  let saved = 0;
  let failed = 0;
  let costUsd = 0;
  for (const item of batch.items) {
    const result = results.get(item.key);
    if (result?.ok) {
      const cost = (result.promptTokens * geminiInputUsdPerToken + result.outputTokens * geminiOutputUsdPerToken) * batchDiscount;
      costUsd += cost;
      await saveVersion(bookId, lineage, item, {
        bytes: result.bytes,
        contentType: result.contentType,
        model: batch.model,
        costUsd: cost,
        costExact: false,
        provider: "gemini-batch",
      });
      saved += 1;
    } else {
      failed += 1;
      if (await stillWaiting(item.targetId)) {
        await markAsset(bookId, lineage, item.target, {
          status: "failed",
          error: result ? result.error : "The batch finished without a result for this image.",
          batchId: null,
        });
      }
    }
  }
  await ref.update({
    status: "completed",
    providerState: status.state,
    counts: { total: batch.items.length, saved, failed },
    costUsd,
    completedAt: new Date().toISOString(),
    pollLeaseUntil: 0,
  });
  log(`batch ${batch.providerName} collected: ${saved} saved, ${failed} failed, ~$${costUsd.toFixed(4)}`);
}

/** Checks every open batch once; called by the worker between jobs. */
export async function pollImageBatches(log: (message: string) => void): Promise<void> {
  const books = await db.collection("books").select().get();
  for (const book of books.docs) {
    const open = await book.ref.collection("imageBatches").where("status", "in", ["submitted", "running"]).get();
    for (const doc of open.docs) {
      if (!(await leaseBatch(book.id, doc.id))) continue;
      try {
        await collectBatch(book.id, doc.data() as ImageBatch, log);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log(`batch ${doc.id} check failed, will retry: ${message}`);
        await doc.ref.update({ error: message.slice(0, 500), pollLeaseUntil: 0 }).catch(() => undefined);
      }
    }
  }
}
