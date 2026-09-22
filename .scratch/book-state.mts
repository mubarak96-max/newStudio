import { db } from "../worker/config.mts";
const d = (await db.doc(`books/${process.argv[2]}`).get()).data()!;
console.log(d.metaData?.title ?? d.title, "|", JSON.stringify(d.pipeline), "| stats", JSON.stringify(d.stats));
const eps = (await db.collection(`books/${process.argv[2]}/episodes`).orderBy("order").get()).docs.map((x) => x.data());
console.log("episodes", eps.length, eps.map((e) => `${e.episodeId}:${e.momentCount}m/${e.beatCount ?? 0}b`).join(" "));
process.exit(0);
