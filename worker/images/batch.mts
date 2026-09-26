import { versionIssues } from "../../lib/asset-validation.ts";
import { FieldValue } from "firebase-admin/firestore";
import { getObject, s3Config } from "../storage/s3.mts";
import { reviewImage } from "./review.mts";
import { dependencyWave, type ImageWork } from "./dependencies.mts";
import { randomUUID } from "node:crypto";
import { assetTargetId, type ImageBatch, type ImageBatchItem, type Lineage, type VisualAsset } from "../../lib/story-types.ts";
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
import { markAsset, prepareImage, saveVersion, loadImagePlan } from "./assets.mts";
import { imagePlanKey } from "./request.mts";
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
  version: "images-batch-v2",
  bookStatus: async () => "pending",
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

    const assets = new Map((await db.collection(`books/${bookId}/visualAssets`).get()).docs.map((doc) => [doc.id, doc.data() as VisualAsset]));
    const wave = job.readyItems ? { ready: job.readyItems as ImageWork[], pending: job.pendingItems as ImageWork[] } : await dependencyWave(wanted, async (target) => (await loadImagePlan(bookId, target, null)).planned, async (id) => {
      const asset = assets.get(id);
      const version = asset?.versions?.find((item) => item.versionId === asset.approvedVersionId);
      if (!asset || !version) return false;
      const { planned, profile } = await loadImagePlan(bookId, asset, null);
      return versionIssues(asset, version, lineage, assets, imagePlanKey(planned, profile.version)).length === 0;
    });
    const submitted: string[] = [];
    const batchIds: string[] = job.submittedBatchIds ?? [];
    if (job.submissionsComplete) return "Image dependency wave already submitted.";
    const existingBatches = await Promise.all(batchIds.map((id) => db.doc(`books/${bookId}/imageBatches/${id}`).get()));
    const alreadySubmitted = new Set(existingBatches.flatMap((snapshot) => (snapshot.data()?.items ?? []).map((item: ImageBatchItem) => item.targetId)));
    const remaining = wave.ready.filter((item) => !alreadySubmitted.has(assetTargetId(item.target)));
    await db.doc(`books/${bookId}/jobs/${jobId}`).update({ readyItems: wave.ready, pendingItems: wave.pending, submittedBatchIds: batchIds, submissionsComplete: false });
    let failed = Number(job.preparationFailed ?? 0);
    for (let offset = 0; offset < remaining.length; offset += geminiBatchSize) {
      if (await context.cancelled()) return null;
      const chunk = remaining.slice(offset, offset + geminiBatchSize);
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
          const prepared = await prepareImage(bookId, target, note, lineage);
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
            planKey: prepared.planKey,
            visualProfileVersion: prepared.visualProfileVersion,
            expectation: prepared.expectation,
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
      batchIds.push(batchId);
      await db.doc(`books/${bookId}/jobs/${jobId}`).update({ submittedBatchIds: batchIds });
      context.log(`submitted ${providerName} with ${items.length} image(s)`);
    }
    await db.doc(`books/${bookId}/jobs/${jobId}`).update({ submissionsComplete: true, preparationFailed: failed });
    if (batchIds.length === 0) throw new Error(`None of the ${wanted.length} images could be prepared.`);
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
  const retries: ImageWork[] = [];
  let failed = 0;
  let costUsd = 0;
  for (const item of batch.items) {
    await ref.update({ pollLeaseUntil: Date.now() + 10 * 60_000 });
    const result = results.get(item.key);
    if (!await stillWaiting(item.targetId)) {
      const asset = (await db.doc(`books/${bookId}/visualAssets/${item.targetId}`).get()).data() as VisualAsset | undefined;
      const stored = asset?.versions?.find((version) => version.versionId === `${batch.batchId}-${item.key}`);
      if (stored) {
        saved += 1;
        costUsd += stored.costUsd;
        if (stored.check && !stored.check.ok) retries.push({ target: item.target, note: `Correct the rejected image: ${stored.check.issues.join(" ")}` });
      } else failed += 1;
      continue;
    }
    if (result?.ok) {
      const cost = (result.promptTokens * geminiInputUsdPerToken + result.outputTokens * geminiOutputUsdPerToken) * batchDiscount;
      costUsd += cost;
      const references = [];
      for (const pin of item.references) {
        const asset = (await db.doc(`books/${bookId}/visualAssets/${pin.targetId}`).get()).data() as VisualAsset | undefined;
        const version = asset?.versions?.find((version) => version.versionId === pin.versionId);
        if (!version) throw new Error(`Pinned reference missing: ${pin.targetId}`);
        const bytes = await getObject(s3Config(), version.s3Key);
        if (!bytes) throw new Error(`Pinned reference file missing: ${pin.targetId}`);
        references.push({ bytes, contentType: version.contentType });
      }
      const check = await reviewImage(result, item.prompt, item.expectation ?? (item.target.kind === "layer" ? { cutOut: item.alpha === "chroma-green" } : null), references, (cost) => { costUsd += cost; });
      if (!check.ok && check.issues.some((issue) => issue.startsWith("Visual review unavailable"))) throw new Error(check.issues.join(" "));
      if (!check.ok) retries.push({ target: item.target, note: `Correct the rejected image: ${check.issues.join(" ")}` });
      await saveVersion(bookId, lineage, { ...item, check, expectedBatchId: batch.batchId, versionId: `${batch.batchId}-${item.key}` }, {
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
    retries,
    completedAt: new Date().toISOString(),
    pollLeaseUntil: 0,
  });
  await advanceBatchJob(bookId, batch.jobId);
  log(`batch ${batch.providerName} collected: ${saved} saved, ${failed} failed, ~$${costUsd.toFixed(4)}`);
}

async function advanceBatchJob(bookId: string, jobId: string): Promise<void> {
  const jobRef = db.doc(`books/${bookId}/jobs/${jobId}`);
  await db.runTransaction(async (transaction) => {
    const job = (await transaction.get(jobRef)).data();
    if (!job?.submissionsComplete || job.continuationQueued || job.status === "cancelled") return;
    const batches = await Promise.all((job.submittedBatchIds as string[]).map((id) => transaction.get(db.doc(`books/${bookId}/imageBatches/${id}`))));
    if (!batches.length || batches.some((batch) => !["completed", "failed"].includes(batch.data()?.status))) return;
    const retries = batches.flatMap((batch) => (batch.data()?.retries ?? []) as ImageWork[]);
    const attempts = { ...(job.imageAttempts ?? {}) } as Record<string, number>;
    const retryable = retries.filter((item) => {
      const id = JSON.stringify(item.target);
      attempts[id] = (attempts[id] ?? 0) + 1;
      return attempts[id] < 2;
    });
    const blocked = retries.length !== retryable.length || job.preparationFailed > 0 || batches.some((batch) => batch.data()?.status === "failed" || batch.data()?.counts?.failed > 0);
    const pendingItems = (job.pendingItems ?? []) as ImageWork[];
    const pendingDocs = await Promise.all(pendingItems.map((item) => transaction.get(db.doc(`books/${bookId}/visualAssets/${assetTargetId(item.target)}`))));
    const pending = pendingItems.filter((_, index) => { const owner = pendingDocs[index]!.data()?.lastJobId; return !owner || owner === (job.rootJobId ?? jobId); });
    const items = [...pending, ...retryable];
    const book = (await transaction.get(db.doc(`books/${bookId}`))).data();
    if (book?.activeSourceId !== job.sourceId || book?.canonical?.hash !== job.canonicalHash) return;
    if (!items.length && !blocked) {
      transaction.set(db.doc(`books/${bookId}/jobs/${jobId}_compose`), { type: "compose", stage: "compose_25d", status: "queued_v3", sourceId: job.sourceId, canonicalHash: job.canonicalHash, attempts: 0, costUsd: 0, createdAt: FieldValue.serverTimestamp(), progress: { done: 0, total: 0 } });
    }
    if (items.length && !blocked) {
      transaction.set(db.doc(`books/${bookId}/jobs/${jobId}_next`), {
        type: "imageBatch", stage: "images", status: "queued_v3", items, imageAttempts: attempts, rootJobId: job.rootJobId ?? jobId,
        sourceId: job.sourceId, canonicalHash: job.canonicalHash, attempts: 0, costUsd: 0,
        createdAt: FieldValue.serverTimestamp(), progress: { done: 0, total: items.length },
      });
    }
    if (blocked) {
      for (const item of pending) transaction.set(db.doc(`books/${bookId}/visualAssets/${assetTargetId(item.target)}`), { status: "failed", error: "A required image failed validation; dependent generation was withheld.", batchId: null }, { merge: true });
    }
    transaction.update(jobRef, { continuationQueued: true, ...(blocked ? { status: "failed", error: "Image validation exhausted retries; dependent images were withheld." } : {}) });
  });
}

/** Checks every open batch once; called by the worker between jobs. */
export async function pollImageBatches(log: (message: string) => void): Promise<void> {
  const books = await db.collection("books").select().get();
  for (const book of books.docs) {
    const completedJobs = await book.ref.collection("jobs").where("type", "==", "imageBatch").get();
    for (const job of completedJobs.docs) if (job.data().submissionsComplete && !job.data().continuationQueued) await advanceBatchJob(book.id, job.id);
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
