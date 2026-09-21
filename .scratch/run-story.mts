// Runs one pipeline job in this process: `run-story.mts <bookId> [story|beats|visuals] [--no-chain]`.
// The job is created already leased (running_v3 with a fresh heartbeat) so no
// other worker picks it up.
import { FieldValue } from "firebase-admin/firestore";
import { beatsJob } from "../worker/beats/job.mts";
import { db, workerId } from "../worker/config.mts";
import { jobStages, type ChainedJobType } from "../worker/job-queue.mts";
import { runLeasedJob } from "../worker/job-runner.mts";
import { storyJob } from "../worker/story/job.mts";
import { visualsJob } from "../worker/visuals/job.mts";

const bookId = process.argv[2]!;
const type = (process.argv[3] ?? "story") as ChainedJobType;
const chain = !process.argv.includes("--no-chain");
const book = (await db.doc(`books/${bookId}`).get()).data()!;

async function runOne(jobType: ChainedJobType): Promise<void> {
  const ref = await db.collection(`books/${bookId}/jobs`).add({
    type: jobType,
    stage: jobStages[jobType],
    status: "running_v3",
    sourceId: book.activeSourceId,
    canonicalHash: book.canonical.hash,
    progress: { done: 0, total: 0 },
    activity: null,
    checkpoint: null,
    attempts: 1,
    error: null,
    costUsd: 0,
    leaseOwner: workerId,
    heartbeatAt: FieldValue.serverTimestamp(),
    startedAt: FieldValue.serverTimestamp(),
    finishedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log("running", jobType, ref.id);
  // Chaining is done here in-process rather than by queuing, which would hand
  // the next job to whatever worker is polling.
  if (jobType === "story") await runLeasedJob(storyJob, bookId, ref.id, { chain: false });
  if (jobType === "beats") await runLeasedJob(beatsJob, bookId, ref.id, { chain: false });
  if (jobType === "visuals") await runLeasedJob(visualsJob, bookId, ref.id, { chain: false });
  const job = (await ref.get()).data();
  console.log(JSON.stringify({ type: jobType, status: job?.status, result: job?.result, error: job?.error, warning: job?.warning, costUsd: job?.costUsd }));
  if (job?.status !== "completed") process.exit(1);
}

const order: ChainedJobType[] = ["story", "beats", "visuals"];
for (const jobType of chain ? order.slice(order.indexOf(type)) : [type]) await runOne(jobType);
process.exit(0);
