import { db } from "../worker/config.mts";
const bookId = "xL5OYox7MFdsTHeXrZ4s";
const l = (await db.doc(`books/${bookId}/derived/ledger`).get()).data();
console.log("ledger", l?.phase, "entities", l?.entityCount, "events", l?.eventCount, "chapters", (l?.chapterSummaries ?? []).length, "checkpoint", l?.checkpointPath);
const jobs = await db.collection(`books/${bookId}/jobs`).where("type", "==", "understand").get();
for (const j of jobs.docs) { const d = j.data(); console.log(j.id, d.status, d.phase, d.checkpoint?.storagePath, d.finishedAt?.toDate?.()?.toISOString()); }
const h = (await db.doc(`books/${bookId}/jobs/ctHJZsp6dRgWkhBl9FHa`).get()).data();
console.log("hijacked", h?.status, h?.heartbeatAt?.toDate?.()?.toISOString(), h?.checkpoint?.storagePath);
process.exit(0);
