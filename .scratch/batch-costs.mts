import { db } from "../worker/config.mts";
const bookId = "xL5OYox7MFdsTHeXrZ4s";
const batches = (await db.collection(`books/${bookId}/imageBatches`).get()).docs.map((d) => d.data());
let images = 0, est = 0;
for (const b of batches) { images += b.counts?.saved ?? 0; est += b.costUsd ?? 0; console.log(b.status, b.providerState, "saved", b.counts?.saved, "failed", b.counts?.failed, "est $", (b.costUsd ?? 0).toFixed(4)); }
console.log("batches", batches.length, "images saved", images, "estimated total $", est.toFixed(4), "per image $", images ? (est / images).toFixed(4) : "-");
const assets = (await db.collection(`books/${bookId}/visualAssets`).get()).docs.map((d) => d.data());
const or = assets.flatMap((a) => a.versions ?? []).filter((v: any) => v.provider !== "gemini-batch");
console.log("openrouter versions", or.length, "avg $", or.length ? (or.reduce((s: number, v: any) => s + v.costUsd, 0) / or.length).toFixed(4) : "-");
process.exit(0);
