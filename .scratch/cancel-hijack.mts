import { FieldValue } from "firebase-admin/firestore";
import { db } from "../worker/config.mts";
const bookId = "xL5OYox7MFdsTHeXrZ4s";
const message = "Cancelled: an outdated worker picked this up. Restart the worker (npm run worker) and generate again.";
for (const jobId of ["ctHJZsp6dRgWkhBl9FHa", "BWKsDvsC8m8MPi1AxDBV"]) {
  await db.doc(`books/${bookId}/jobs/${jobId}`).update({ status: "cancelled", error: message, finishedAt: FieldValue.serverTimestamp() });
}
for (const assetId of ["ref__con_animal_farm", "var__con_animal_farm__st_name_change"]) {
  await db.doc(`books/${bookId}/visualAssets/${assetId}`).update({ status: "failed", error: message });
}
console.log("cancelled");
process.exit(0);
