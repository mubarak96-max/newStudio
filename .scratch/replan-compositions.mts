// Re-plans compositions only (no model calls): `replan-compositions.mts <bookId>`.
import { FieldValue } from "firebase-admin/firestore";
import { db, workerId } from "../worker/config.mts";
import { runLeasedJob } from "../worker/job-runner.mts";
import { visualsJob } from "../worker/visuals/job.mts";

const bookId = process.argv[2]!;
const book = (await db.doc(`books/${bookId}`).get()).data()!;
const ref = await db.collection(`books/${bookId}/jobs`).add({
  type: "visuals",
  stage: "visual_plan",
  status: "running_v3",
  onlyCompositions: true,
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
await runLeasedJob(visualsJob, bookId, ref.id, { chain: false });
const job = (await ref.get()).data();
console.log(JSON.stringify({ status: job?.status, result: job?.result, error: job?.error, costUsd: job?.costUsd }));
const compositions = (await db.collection(`books/${bookId}/compositions`).get()).docs.map((d) => d.data());
const layers = compositions.flatMap((c) => c.layers.map((l: any) => ({ c: c.compositionId, ...l })));
console.log("compositions", compositions.length, "background", layers.filter((l) => l.role === "background").length, "cut-outs", layers.filter((l) => l.role !== "background").length);
for (const l of layers.filter((l) => l.role !== "background").slice(0, 6)) console.log(l.c, l.layerId, JSON.stringify(l.placement));
process.exit(0);
