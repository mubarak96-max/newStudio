import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  batchPollIntervalMs,
  db,
  openRouterMaxTokens,
  openRouterModels,
  pollIntervalMs,
  staleLeaseMs,
  windowMaxCharacters,
  windowMaxParagraphs,
  windowMaxTokens,
  windowOverlapParagraphs,
  workerVersion,
} from "./config.mts";
import { isClaimable } from "./job-lease.mts";
import { beatsJob } from "./beats/job.mts";
import { cleanJob } from "./clean/job.mts";
import { composeJob } from "./compose/job.mts";
import { publishJob } from "./publish/job.mts";
import { imageBatchJob, pollImageBatches } from "./images/batch.mts";
import { imageJob } from "./images/job.mts";
import { processJob } from "./job-runner.mts";
import { storyJob } from "./story/job.mts";
import { processUnderstandingJob } from "./understand-job.mts";
import { visualsJob } from "./visuals/job.mts";

type JobRef = { bookId: string; jobId: string; type: string };

let stopping = false;
let collectionGroupJobsUnavailable = false;

function toJobRef(snapshot: QueryDocumentSnapshot): JobRef | null {
  const bookId = snapshot.ref.parent.parent?.id;
  // Jobs written before job types existed are understanding jobs.
  return bookId ? { bookId, jobId: snapshot.id, type: String(snapshot.data().type ?? "understand") } : null;
}

/** gRPC code 9 is FAILED_PRECONDITION, which is how a missing index surfaces. */
function isFailedPrecondition(error: unknown): boolean {
  if ((error as { code?: unknown } | null)?.code === 9) return true;
  return (
    error instanceof Error &&
    /FAILED_PRECONDITION|requires an index|index.*building/i.test(error.message)
  );
}

/**
 * One collection-group query per poll instead of reading every book document
 * and every job subcollection. Needs the collection-group index on
 * `jobs.status` from `firestore.indexes.json`; until it is deployed this falls
 * back to a per-book status query.
 */
async function findClaimableJob(): Promise<JobRef | null> {
  const statuses = ["queued_v3", "running_v3"];
  if (!collectionGroupJobsUnavailable) {
    try {
      const snapshot = await db
        .collectionGroup("jobs")
        .where("status", "in", statuses)
        .limit(20)
        .get();
      for (const item of snapshot.docs) {
        if (isClaimable(item.data(), staleLeaseMs)) return toJobRef(item);
      }
      return null;
    } catch (error) {
      if (!isFailedPrecondition(error)) throw error;
      collectionGroupJobsUnavailable = true;
      console.warn(
        `[${workerVersion}] collection-group job query unavailable; falling back to a per-book scan. ` +
          `Deploy firestore.indexes.json to remove the fallback. Cause: ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }
  const books = await db.collection("books").select().get();
  for (const book of books.docs) {
    const jobs = await book.ref
      .collection("jobs")
      .where("status", "in", statuses)
      .get();
    const claimable = jobs.docs.find((item) => isClaimable(item.data(), staleLeaseMs));
    if (claimable) return toJobRef(claimable);
  }
  return null;
}

async function main(): Promise<void> {
  console.log(
    `[${workerVersion}] models: ${openRouterModels.join(" -> ")} | max_tokens: ${openRouterMaxTokens} | ` +
      `windows: <=${windowMaxParagraphs} paras / ${windowMaxCharacters} chars (~${windowMaxTokens} tokens), ` +
      `overlap ${windowOverlapParagraphs}`,
  );
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });

  let lastBatchPoll = 0;
  while (!stopping) {
    // Gemini batches finish on their own schedule; check them between jobs.
    if (Date.now() - lastBatchPoll >= batchPollIntervalMs) {
      lastBatchPoll = Date.now();
      await pollImageBatches((message) => console.log(`[images-batch] ${message}`)).catch((error: unknown) =>
        console.warn(`[images-batch] poll failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
    const job = await findClaimableJob();
    if (job?.type === "clean") {
      await processJob(cleanJob, job.bookId, job.jobId, staleLeaseMs);
    } else if (job?.type === "story") {
      await processJob(storyJob, job.bookId, job.jobId, staleLeaseMs);
    } else if (job?.type === "beats") {
      await processJob(beatsJob, job.bookId, job.jobId, staleLeaseMs);
    } else if (job?.type === "visuals") {
      await processJob(visualsJob, job.bookId, job.jobId, staleLeaseMs);
    } else if (job?.type === "image") {
      await processJob(imageJob, job.bookId, job.jobId, staleLeaseMs);
    } else if (job?.type === "imageBatch") {
      await processJob(imageBatchJob, job.bookId, job.jobId, staleLeaseMs);
    } else if (job?.type === "compose") {
      await processJob(composeJob, job.bookId, job.jobId, staleLeaseMs);
    } else if (job?.type === "publish") {
      await processJob(publishJob, job.bookId, job.jobId, staleLeaseMs);
    } else if (job?.type === "understand") {
      await processUnderstandingJob(job.bookId, job.jobId, staleLeaseMs);
    } else if (job) {
      // Running an unknown job as something else is how a stale worker once
      // re-ran whole-book understanding for an image request; refuse instead.
      console.warn(`[${workerVersion}] unknown job type "${job.type}" for books/${job.bookId}/jobs/${job.jobId}; marking it failed.`);
      await db.doc(`books/${job.bookId}/jobs/${job.jobId}`).update({
        status: "failed",
        error: `This worker does not know job type "${job.type}". Update and restart the worker, then retry.`,
      });
    } else {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}

await main();
