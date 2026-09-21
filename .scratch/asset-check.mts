import { db } from "../worker/config.mts";
const a = (await db.doc("books/xL5OYox7MFdsTHeXrZ4s/visualAssets/ref__con_animal_farm").get()).data()!;
for (const v of a.versions) {
  console.log(v.width, "x", v.height, v.contentType, v.sizeBytes, "cost", v.costUsd, "refs", v.references.length);
  const r = await fetch(v.url);
  console.log("cloudfront", r.status, r.headers.get("content-type"));
}
process.exit(0);
