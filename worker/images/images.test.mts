import assert from "node:assert/strict";
import { test } from "node:test";
import type { CompositionPlan, VisualProfile } from "../../lib/story-types.ts";
import { batchLine, readBatchResult } from "../providers/gemini-batch.mts";
import { imageSize } from "../providers/image-files.mts";
import { signRequest } from "../storage/s3.mts";
import { planImage, type EntityForImage } from "./request.mts";

const profile: VisualProfile = {
  version: 1,
  artStyle: "Ink and wash",
  medium: "watercolour",
  palette: [],
  lens: "",
  lighting: "",
  texture: "",
  eraDetails: "",
  negativeRules: ["text", "watermarks"],
};

const boxer: EntityForImage = {
  entityId: "ch_boxer",
  name: "Boxer",
  type: "character",
  visual: {
    spec: "A huge cart-horse",
    sourceFacts: [],
    referenceSheet: { views: ["front"], prompt: "Reference sheet of Boxer.", approved: false },
    stateVariants: { st_injured: { label: "Split hoof", spec: "Limping", validFromSeq: 300, approved: false } },
    preRevealSpec: null,
    layout: null,
  },
};

const composition = {
  compositionId: "comp_k1",
  originEpisodeId: "ep_03",
  locationId: "loc_quarry",
  entityStatesUsed: [{ entityId: "ch_boxer", stateId: "st_injured" }],
  layers: [
    { layerId: "background", role: "background", entityId: "loc_quarry", prompt: "The quarry at dusk." },
    {
      layerId: "fg_ch_boxer",
      role: "foreground",
      entityId: "ch_boxer",
      prompt: "Boxer hauls stone. Isolated on a transparent background, lit to match the scene.",
    },
  ],
} as unknown as CompositionPlan;

const target = (kind: "reference" | "variant" | "layer", extra: Partial<Record<string, string>> = {}) => ({
  kind,
  entityId: extra.entityId ?? null,
  stateId: extra.stateId ?? null,
  compositionId: extra.compositionId ?? null,
  layerId: extra.layerId ?? null,
});

test("a reference sheet uses no references and carries the negative rules and editor note", () => {
  const planned = planImage(target("reference", { entityId: "ch_boxer" }), { profile, entity: boxer, composition: null, note: "darker mane" });
  assert.deepEqual(planned.referenceTargets, []);
  assert.equal(planned.aspectRatio, "16:9");
  assert.match(planned.prompt, /Avoid: text, watermarks/);
  assert.match(planned.prompt, /darker mane/);
});

test("a state variant is conditioned on the entity's own reference sheet", () => {
  const planned = planImage(target("variant", { entityId: "ch_boxer", stateId: "st_injured" }), { profile, entity: boxer, composition: null, note: null });
  assert.deepEqual(planned.referenceTargets, [["ref__ch_boxer"]]);
  assert.match(planned.prompt, /Split hoof/);
});

test("a foreground layer uses its subject's state variant first and asks for a green screen", () => {
  const planned = planImage(target("layer", { compositionId: "comp_k1", layerId: "fg_ch_boxer" }), { profile, entity: null, composition, note: null });
  assert.deepEqual(planned.referenceTargets, [["var__ch_boxer__st_injured", "ref__ch_boxer"]]);
  assert.equal(planned.alpha, "chroma-green");
  assert.equal(planned.aspectRatio, "9:16");
  assert.match(planned.prompt, /vertical 9:16 phone screen/);
  assert.equal(planned.episodeId, "ep_03");
  assert.match(planned.prompt, /#00FF00/);
  assert.doesNotMatch(planned.prompt, /transparent background/);
});

test("a background layer is conditioned only on its place", () => {
  const planned = planImage(target("layer", { compositionId: "comp_k1", layerId: "background" }), { profile, entity: null, composition, note: null });
  assert.deepEqual(planned.referenceTargets, [["ref__loc_quarry"]]);
  assert.equal(planned.alpha, "none");
});

test("a batch line is a generateContent request with references before the prompt", () => {
  const line = JSON.parse(
    batchLine({
      key: "ref__ch_boxer",
      prompt: "Boxer",
      aspectRatio: "16:9",
      references: [{ contentType: "image/jpeg", bytes: Buffer.from("abc") }],
    }),
  );
  assert.equal(line.key, "ref__ch_boxer");
  const parts = line.request.contents[0].parts;
  assert.deepEqual(parts[0], { inlineData: { mimeType: "image/jpeg", data: Buffer.from("abc").toString("base64") } });
  assert.deepEqual(parts[1], { text: "Boxer" });
  assert.equal(line.request.generationConfig.imageConfig.aspectRatio, "16:9");
  assert.ok(line.request.generationConfig.responseModalities.includes("IMAGE"));
});

test("batch results yield the image, or a readable reason when there is none", () => {
  const ok = readBatchResult({
    key: "k1",
    response: {
      candidates: [{ content: { parts: [{ text: "here" }, { inlineData: { mimeType: "image/png", data: Buffer.from("png").toString("base64") } }] } }],
      usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 1290 },
    },
  });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.bytes.toString(), "png");
    assert.equal(ok.outputTokens, 1290);
  }
  const blocked = readBatchResult({ key: "k2", response: { candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] } });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.error, /IMAGE_SAFETY/);
  const errored = readBatchResult({ key: "k3", error: { code: 400, message: "bad" } });
  assert.equal(errored.ok, false);
  const inlined = readBatchResult({ metadata: { key: "k4" }, error: { code: 500 } });
  assert.equal(inlined.key, "k4");
});

test("imageSize reads PNG dimensions", () => {
  const png = Buffer.alloc(33);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(896, 16);
  png.writeUInt32BE(1120, 20);
  assert.deepEqual(imageSize(png), { width: 896, height: 1120 });
});

test("signed S3 requests carry a well-formed SigV4 authorization", () => {
  const config = { region: "us-east-1", bucket: "bucket", accessKeyId: "AKID", secretAccessKey: "secret", publicBaseUrl: null };
  const signed = signRequest(config, "PUT", "books/b 1/a.png", "e3b0c442", { "Content-Type": "image/png" }, new Date("2026-01-02T03:04:05Z"));
  assert.equal(signed.url, "https://bucket.s3.us-east-1.amazonaws.com/books/b%201/a.png");
  assert.equal(signed.headers["x-amz-date"], "20260102T030405Z");
  assert.match(
    signed.headers.authorization!,
    /^AWS4-HMAC-SHA256 Credential=AKID\/20260102\/us-east-1\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
  );
});
