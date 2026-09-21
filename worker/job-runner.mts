import { FieldValue } from "firebase-admin/firestore";
import { loadLatestValidCheckpoint, saveJsonCheckpoint } from "./checkpoint-store.mts";
import { asNumber, asString } from "./coerce.mts";
import { bucket, db, openRouterModels, workerId } from "./config.mts";
import { claimJob } from "./job-lease.mts";
import { enqueueJob, jobStages, type ChainedJobType } from "./job-queue.mts";
import { callJsonModel } from "./openrouter.mts";

export type JobActivity = {
  label: string;
  detail: string;
  done: number;
  total: number;
  unit: string;
};

export type JobContext = {
  bookId: string;
  jobId: string;
  sourceId: string;
  canonicalHash: string;
  log: (message: string) => void;
  /**
   * One model call. Returns null instead of throwing when every model fails,
   * so each step can fall back to a deterministic result and keep going.
   */
  callModel: (
    label: string,
    system: string,
    payload: unknown,
    options?: { maxTokens?: number },
  ) => Promise<Record<string, unknown> | null>;
  onActivity: (activity: JobActivity) => Promise<void>;
  cancelled: () => Promise<boolean>;
};

export type JobDefinition<TState> = {
  type: ChainedJobType;
  version: string;
  initialState: () => TState;
  /** Returns a one-line result for the log, or null when the job was cancelled. */
  run: (context: JobContext, state: TState, checkpoint: (label: string) => Promise<void>) => Promise<string | null>;
  next?: ChainedJobType;
};

/** Runs `run` over items with at most `size` in flight, keeping results in input order. */
export async function pool<T, R>(items: T[], size: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]!, index);
    }
  });
  await Promise.all(lanes);
  return results;
}

async function setPipeline(bookId: string, stage: string, stageStatus: string, jobId: string): Promise<void> {
  await db.doc(`books/${bookId}`).update({
    pipeline: { stage, stageStatus, lastJobId: jobId, updatedAt: new Date().toISOString() },
    [`pipelineJobs.${stage}`]: jobId,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function processJob<TState>(
  definition: JobDefinition<TState>,
  bookId: string,
  jobId: string,
  staleLeaseMs: number,
): Promise<void> {
  if (!(await claimJob(db.doc(`books/${bookId}/jobs/${jobId}`), staleLeaseMs))) return;
  console.log(`[${definition.version}] claimed books/${bookId}/jobs/${jobId}`);
  await runLeasedJob(definition, bookId, jobId);
}

/**
 * Runs a job this process already holds the lease for: heartbeat, checkpoint
 * resume, cost accounting, failure reporting and queuing the next stage.
 */
export async function runLeasedJob<TState>(
  definition: JobDefinition<TState>,
  bookId: string,
  jobId: string,
  options: { chain?: boolean } = {},
): Promise<void> {
  const stage = jobStages[definition.type];
  const jobRef = db.doc(`books/${bookId}/jobs/${jobId}`);
  const log = (message: string) => console.log(`[${definition.version}] ${message}`);
  // A single model call on a long book can outlast the lease, so the lease is
  // renewed on a timer rather than only between units of work.
  const heartbeat = setInterval(() => {
    jobRef.update({ heartbeatAt: FieldValue.serverTimestamp(), leaseOwner: workerId }).catch(() => undefined);
  }, 30_000);
  let costUsd = 0;

  try {
    const job = (await jobRef.get()).data();
    if (!job) throw new Error("Claimed job disappeared.");
    costUsd = asNumber(job.costUsd);
    const sourceId = asString(job.sourceId);
    const canonicalHash = asString(job.canonicalHash);
    await setPipeline(bookId, stage, "running", jobId);

    const prefix = `books/${bookId}/sources/${sourceId}/${stage}/${jobId}/`;
    const saved = await loadLatestValidCheckpoint<TState>(bucket, prefix);
    const state = saved?.value ?? definition.initialState();
    let counter = asNumber(job.checkpointCounter);
    let activity: JobActivity | null = null;
    const warnings: string[] = [];

    const context: JobContext = {
      bookId,
      jobId,
      sourceId,
      canonicalHash,
      log,
      onActivity: async (next) => {
        activity = next;
        await jobRef.update({
          activity,
          progress: { done: next.done, total: next.total },
          costUsd,
          heartbeatAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      },
      cancelled: async () => (await jobRef.get()).data()?.status === "cancelled",
      callModel: async (label, system, payload, options = {}) => {
        try {
          const result = await callJsonModel({
            system,
            user: JSON.stringify(payload),
            models: openRouterModels,
            label,
            maxTokens: options.maxTokens,
            nextModelOnTruncation: true,
          });
          costUsd += result.cost;
          const parsed = result.parsed;
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log(`${label} failed, using the deterministic fallback: ${message}`);
          warnings.push(`${label}: ${message.slice(0, 200)}`);
          return null;
        }
      },
    };
    const checkpoint = async (label: string) => {
      counter += 1;
      const storagePath = `${prefix}${String(counter).padStart(6, "0")}-${label.replace(/[^a-zA-Z0-9_-]+/g, "_")}.json`;
      await saveJsonCheckpoint(bucket, storagePath, state);
      await jobRef.update({
        phase: label,
        checkpoint: { storagePath, unit: counter },
        checkpointCounter: counter,
        costUsd,
        activity,
        heartbeatAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    };

    const result = await definition.run(context, state, checkpoint);
    if (result === null) return;
    log(`completed: ${result}, $${costUsd.toFixed(4)}.`);
    await jobRef.update({
      status: "completed",
      phase: "done",
      activity: null,
      error: null,
      warning: warnings.length > 0 ? `${warnings.length} model call(s) fell back: ${warnings.slice(0, 5).join(" | ")}` : null,
      result,
      costUsd,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await setPipeline(bookId, stage, "done", jobId);
    if (definition.next && options.chain !== false) {
      const nextJobId = await enqueueJob(bookId, definition.next, sourceId, canonicalHash);
      log(`queued ${definition.next} job ${nextJobId}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker failure.";
    log(`job ${jobId} failed: ${message}`);
    await jobRef.update({
      status: "failed",
      error: message.slice(0, 4_000),
      costUsd,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await setPipeline(bookId, stage, "failed", jobId);
  } finally {
    clearInterval(heartbeat);
  }
}
