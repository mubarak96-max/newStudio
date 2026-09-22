// Of the flagged compositions, lists those whose background people duplicate a figure cut-out layer.
import { db } from "../worker/config.mts";

const bookId = process.argv[2]!;
const flagged = process.argv.slice(3);
const names = new Map((await db.collection(`books/${bookId}/entities`).get()).docs.map((d) => [d.id, d.data().canonicalName]));
for (const id of flagged) {
  const c = (await db.doc(`books/${bookId}/compositions/${id}`).get()).data()!;
  const figures = c.layers.filter((l: { role: string }) => l.role !== "background");
  const who = figures.flatMap((l: { entityIds?: string[] }) => l.entityIds ?? []).map((e: string) => names.get(e) ?? e);
  console.log(figures.length > 0 ? "FIX " : "KEEP", id, `[${who.join("+")}]`, "|", c.shotSnapshot.description.slice(0, 100));
}
process.exit(0);
