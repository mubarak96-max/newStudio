// Renders a composition with each cut-out's LATEST version (keyed) over the approved background:
// `render-candidates.mts <bookId> <compositionId> <out.png>`.
import sharp from "sharp";
import { keyGreenScreen } from "../worker/compose/keying.mts";
import { db } from "../worker/config.mts";
import { getObject, s3Config } from "../worker/storage/s3.mts";

const [bookId, compositionId, out] = process.argv.slice(2) as [string, string, string];
const composition = (await db.doc(`books/${bookId}/compositions/${compositionId}`).get()).data()!;
const width = 450;
const height = 800;
const layers = [];
for (const layer of [...composition.layers].sort((a, b) => a.zOrder - b.zOrder)) {
  const asset = (await db.doc(`books/${bookId}/visualAssets/layer__${compositionId}__${layer.layerId}`).get()).data();
  const version = layer.role === "background" ? asset?.versions.find((v: { versionId: string }) => v.versionId === asset.approvedVersionId) : asset?.versions.at(-1);
  if (!version) continue;
  let bytes = (await getObject(s3Config(), version.s3Key))!;
  if (layer.role !== "background") bytes = (await keyGreenScreen(bytes)).bytes;
  layers.push({ input: await sharp(bytes).resize(width, height, { fit: "cover" }).png().toBuffer(), left: 0, top: 0 });
}
await sharp({ create: { width, height, channels: 4, background: "#000" } }).composite(layers).png().toFile(out);
console.log("wrote", out, "|", composition.shotSnapshot.description);
process.exit(0);
