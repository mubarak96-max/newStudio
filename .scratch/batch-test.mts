// End-to-end Gemini batch test: submit one image, poll until Gemini finishes, save it.
import { FieldValue } from "firebase-admin/firestore";
import { db, workerId } from "../worker/config.mts";
import { imageBatchJob, pollImageBatches } from "../worker/images/batch.mts";
import { runLeasedJob } from "../worker/job-runner.mts";

const bookId = "xL5OYox7MFdsTHeXrZ4s";
const book = (await db.doc(`books/${bookId}`).get()).data()!;
const target = { kind: "variant", entityId: "con_animal_farm", stateId: "st_name_change", compositionId: null, layerId: null };
const ref = await db.collection(`books/${bookId}/jobs`).add({
  type: "imageBatch",
  stage: "images",
  status: "running_v3",
  items: [{ target, note: null }],
  sourceId: book.activeSourceId,
  canonicalHash: book.canonical.hash,
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
await runLeasedJob(imageBatchJob, bookId, ref.id);
const job = (await ref.get()).data();
console.log("submit:", job?.status, job?.result ?? job?.error);
if (job?.status !== "completed") process.exit(1);

const started = Date.now();
for (;;) {
  await pollImageBatches((message) => console.log(`[poll] ${message}`));
  const batches = await db.collection(`books/${bookId}/imageBatches`).where("jobId", "==", ref.id).get();
  const batch = batches.docs[0]?.data();
  console.log(new Date().toISOString(), "batch", batch?.status, batch?.providerState, batch?.error ?? "");
  if (batch && ["completed", "failed"].includes(batch.status)) {
    const asset = (await db.doc("books/xL5OYox7MFdsTHeXrZ4s/visualAssets/var__con_animal_farm__st_name_change").get()).data();
    const version = asset?.versions?.at(-1);
    console.log("asset", asset?.status, asset?.error ?? "", version ? `${version.width}x${version.height} ${version.provider} ~$${version.costUsd}` : "no version");
    if (version) {
      const response = await fetch(version.url);
      console.log("cloudfront", response.status);
    }
    break;
  }
  if (Date.now() - started > 3 * 60 * 60_000) {
    console.log("still running after 3h; the worker will collect it when it next runs.");
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 60_000));
}
process.exit(0);
