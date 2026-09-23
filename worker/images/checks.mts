/**
 * Mechanical checks on a generated image. No model looks at it: images are
 * reviewed by hand, and these only catch the failures that are visible in the
 * pixels themselves — a reference sheet or a three-panel strip returned where
 * a single scene was asked for, a canvas that is not the phone frame, or a
 * cut-out that came back without its green screen.
 */

import sharp from "sharp";

export type ImageExpectation = {
  /** True for a cut-out on a green screen, which is judged differently. */
  cutOut: boolean;
};

export type ImageCheck = {
  ok: boolean;
  issues: string[];
  checkedAt: string;
};

/** The 9:16 canvas every scene layer is generated on. */
const canvasAspect = 9 / 16;

/**
 * A sheet or a strip is several pictures in one frame, separated by straight
 * runs of near-identical rows or columns. One painted scene has no such seams.
 */
export async function looksLikePanels(bytes: Buffer): Promise<boolean> {
  const width = 160;
  const height = 280;
  const { data } = await sharp(bytes).resize(width, height, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const columnFlat = (x: number): boolean => {
    let min = 255;
    let max = 0;
    for (let y = 0; y < height; y += 1) {
      const value = data[y * width + x]!;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    return max - min < 12;
  };
  const rowFlat = (y: number): boolean => {
    let min = 255;
    let max = 0;
    for (let x = 0; x < width; x += 1) {
      const value = data[y * width + x]!;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    return max - min < 12;
  };
  // Gutters sit inside the picture, not at its edges, and run the full side.
  const insideColumns = Array.from({ length: width - 20 }, (_, index) => index + 10).filter(columnFlat);
  const insideRows = Array.from({ length: height - 30 }, (_, index) => index + 15).filter(rowFlat);
  return insideColumns.length >= 3 || insideRows.length >= 4;
}

export async function checkImage(bytes: Buffer, expectation: ImageExpectation): Promise<ImageCheck> {
  const issues: string[] = [];
  const metadata = await sharp(bytes).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (height > 0 && Math.abs(width / height - canvasAspect) > 0.03) {
    issues.push(`${width}×${height} is not the 9:16 canvas.`);
  }
  if (await looksLikePanels(bytes)) {
    issues.push("The image is split into panels or is a reference sheet, not one scene.");
  }
  if (expectation.cutOut) {
    const { data, info } = await sharp(bytes).resize(120, 210, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
    let green = 0;
    for (let index = 0; index < info.width * info.height; index += 1) {
      const offset = index * info.channels;
      const r = data[offset]!;
      const g = data[offset + 1]!;
      const b = data[offset + 2]!;
      if (g - Math.max(r, b) > 40) green += 1;
    }
    const greenShare = green / (info.width * info.height);
    if (greenShare < 0.1) issues.push("No green screen behind the subject; nothing could be keyed out.");
    if (greenShare > 0.97) issues.push("The frame is almost entirely green; the subject is missing.");
  }
  return { ok: issues.length === 0, issues, checkedAt: new Date().toISOString() };
}
