// Runs 2.5D assembly in this process: `run-compose.mts <bookId> [episodeId]`.
import { FieldValue } from "firebase-admin/firestore";
import { composeJob } from "../worker/compose/job.mts";
import { db, workerId } from "../worker/config.mts";
import { runLeasedJob } from "../worker/job-runner.mts";

const bookId = process.argv[2]!;
const episodeId = process.argv[3] ?? null;
const book = (await db.doc(`books/${bookId}`).get()).data()!;
const ref = await db.collection(`books/${bookId}/jobs`).add({
  type: "compose",
  stage: "compose_25d",
  status: "running_v3",
  episodeId,
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
await runLeasedJob(composeJob, bookId, ref.id);
const job = (await ref.get()).data();
console.log(JSON.stringify({ status: job?.status, result: job?.result, error: job?.error }));
const compositions = (await db.collection(`books/${bookId}/compositions`).get()).docs.map((d) => d.data());
for (const c of compositions.filter((c) => c.assembly)) {
  const a = c.assembly;
  console.log(
    c.compositionId,
    a.status,
    `scale ${a.layers[0]?.scale}`,
    `safe ±${a.safeCamera.maxPanX} zoom≤${a.safeCamera.maxZoom}`,
    a.layers.map((l: any) => `${l.layerId}:${l.role === "background" ? "bg" : `${Math.round(l.opaqueFraction * 100)}%`}`).join(" "),
    a.issues.join(" | "),
  );
}
process.exit(0);
