import { db } from "../worker/config.mts";
const bookId = process.argv[2] ?? "xL5OYox7MFdsTHeXrZ4s";
const assets = (await db.collection(`books/${bookId}/visualAssets`).get()).docs.map((d) => d.data());
const byKind: Record<string, { total: number; approved: number; withVersion: number }> = {};
const types = new Set<string>();
for (const a of assets) {
  const k = (byKind[a.kind] ??= { total: 0, approved: 0, withVersion: 0 });
  k.total += 1;
  if (a.approvedVersionId) k.approved += 1;
  if ((a.versions ?? []).length) k.withVersion += 1;
  for (const v of a.versions ?? []) types.add(`${v.contentType} ${v.width}x${v.height}`);
}
console.log(JSON.stringify(byKind));
const layers = assets.filter((a) => a.kind === "layer");
const byEpisode: Record<string, number> = {};
for (const l of layers) if (l.approvedVersionId) byEpisode[l.episodeId] = (byEpisode[l.episodeId] ?? 0) + 1;
console.log("approved layers by episode", JSON.stringify(byEpisode));
const comps = (await db.collection(`books/${bookId}/compositions`).get()).docs.map((d) => d.data());
const perEpisode: Record<string, number> = {};
for (const c of comps) perEpisode[c.originEpisodeId] = (perEpisode[c.originEpisodeId] ?? 0) + c.layers.length;
console.log("planned layers by episode", JSON.stringify(perEpisode));
console.log("formats", [...types].slice(0, 8).join(" | "));
process.exit(0);
