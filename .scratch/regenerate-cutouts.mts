// Regenerates every character cut-out of a book one at a time through OpenRouter:
// `regenerate-cutouts.mts <bookId>`.
import { FieldValue } from "firebase-admin/firestore";
import { db, workerId } from "../worker/config.mts";
import { imageJob } from "../worker/images/job.mts";
import { runLeasedJob } from "../worker/job-runner.mts";

const bookId = process.argv[2]!;
const book = (await db.doc(`books/${bookId}`).get()).data()!;
const lineage = { sourceId: book.activeSourceId, canonicalHash: book.canonical.hash };
const compositions = (await db.collection(`books/${bookId}/compositions`).get()).docs
  .map((d) => d.data())
  .filter((c) => c.sourceId === lineage.sourceId && c.canonicalHash === lineage.canonicalHash);
const targets = compositions.flatMap((c) =>
  c.layers
    .filter((l: { role: string; layerId: string }) => l.role !== "background" && (!process.argv[3] || l.layerId === process.argv[3]))
    .map((l: { layerId: string }) => ({ kind: "layer", entityId: null, stateId: null, compositionId: c.compositionId, layerId: l.layerId })),
);
console.log("cut-outs", targets.length);
let total = 0;
for (const [index, target] of targets.entries()) {
  const ref = await db.collection(`books/${bookId}/jobs`).add({
    type: "image",
    stage: "images",
    status: "running_v3",
    target,
    note: null,
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
  console.log(`${index + 1}/${targets.length}`, job?.status, job?.result ?? job?.error);
}
console.log(`done, $${total.toFixed(3)}`);
process.exit(0);
