// Prints the state of a batch job, its Gemini batch and the asset it feeds.
import { db } from "../worker/config.mts";

const bookId = "xL5OYox7MFdsTHeXrZ4s";
const jobId = process.argv[2]!;
const job = (await db.doc(`books/${bookId}/jobs/${jobId}`).get()).data();
console.log("job", job?.status, job?.workerVersion ?? "-", job?.result ?? job?.error ?? "");
const batch = (await db.collection(`books/${bookId}/imageBatches`).where("jobId", "==", jobId).get()).docs[0]?.data();
console.log("batch", batch?.status ?? "-", batch?.providerState ?? "-", batch?.providerName ?? "-", batch?.error ?? "", batch?.counts ? JSON.stringify(batch.counts) : "");
const asset = (await db.doc(`books/${bookId}/visualAssets/var__con_animal_farm__st_name_change`).get()).data();
const version = asset?.versions?.at(-1);
console.log("asset", asset?.status, asset?.error ?? "", version ? `${version.width}x${version.height} ${version.provider} ~$${version.costUsd}` : "no version");
if (version?.provider === "gemini-batch") console.log("cloudfront", (await fetch(version.url)).status);
process.exit(0);
