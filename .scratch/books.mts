import { db } from "../worker/config.mts";
const books = await db.collection("books").get();
for (const b of books.docs) {
  const d = b.data();
  const l = (await db.doc(`books/${b.id}/derived/ledger`).get()).data();
  console.log(b.id, "|", d.metaData?.title ?? d.title, "|", JSON.stringify(d.pipeline), "| paras", d.stats?.paragraphCount, "story", d.stats?.storyParagraphCount, "words", d.stats?.wordCount, "| ledger", l?.phase, "ent", l?.entityCount, "ev", l?.eventCount, "scenes", l?.sceneCount, "chapters", (l?.chapterSummaries ?? []).length, "sameSource", d.activeSourceId === l?.sourceId);
}
process.exit(0);
