import assert from "node:assert/strict";
import { test } from "node:test";
import { judgeAuthoredPrompt, type PromptContract } from "./authoring.mts";

const contract: PromptContract = {
  requiredNames: ["John"],
  forbiddenNames: ["Jennie"],
  anchors: ["bed", "window"],
  minChars: 60,
  maxChars: 600,
};

const good =
  "John sits on the edge of the iron bed, hands loose between his knees, his head level with the lower sash of the window behind him. " +
  "Medium shot on a 50mm lens at seated eye height, the afternoon light raking in from the left across the boards.";

test("a prompt that names its subject and a scale reference passes", () => {
  assert.deepEqual(judgeAuthoredPrompt(good, contract), { ok: true });
});

test("a prompt that forgets its subject is refused", () => {
  const verdict = judgeAuthoredPrompt(good.replace(/John/g, "A man"), contract);
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /does not name John/);
});

test("a prompt that brings in someone else is refused", () => {
  const verdict = judgeAuthoredPrompt(`${good} Jennie watches from the doorway.`, contract);
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /Jennie/);
});

test("a prompt with no scale reference is refused", () => {
  const verdict = judgeAuthoredPrompt(
    "John stands with his arms crossed, lit from the left, his expression closed and unreadable in the fading afternoon light of the room.",
    contract,
  );
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /scale reference/);
});

test("a prompt asking for text or panels in the image is refused", () => {
  for (const bad of ["a caption beneath the figure", "drawn as three panels side by side", "a small watermark in the corner"]) {
    const verdict = judgeAuthoredPrompt(`${good} Add ${bad}.`, contract);
    assert.equal(verdict.ok, false, `expected refusal for "${bad}"`);
  }
});

test("a list is refused, and so are runaway or stub lengths", () => {
  assert.equal(judgeAuthoredPrompt("- John sits on the bed\n- the window is behind him\n- light from the left", contract).ok, false);
  assert.equal(judgeAuthoredPrompt("John on the bed.", contract).ok, false);
  assert.equal(judgeAuthoredPrompt(`${good} ${"the room is dim. ".repeat(60)}`, contract).ok, false);
});

test("a background layer needs no named subject but still needs scale", () => {
  const background: PromptContract = { ...contract, requiredNames: [] };
  const verdict = judgeAuthoredPrompt(
    "The empty nursery at mid-afternoon, the iron bed pushed against the far wall, boards bare and scarred, light falling through the barred window onto them.",
    background,
  );
  assert.deepEqual(verdict, { ok: true });
});
