import { db, bucket } from "../worker/config.mts";
import { FieldValue } from "firebase-admin/firestore";
const bookId = process.argv[2]!;
const book = (await db.doc(`books/${bookId}`).get()).data()!;
const jobs = await db.collection(`books/${bookId}/jobs`).get();
for (const j of jobs.docs) { await j.ref.delete(); }
console.log("deleted jobs:", jobs.size);
const [files] = await bucket.getFiles({ prefix: `books/${bookId}/sources/${book.activeSourceId}/ledger/` });
for (const f of files) await f.delete();
console.log("deleted checkpoints:", files.length);
const ref = await db.collection(`books/${bookId}/jobs`).add({
  type: "understand", stage: "book_model", status: "queued_v3",
  sourceId: book.activeSourceId, canonicalHash: book.canonical.hash,
  progress: { done: 0, total: book.stats?.paragraphCount ?? 0 },
  checkpoint: null, attempts: 0, error: null, costUsd: 0,
  startedAt: null, finishedAt: null, createdAt: FieldValue.serverTimestamp(),
});
console.log("queued", ref.id);
process.exit(0);
