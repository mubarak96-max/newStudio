import assert from "node:assert/strict";
import { test } from "node:test";
import type { Beat, CompositionPlan, Episode, Moment } from "../../lib/story-types.ts";
import { buildEpisodeManifest, dwellFor } from "./manifest.mts";

const lineage = { sourceId: "s", canonicalHash: "h" };

function beat(id: string, compositionId: string | null, text: Beat["text"]): Beat {
  return {
    id,
    order: 1,
    seq: 1,
    type: "quote",
    text,
    shotId: "m1_s1",
    compositionId,
    camera: {
      move: "push-in",
      from: { x: 0, y: 0, zoom: 1, rotate: 0 },
      to: { x: 0, y: 0, zoom: 1.15, rotate: 0 },
      durationMs: 4_000,
      easing: "easeInOut",
      focusEntityId: null,
      rationale: "",
    },
    transitionIn: { type: "cut", durationMs: 0 },
    inspectables: [{ entityId: "ch_john", hotspot: { x: 0.2, y: 0.1, w: 0.5, h: 0.8 } }],
    autoAdvanceMs: null,
    representations: [],
    previousBeatId: null,
    nextBeatId: null,
  };
}

function moment(beats: Beat[]): Moment {
  return {
    schemaVersion: 1,
    ...lineage,
    momentId: "m1",
    episodeId: "ep_01",
    order: 1,
    title: "In the nursery",
    seqStart: 0,
    seqEnd: 3,
    sourceParagraphIds: ["p000000", "p000001"],
    wordCount: 100,
    summary: "",
    startState: "",
    endState: "",
    storyTime: 0,
    characters: [],
    locationId: "loc_nursery",
    locationStateId: null,
    objectIds: [],
    eventIds: [],
    exactTextSelections: [],
    dialogue: [],
    commentary: [],
    visualPlan: { shots: [] },
    inspectableEntities: [],
    compositionIds: [],
    readingBeats: beats,
    beatCoverage: {
      storyParagraphs: 2,
      representedByModel: 2,
      representedByFallback: [],
      words: 100,
      wordsShownVerbatim: 60,
      shownAsText: 1,
      visualOnly: 1,
      warnings: [],
    },
    status: "planned",
    warnings: [],
  };
}

const episode = {
  schemaVersion: 1,
  ...lineage,
  episodeId: "ep_01",
  order: 1,
  title: "The Atrocious Nursery",
  summary: "",
  seqStart: 0,
  seqEnd: 3,
  chapterIds: ["chapter_0001"],
  paragraphCount: 4,
  storyParagraphCount: 2,
  wordCount: 100,
  storyPlan: null,
  stageStatus: { planned: "done", moments: "done" },
  momentCount: 1,
  warnings: [],
} as Episode;

function composition(mode: "layered" | "flat"): CompositionPlan {
  const layer = (layerId: string, role: "background" | "foreground", zOrder: number) => ({
    layerId,
    role,
    entityId: null,
    entityIds: [],
    url: `https://cdn.example/${layerId}.webp`,
    s3Key: `k/${layerId}`,
    width: 768,
    height: 1376,
    zOrder,
    depthRange: [0, 0.35] as [number, number],
    opaqueFraction: 1,
    bbox: { x: 0, y: 0, w: 1, h: 1 },
    sourceVersionId: "v1",
    scale: 1.1,
    parallax: role === "background" ? 0.61 : 0.97,
  });
  return {
    schemaVersion: 1,
    ...lineage,
    compositionId: "comp_1",
    reuseKey: "k1",
    originEpisodeId: "ep_01",
    usedIn: [],
    shotSnapshot: {
      shotId: "m1_s1",
      description: "The narrator sits by the window.",
      entityStates: [],
      framing: "medium",
      mood: "uneasy",
      timeOfDay: "interior",
      locationId: "loc_nursery",
      locationStateId: null,
      reuseKey: "k1",
    },
    locationId: "loc_nursery",
    entityStatesUsed: [],
    referenceEntityIds: [],
    visualProfileVersion: 1,
    prompt: "",
    negativePrompt: "",
    layers: [],
    stage25d: {
      cameraEnvelope: { maxPanX: 0, maxPanY: 0, maxZoom: 1, maxTilt: 0 },
      plannedSafeCamera: { maxPanX: 0.05, maxPanY: 0.05, maxZoom: 1.2, maxTilt: 0 },
      backgroundOverscan: { x: 0.05, y: 0.05 },
      backgroundCanvas: { width: 1.1, height: 1.1 },
      parallax: {},
    },
    responsive: { focalPoint: [0.5, 0.45], aspect: "9:16" },
    status: "planned",
    assembly: {
      status: "composed",
      mode,
      layers: mode === "layered" ? [layer("background", "background", 0), layer("fg", "foreground", 1)] : [layer("master", "background", 0)],
      safeCamera: { maxPanX: 0.08, maxPanY: 0.08, maxZoom: 1.2, maxTilt: 0 },
      issues: [],
      fingerprint: "f",
      composedAt: "2026-09-23T00:00:00.000Z",
    },
  } as unknown as CompositionPlan;
}

const nameOf = (entityId: string) => (entityId === "ch_john" ? "John" : entityId);
const quote = { quote: { paragraphId: "p000000", start: 0, end: 20, text: "I am sitting here." } };

test("a layered scene publishes its layers and a flat fallback image", () => {
  const compositions = new Map([["comp_1", composition("layered")]]);
  const { manifest, issues } = buildEpisodeManifest("book", episode, [moment([beat("b1", "comp_1", quote)])], compositions, nameOf, "v");
  assert.deepEqual(issues, []);
  assert.equal(manifest.scenes.length, 1);
  assert.equal(manifest.scenes[0]!.mode, "layered");
  assert.equal(manifest.scenes[0]!.layers.length, 2);
  assert.equal(manifest.scenes[0]!.flatImageUrl, "https://cdn.example/background.webp");
  assert.equal(manifest.beats[0]!.hotspots[0]!.name, "John");
});

test("a composition that could not be layered still publishes flat", () => {
  const compositions = new Map([["comp_1", composition("flat")]]);
  const { manifest } = buildEpisodeManifest("book", episode, [moment([beat("b1", "comp_1", quote)])], compositions, nameOf, "v");
  assert.equal(manifest.scenes[0]!.mode, "flat");
  assert.equal(manifest.scenes[0]!.layers.length, 1);
  assert.equal(manifest.scenes[0]!.flatImageUrl, "https://cdn.example/master.webp");
});

test("a Beat with no scene publishes as text, and one with neither is dropped", () => {
  const { manifest, issues } = buildEpisodeManifest(
    "book",
    episode,
    [moment([beat("b1", null, quote), beat("b2", null, {})])],
    new Map(),
    nameOf,
    "v",
  );
  assert.equal(manifest.beats.length, 1);
  assert.equal(manifest.beats[0]!.beatId, "b1");
  assert.equal(issues.filter((issue) => issue.reason === "no picture and no words").length, 1);
});

test("the package reports how much of the book the reader is not read", () => {
  const compositions = new Map([["comp_1", composition("layered")]]);
  const { manifest } = buildEpisodeManifest("book", episode, [moment([beat("b1", "comp_1", quote)])], compositions, nameOf, "v");
  assert.deepEqual(manifest.abridgement, { storyParagraphs: 2, shownAsText: 1, visualOnly: 1 });
});

test("dwell never cuts the camera move short", () => {
  const slow = beat("b1", "comp_1", quote);
  slow.camera.durationMs = 12_000;
  assert.equal(dwellFor(slow), 12_000);
});
