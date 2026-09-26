import { db } from "../worker/config.mts";
import { loadParagraphs } from "../worker/persist.mts";
const [bookId, sourceId] = process.argv.slice(2) as [string, string];
const source = (await db.doc(`books/${bookId}/sources/${sourceId}`).get()).data()!;
const paragraphs = await loadParagraphs(bookId, sourceId, source.canonicalHash, source.canonicalPath, source.textHash);
console.log("loaded", paragraphs.length, "paragraphs from", source.canonicalPath);
process.exit(0);
