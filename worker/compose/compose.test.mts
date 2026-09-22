import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { baseScaleFor, boxInFrame, clampPose, layerTransform, safeCameraFor } from "../../lib/stage25d.ts";
import { keyGreenScreen } from "./keying.mts";

test("the base scale gives the background exactly the room the planned pan needs, within the cap", () => {
  const scale = baseScaleFor(0.06, 0.04, 0.5);
  assert.equal(scale, 1.06);
  const safe = safeCameraFor(scale, 0.5, 1.2);
  assert.ok(safe.maxPanX >= 0.059 && safe.maxPanX <= 0.06);
  assert.equal(baseScaleFor(1, 1, 1), 1.3, "a huge pan is capped rather than cropping the scene away");
});

test("within the safe camera the background always covers the frame", () => {
  const backgroundParallax = 0.5;
  const scale = baseScaleFor(0.07, 0.07, backgroundParallax);
  const safe = safeCameraFor(scale, backgroundParallax, 1.4);
  for (const pose of [
    { x: safe.maxPanX, y: -safe.maxPanY, zoom: 1, rotate: 0 },
    { x: -safe.maxPanX, y: safe.maxPanY, zoom: 1.4, rotate: 0 },
  ]) {
    const t = layerTransform(pose, scale, backgroundParallax);
    assert.ok(Math.abs(t.x) + 0.5 <= t.scale / 2 + 1e-9, "left/right edge stays outside the frame");
    assert.ok(Math.abs(t.y) + 0.5 <= t.scale / 2 + 1e-9, "top/bottom edge stays outside the frame");
  }
});

test("near layers move further than far ones for the same camera pan", () => {
  const pose = { x: 0.05, y: 0, zoom: 1.1, rotate: 0 };
  assert.ok(Math.abs(layerTransform(pose, 1.1, 0.9).x) > Math.abs(layerTransform(pose, 1.1, 0.5).x));
});

test("clamping keeps poses inside the safe camera and zoom at or above 1", () => {
  const clamped = clampPose({ x: 0.2, y: -0.2, zoom: 0.8, rotate: 0.3 }, { maxPanX: 0.05, maxPanY: 0.04, maxZoom: 1.3, maxTilt: 0 });
  assert.deepEqual(clamped, { x: 0.05, y: -0.04, zoom: 1, rotate: 0 });
});

test("a cut-out's box is mapped into the scaled frame and clipped to it", () => {
  assert.deepEqual(boxInFrame({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 1), { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  const grown = boxInFrame({ x: 0, y: 0, w: 1, h: 1 }, 1.2)!;
  assert.deepEqual(grown, { x: 0, y: 0, w: 1, h: 1 });
});

test("keying removes the green screen and finds the subject", async () => {
  const width = 40;
  const height = 60;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const subject = x >= 10 && x < 30 && y >= 20 && y < 50;
      pixels[offset] = subject ? 160 : 0;
      pixels[offset + 1] = subject ? 90 : 255;
      pixels[offset + 2] = subject ? 60 : 0;
    }
  }
  const jpeg = await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  const keyed = await keyGreenScreen(jpeg);
  assert.equal(keyed.contentType, "image/webp");
  const expected = (20 * 30) / (width * height);
  assert.ok(Math.abs(keyed.opaqueFraction - expected) < 0.05, `opaque ${keyed.opaqueFraction} vs ${expected}`);
  assert.ok(keyed.bbox);
  assert.ok(Math.abs(keyed.bbox!.x - 0.25) < 0.06 && Math.abs(keyed.bbox!.w - 0.5) < 0.1);
  const { data, info } = await sharp(keyed.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 0, "a corner pixel of the green screen is transparent");
  const centre = ((info.height >> 1) * info.width + (info.width >> 1)) * 4;
  assert.equal(data[centre + 3], 255, "the subject stays opaque");
});
