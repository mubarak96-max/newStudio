// Renders an assembled composition at rest (camera centred) to a PNG, stacking layers as the player does.
import sharp from "sharp";
import { db } from "../worker/config.mts";
import { getObject, s3Config } from "../worker/storage/s3.mts";

const [bookId, compositionId, out] = process.argv.slice(2) as [string, string, string];
const composition = (await db.doc(`books/${bookId}/compositions/${compositionId}`).get()).data()!;
const width = 450;
const height = 800;
const layers = [];
for (const layer of composition.assembly.layers) {
  const bytes = (await getObject(s3Config(), layer.s3Key))!;
  const scaledW = Math.round(width * layer.scale);
  const scaledH = Math.round(height * layer.scale);
  const resized = await sharp(bytes).resize(scaledW, scaledH, { fit: "cover" }).png().toBuffer();
  const left = Math.round((width - scaledW) / 2);
  const top = Math.round((height - scaledH) / 2);
  const cropped = await sharp(resized)
    .extract({ left: -left, top: -top, width, height })
    .png()
    .toBuffer();
  layers.push({ input: cropped, left: 0, top: 0 });
}
await sharp({ create: { width, height, channels: 4, background: "#000" } }).composite(layers).png().toFile(out);
console.log("wrote", out, composition.shotSnapshot.description);
process.exit(0);
