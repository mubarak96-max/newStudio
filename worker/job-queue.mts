import { FieldValue } from "firebase-admin/firestore";
import { db } from "./config.mts";

/** Pipeline order: each finished job queues the next one. Understanding queues story. Images are queued only by Studio. */
export const jobStages = {
  /** Repairs scan damage and page furniture, then writes the cleaned canonical source. */
  clean: "cleaning",
  understand: "book_model",
  story: "story_plan",
  beats: "beats",
  visuals: "visual_plan",
  /** Owner-triggered, one image per job; never queued by another job. */
  image: "images",
  /** Owner-triggered Gemini batch submission; results are collected by the batch poller. */
  imageBatch: "images",
  /** Owner-triggered per Episode: keys cut-outs, measures layers and fits Beat cameras. */
  compose: "compose_25d",
  /** Owner-triggered: writes immutable Episode packages for reading apps. */
  publish: "publication",
} as const;

export type ChainedJobType = keyof typeof jobStages;

/**
 * Any queued or running job of the same type for the book is superseded: only
 * the newest run matters. `pipelineJobs` keeps the latest job per stage so each
 * Studio page can follow its own stage after the pipeline moves on.
 */
export async function enqueueJob(
  bookId: string,
  type: ChainedJobType,
  sourceId: string,
  canonicalHash: string,
): Promise<string> {
  const jobs = db.collection(`books/${bookId}/jobs`);
  const open = await jobs.where("status", "in", ["queued_v3", "running_v3"]).get();
  for (const job of open.docs) {
    if (job.data().type === type) {
      await job.ref.update({ status: "cancelled", finishedAt: FieldValue.serverTimestamp() });
    }
  }
  const stage = jobStages[type];
  const ref = await jobs.add({
    type,
    stage,
    status: "queued_v3",
    sourceId,
    canonicalHash,
    progress: { done: 0, total: 0 },
    activity: null,
    checkpoint: null,
    attempts: 0,
    error: null,
    costUsd: 0,
    startedAt: null,
    finishedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.doc(`books/${bookId}`).update({
    pipeline: { stage, stageStatus: "pending", lastJobId: ref.id, updatedAt: new Date().toISOString() },
    [`pipelineJobs.${stage}`]: ref.id,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}
