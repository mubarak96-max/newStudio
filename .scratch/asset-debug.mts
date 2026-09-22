import { db } from "../worker/config.mts";
const bookId = "CpW7yZu1Jv9920l70QCy";
const book = (await db.doc(`books/${bookId}`).get()).data()!;
console.log("book lineage", book.activeSourceId, book.canonical.hash.slice(0, 12));
for (const id of ["layer__comp_5487230642369ec3__fg_cast", "layer__comp_5487230642369ec3__background", "layer__comp_0b61b98d7d12b0c5__fg_ch_john"]) {
  const a = (await db.doc(`books/${bookId}/visualAssets/${id}`).get()).data();
  console.log(id, "|", a ? `status ${a.status} versions ${a.versions?.length} approved ${a.approvedVersionId?.slice(0, 8) ?? "none"} latest ${a.versions?.at(-1)?.versionId.slice(0, 8)} lineage ${a.sourceId === book.activeSourceId && a.canonicalHash === book.canonical.hash ? "ok" : `MISMATCH ${a.sourceId} ${String(a.canonicalHash).slice(0, 12)}`} kind ${a.kind} episode ${a.episodeId}` : "MISSING");
}
const c = (await db.doc(`books/${bookId}/compositions/comp_5487230642369ec3`).get()).data()!;
console.log("composition", c.originEpisodeId, c.layers.map((l: any) => l.layerId).join(","), "lineage", c.sourceId === book.activeSourceId ? "ok" : "MISMATCH");
process.exit(0);
