import { bucket, db } from "../worker/config.mts";
import { ledgerSummary } from "../worker/persist.mts";
import { upgradeLedger, type Ledger } from "../worker/types.mts";
const bookId = "xL5OYox7MFdsTHeXrZ4s";
const hijacked = db.doc(`books/${bookId}/jobs/ctHJZsp6dRgWkhBl9FHa`);
const good = "books/xL5OYox7MFdsTHeXrZ4s/sources/src_1ef04d554daa6f46/ledger/zITCoI7fsX8UjQl9J5LN/000070-consolidate-complete.json";
// Wait until the outdated worker has stopped writing checkpoints for the cancelled job.
let last = "";
for (;;) {
  const [files] = await bucket.getFiles({ prefix: `books/${bookId}/sources/src_1ef04d554daa6f46/ledger/ctHJZsp6dRgWkhBl9FHa/` });
  const newest = files.map((file) => file.name).sort().at(-1) ?? "";
  const heartbeat = (await hijacked.get()).data()?.heartbeatAt?.toMillis?.() ?? 0;
  const quiet = Date.now() - heartbeat > 150_000;
  console.log(new Date().toISOString(), "newest", newest.split("/").pop(), "quiet", quiet);
  if (quiet && newest === last) break;
  last = newest;
  await new Promise((resolve) => setTimeout(resolve, 60_000));
}
const [buffer] = await bucket.file(good).download();
const ledger = upgradeLedger(JSON.parse(buffer.toString("utf8")) as Ledger);
if (ledger.phase !== "done") throw new Error(`checkpoint phase ${ledger.phase}`);
await db.doc(`books/${bookId}/derived/ledger`).set(ledgerSummary(ledger, { checkpointPath: good }));
await db.doc(`books/${bookId}`).update({ pipeline: { stage: "visual_plan", stageStatus: "done", lastJobId: "N3SbZg5YZCFbI9fsy5ym", updatedAt: new Date().toISOString() } });
const restored = (await db.doc(`books/${bookId}/derived/ledger`).get()).data();
console.log("restored", restored?.phase, "entities", restored?.entityCount, "events", restored?.eventCount, "chapters", restored?.chapterSummaries?.length);
process.exit(0);
