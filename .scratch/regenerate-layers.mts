// Regenerates specific layers through OpenRouter with an optional note:
// `regenerate-layers.mts <bookId> "<note>" <compositionId:layerId> ...`.
import { FieldValue } from "firebase-admin/firestore";
import { db, workerId } from "../worker/config.mts";
import { imageJob } from "../worker/images/job.mts";
import { runLeasedJob } from "../worker/job-runner.mts";

const [bookId, note, ...pairs] = process.argv.slice(2) as [string, string, ...string[]];
const book = (await db.doc(`books/${bookId}`).get()).data()!;
const lineage = { sourceId: book.activeSourceId, canonicalHash: book.canonical.hash };
let total = 0;
for (const pair of pairs) {
  const [compositionId, layerId] = pair.split(":");
  const target = { kind: "layer", entityId: null, stateId: null, compositionId, layerId };
  const ref = await db.collection(`books/${bookId}/jobs`).add({
    type: "image",
    stage: "images",
    status: "running_v3",
    target,
    note: note || null,
    ...lineage,
    progress: { done: 0, total: 1 },
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
  await runLeasedJob(imageJob, bookId, ref.id);
  const job = (await ref.get()).data();
  total += Number(job?.costUsd ?? 0);
  console.log(pair, job?.status, job?.result ?? job?.error);
}
console.log(`done, $${total.toFixed(3)}`);
process.exit(0);
