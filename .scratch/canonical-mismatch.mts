import { bucket, db } from "../worker/config.mts";
const bookId = process.argv[2]!;
const book = (await db.doc(`books/${bookId}`).get()).data()!;
console.log("book", book.activeSourceId, JSON.stringify(book.canonical), "updatedAt", book.updatedAt?.toDate?.());
const sources = (await db.collection(`books/${bookId}/sources`).get()).docs;
for (const s of sources) {
  const d = s.data();
  console.log("source", s.id, d.origin ?? "raw", d.status, "hash", d.canonicalHash, "path", d.canonicalPath, "created", d.createdAt?.toDate?.());
}
const jobs = (await db.collection(`books/${bookId}/jobs`).get()).docs;
for (const j of jobs) {
  const d = j.data();
  console.log("job", j.id, d.type ?? d.kind, d.status, d.sourceId, String(d.canonicalHash).slice(0, 12), d.error ? `err: ${String(d.error?.message ?? d.error).slice(0, 120)}` : "", d.updatedAt?.toDate?.());
}
const [files] = await bucket.getFiles({ prefix: `books/${bookId}/sources/` });
for (const f of files.filter((f) => f.name.endsWith("canonical.json"))) {
  const [buf] = await f.download();
  const p = JSON.parse(buf.toString("utf8"));
  console.log("file", f.name, "inner", p.sourceId, p.canonicalHash, "paras", p.paragraphs?.length, "updated", f.metadata.updated);
}
process.exit(0);
