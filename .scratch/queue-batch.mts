// Queues a one-image Gemini batch exactly as the Images page does, for the running worker to pick up.
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../worker/config.mts";

const bookId = "xL5OYox7MFdsTHeXrZ4s";
const book = (await db.doc(`books/${bookId}`).get()).data()!;
const lineage = { sourceId: book.activeSourceId, canonicalHash: book.canonical.hash };
const target = { kind: "variant", entityId: "con_animal_farm", stateId: "st_name_change", compositionId: null, layerId: null };
const ref = await db.collection(`books/${bookId}/jobs`).add({
  type: "imageBatch",
  stage: "images",
  status: "queued_v3",
  items: [{ target, note: null }],
  ...lineage,
  progress: { done: 0, total: 1 },
  activity: null,
  checkpoint: null,
  attempts: 0,
  error: null,
  costUsd: 0,
  startedAt: null,
  finishedAt: null,
  createdAt: FieldValue.serverTimestamp(),
});
await db
  .doc(`books/${bookId}/visualAssets/var__con_animal_farm__st_name_change`)
  .set({ ...lineage, ...target, targetId: "var__con_animal_farm__st_name_change", status: "batched", error: null, lastJobId: ref.id }, { merge: true });
console.log("queued", ref.id);
process.exit(0);
