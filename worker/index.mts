import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
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
import { isClaimable, processUnderstandingJob } from "./understand-job.mts";

type JobRef = { bookId: string; jobId: string };

let stopping = false;
let collectionGroupJobsUnavailable = false;

function toJobRef(snapshot: QueryDocumentSnapshot): JobRef | null {
  const bookId = snapshot.ref.parent.parent?.id;
  return bookId ? { bookId, jobId: snapshot.id } : null;
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
    if (claimable) return { bookId: book.id, jobId: claimable.id };
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

  while (!stopping) {
    const job = await findClaimableJob();
    if (job) {
      await processUnderstandingJob(job.bookId, job.jobId, staleLeaseMs);
    } else {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
}

await main();
