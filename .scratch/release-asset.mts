import { db } from "../worker/config.mts";
await db.doc("books/xL5OYox7MFdsTHeXrZ4s/visualAssets/var__con_animal_farm__st_name_change").update({
  status: "generated",
  error: null,
  batchId: null,
});
console.log("released");
process.exit(0);
