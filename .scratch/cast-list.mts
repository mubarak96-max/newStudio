import { db } from "../worker/config.mts";
const comps = (await db.collection(`books/${process.argv[2]}/compositions`).get()).docs.map((d) => d.data());
for (const c of comps) for (const l of c.layers) if (l.layerId === "fg_cast") console.log(c.compositionId, l.entityIds.join("+"), "|", c.shotSnapshot.description.slice(0, 90));
process.exit(0);
