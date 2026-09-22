import { db } from "../worker/config.mts";
const bookId = "CpW7yZu1Jv9920l70QCy";
const book = (await db.doc(`books/${bookId}`).get()).data()!;
const same = (d: any) => d.sourceId === book.activeSourceId && d.canonicalHash === book.canonical.hash;
const comps = (await db.collection(`books/${bookId}/compositions`).get()).docs.map((d) => d.data()).filter(same);
const plan = new Set(comps.flatMap((c) => c.layers.map((l: any) => `layer__${c.compositionId}__${l.layerId}`)));
const entities = (await db.collection(`books/${bookId}/entities`).get()).docs.map((d) => d.data()).filter((e) => same(e) && e.visual?.spec);
for (const e of entities) { plan.add(`ref__${e.entityId}`); for (const s of Object.keys(e.visual.stateVariants ?? {})) plan.add(`var__${e.entityId}__${s}`); }
const assets = (await db.collection(`books/${bookId}/visualAssets`).get()).docs.map((d) => d.data()).filter(same);
const waiting = assets.filter((a) => plan.has(a.targetId) && a.versions?.length && a.versions.at(-1).versionId !== a.approvedVersionId && !["generating", "batched"].includes(a.status));
console.log("to review", waiting.length);
for (const a of waiting) console.log(" ", a.targetId);
process.exit(0);
