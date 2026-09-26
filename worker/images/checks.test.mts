import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { checkImage, looksLikePanels } from "./checks.mts";

/** A plausible scene: a soft vertical gradient with no straight seams. */
async function scene(width = 768, height = 1376): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const noise = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      pixels[offset] = Math.floor(40 + Math.abs(noise) * 180);
      pixels[offset + 1] = Math.floor(30 + Math.abs(noise * 0.8) * 170);
      pixels[offset + 2] = Math.floor(20 + Math.abs(noise * 0.6) * 160);
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/** Three panels side by side, separated by flat gutters — a reference sheet. */
async function panels(): Promise<Buffer> {
  const width = 768;
  const height = 1376;
  const pixels = Buffer.alloc(width * height * 3, 255);
  const gutter = 40;
  const panelWidth = Math.floor((width - gutter * 4) / 3);
  for (let panel = 0; panel < 3; panel += 1) {
    const left = gutter + panel * (panelWidth + gutter);
    for (let y = gutter; y < height - gutter; y += 1) {
      for (let x = left; x < left + panelWidth; x += 1) {
        const offset = (y * width + x) * 3;
        const noise = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        pixels[offset] = Math.floor(40 + Math.abs(noise) * 180);
        pixels[offset + 1] = Math.floor(30 + Math.abs(noise * 0.8) * 170);
        pixels[offset + 2] = Math.floor(20 + Math.abs(noise * 0.6) * 160);
      }
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function onGreen(subjectShare: number): Promise<Buffer> {
  const width = 768;
  const height = 1376;
  const pixels = Buffer.alloc(width * height * 3);
  const subjectRows = Math.floor(height * subjectShare);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      const subject = y < subjectRows;
      pixels[offset] = subject ? 120 : 0;
      pixels[offset + 1] = subject ? 100 : 255;
      pixels[offset + 2] = subject ? 90 : 0;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

test("a single scene on the 9:16 canvas passes", async () => {
  const check = await checkImage(await scene(), { cutOut: false });
  assert.deepEqual(check, { ok: true, issues: [], checkedAt: check.checkedAt });
});

test("a panelled sheet is refused", async () => {
  assert.equal(await looksLikePanels(await panels()), true);
  const check = await checkImage(await panels(), { cutOut: false });
  assert.equal(check.ok, false);
  assert.match(check.issues.join(" "), /panels or is a reference sheet/);
});

test("a canvas that is not 9:16 is reported", async () => {
  const check = await checkImage(await scene(1024, 1024), { cutOut: false });
  assert.match(check.issues.join(" "), /not the 9:16 canvas/);
});

test("a cut-out needs a green screen with something on it", async () => {
  assert.equal((await checkImage(await onGreen(0.6), { cutOut: true })).ok, true);
  assert.match((await checkImage(await scene(), { cutOut: true })).issues.join(" "), /No green screen/);
  assert.match((await checkImage(await onGreen(0), { cutOut: true })).issues.join(" "), /subject is missing/);
});
