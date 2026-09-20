import { db } from "../worker/config.mts";
const bookId = process.argv[2]!;
const jobId = process.argv[3]!;
const j = (await db.doc(`books/${bookId}/jobs/${jobId}`).get()).data();
console.log(JSON.stringify({ status: j?.status, phase: j?.phase, progress: j?.progress, cost: j?.costUsd, model: j?.model, checkpoint: j?.checkpoint?.storagePath?.split("/").pop(), error: j?.error, warning: j?.warning, coverage: j?.coverage }));
const l = (await db.doc(`books/${bookId}/derived/ledger`).get()).data();
console.log(JSON.stringify({ entityCount: l?.entityCount, eventCount: l?.eventCount, annotationCount: l?.annotationCount, sceneCount: l?.sceneCount, phase: l?.phase, diagnostics: l?.diagnostics, coverage: l?.coverage }));
process.exit(0);
