import { db } from "../worker/config.mts";
const bookId = process.argv[2]!;
const book = (await db.doc(`books/${bookId}`).get()).data()!;
const entities = (await db.collection(`books/${bookId}/entities`).get()).docs.map((d) => d.data());
const refs = (await db.collection(`books/${bookId}/visualAssets`).get()).docs.map((d) => d.data()).filter((a) => a.kind === "reference");
for (const r of refs) {
  const e = entities.find((x) => x.entityId === r.entityId);
  console.log(r.entityId, "| entity:", e ? `${e.type} lineage ${e.sourceId === book.activeSourceId && e.canonicalHash === book.canonical.hash ? "active" : "OLD"} spec ${e.visual?.spec ? "yes" : "NO"}` : "MISSING");
}
process.exit(0);
