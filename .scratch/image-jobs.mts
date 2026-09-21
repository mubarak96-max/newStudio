import { db } from "../worker/config.mts";
const bookId = process.argv[2]!;
const jobs = await db.collection(`books/${bookId}/jobs`).where("type", "==", "image").get();
for (const j of jobs.docs) {
  const d = j.data();
  console.log(j.id, d.status, JSON.stringify(d.target), "attempts", d.attempts, "worker", d.workerVersion, "heartbeat", d.heartbeatAt?.toDate?.()?.toISOString(), "created", d.createdAt?.toDate?.()?.toISOString(), "err", d.error, "phase", d.phase);
}
const assets = await db.collection(`books/${bookId}/visualAssets`).get();
for (const a of assets.docs) console.log("asset", a.id, a.data().status, (a.data().versions ?? []).length, a.data().error);
const book = (await db.doc(`books/${bookId}`).get()).data();
console.log("pipeline", JSON.stringify(book?.pipeline));
process.exit(0);
