import sharp from "sharp";

export type KeyedImage = {
  bytes: Buffer;
  contentType: string;
  width: number;
  height: number;
  opaqueFraction: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
};

/** How much greener than red and blue a pixel is. */
function greenness(r: number, g: number, b: number): number {
  return g - Math.max(r, b);
}

/**
 * Turns a cut-out painted on flat #00FF00 into real transparency. Pixels well
 * inside the green become fully transparent; a narrow soft band keeps edges
 * from looking cut with scissors; and green that bled onto the subject's rim
 * is pulled back to neutral ("despill") so no green halo remains.
 */
export async function keyGreenScreen(input: Buffer): Promise<KeyedImage> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixels = Buffer.from(data);
  let opaque = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const soft = 18;
  const hard = 60;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const r = pixels[offset]!;
    const g = pixels[offset + 1]!;
    const b = pixels[offset + 2]!;
    const key = greenness(r, g, b);
    let alpha = 255;
    if (g > 70 && key > soft) {
      alpha = key >= hard ? 0 : Math.round(255 * (1 - (key - soft) / (hard - soft)));
    }
    if (key > 0 && alpha > 0) pixels[offset + 1] = Math.max(r, b);
    pixels[offset + 3] = alpha;
    if (alpha > 128) {
      opaque += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const bytes = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();
  return {
    bytes,
    contentType: "image/webp",
    width,
    height,
    opaqueFraction: opaque / (width * height),
    bbox:
      maxX >= 0
        ? { x: minX / width, y: minY / height, w: (maxX - minX + 1) / width, h: (maxY - minY + 1) / height }
        : null,
  };
}

export async function imageDimensions(input: Buffer): Promise<{ width: number; height: number }> {
  const metadata = await sharp(input).metadata();
  return { width: metadata.width ?? 0, height: metadata.height ?? 0 };
}
