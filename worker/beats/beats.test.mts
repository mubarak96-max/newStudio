import assert from "node:assert/strict";
import { test } from "node:test";
import type { EntityVisualPlan, Moment, VisualProfile } from "../../lib/story-types.ts";
import { buildCompositionPlans, figureLayers, forecastOf, placeFigure } from "../visuals/compositions.mts";
import { assignDepth, planStage25d } from "../visuals/stage25d.mts";
import { cameraMoves, durationFor, posesFor, splitSentences } from "./camera.mts";

test("every camera move keeps zoom at or above the fitted view", () => {
  for (const move of cameraMoves) {
    const { from, to } = posesFor(move);
    assert.ok(from.zoom >= 1 && to.zoom >= 1, move);
    assert.ok(Math.abs(to.x) <= 0.1 && Math.abs(to.y) <= 0.1, move);
  }
});

test("a continuing move starts where the previous Beat ended", () => {
  const first = posesFor("push-in");
  const second = posesFor("drift", first.to);
  assert.deepEqual(second.from, first.to);
});

test("durations stay in a comfortable range", () => {
  assert.equal(durationFor(0), 4_000);
  assert.equal(durationFor(10_000), 18_000);
});

test("splitSentences keeps every word and yields exact substrings", () => {
  const text =
    "The first sentence is here. A second one follows it closely! Then a third asks something? And a fourth closes the passage for good.";
  const pieces = splitSentences(text, 12);
  assert.ok(pieces.length > 1);
  assert.equal(pieces.map((piece) => text.slice(piece.start, piece.end)).join(" "), text);
  for (const piece of pieces) assert.ok(text.slice(piece.start, piece.end).split(/\s+/).length <= 12);
});

const profile: VisualProfile = {
  version: 1,
  artStyle: "Ink and wash",
  medium: "watercolour",
  palette: ["ochre"],
  lens: "35mm",
  lighting: "soft",
  texture: "grain",
  eraDetails: "1940s",
  negativeRules: ["text"],
};

function momentWith(momentId: string, reuseKey: string, beatIds: string[]): Moment {
  const shot = {
    shotId: `${momentId}_s1`,
    description: "Boxer hauls stone",
    entityStates: [{ entityId: "ch_boxer", stateId: null }],
    framing: "wide",
    mood: "grim",
    timeOfDay: "day",
    reuseKey,
  };
  return {
    momentId,
    locationId: "loc_quarry",
    locationStateId: null,
    visualPlan: { shots: [shot] },
    readingBeats: beatIds.map((id, index) => ({
      id,
      shotId: shot.shotId,
      compositionId: `comp_${reuseKey}`,
      camera: posesFor(index === 0 ? "pan-left" : "push-in"),
    })),
  } as unknown as Moment;
}

test("foreground depth bands stack without overlap and a close shot meshes its nearest subject", () => {
  const layer = (layerId: string, role: "background" | "foreground", zOrder: number) => ({
    layerId,
    role,
    entityId: null,
    prompt: "",
    transparent: role === "foreground",
    zOrder,
    depthRange: [0, 1] as [number, number],
    renderMode: "plane" as const,
    mesh: null,
  });
  const layers = assignDepth([layer("background", "background", 0), layer("a", "foreground", 1), layer("b", "foreground", 2)], "close");
  for (const item of layers) assert.ok(item.depthRange[0] <= item.depthRange[1]);
  assert.ok(layers[1]!.depthRange[1] <= layers[2]!.depthRange[0]);
  assert.equal(layers[0]!.renderMode, "plane");
  assert.equal(layers[2]!.renderMode, "depthMesh");
  assert.equal(layers[1]!.renderMode, "plane");
  const held = planStage25d({ maxPanX: 0, maxPanY: 0, maxZoom: 1, maxTilt: 0 }, layers);
  assert.ok(held.plannedSafeCamera.maxPanX >= 0.05, "a still composition still allows a gentle drift");
});

test("figures are spread across the frame and the nearest is drawn largest", () => {
  const solo = placeFigure(0, 1, "medium");
  assert.equal(solo.centerX, 0.5);
  const left = placeFigure(0, 3, "wide");
  const right = placeFigure(2, 3, "wide");
  assert.ok(left.centerX < 0.5 && right.centerX > 0.5);
  assert.ok(right.heightFraction > left.heightFraction);
  assert.ok(placeFigure(0, 1, "close").heightFraction > placeFigure(0, 1, "wide").heightFraction);
});

test("several figures share one cast layer; one figure keeps its own layer", () => {
  const plans = new Map<string, EntityVisualPlan>();
  const entityOf = (id: string) => ({ name: id === "ch_a" ? "Ann" : "Ben", type: "character" });
  const shot = { description: "Ann talks to Ben", framing: "medium" };
  const cast = figureLayers(
    [
      { entityId: "ch_a", stateId: null },
      { entityId: "ch_b", stateId: null },
    ],
    shot,
    profile,
    plans,
    entityOf,
  );
  assert.equal(cast.length, 1);
  assert.equal(cast[0]!.layerId, "fg_cast");
  assert.deepEqual(cast[0]!.entityIds, ["ch_a", "ch_b"]);
  assert.match(cast[0]!.prompt, /each exactly once/);
  const solo = figureLayers([{ entityId: "ch_a", stateId: null }], shot, profile, plans, entityOf);
  assert.equal(solo[0]!.layerId, "fg_ch_a");
  assert.match(solo[0]!.prompt, /Draw only Ann/);
});

test("Beats sharing a reuseKey share one composition", () => {
  const plans = new Map<string, EntityVisualPlan>([
    ["ch_boxer", { entityId: "ch_boxer", spec: "A huge cart-horse", stateVariants: {} } as unknown as EntityVisualPlan],
  ]);
  const entityOf = (id: string) => ({ name: id, type: id.startsWith("loc_") ? "location" : "character" });
  const compositions = buildCompositionPlans(
    [
      { episodeId: "ep_01", moment: momentWith("ep_01_m01", "k1", ["b1", "b2"]) },
      { episodeId: "ep_02", moment: momentWith("ep_02_m01", "k1", ["b3"]) },
      { episodeId: "ep_02", moment: momentWith("ep_02_m02", "k2", ["b4"]) },
    ],
    plans,
    entityOf,
    profile,
    { sourceId: "s", canonicalHash: "h" },
  );
  assert.equal(compositions.length, 2);
  assert.equal(compositions[0]!.usedIn.length, 3);
  assert.equal(compositions[0]!.originEpisodeId, "ep_01");
  assert.deepEqual(
    compositions[0]!.layers.map((layer) => layer.role),
    ["background", "foreground"],
  );
  assert.ok(compositions[0]!.prompt.includes("A huge cart-horse"));
  const [background, foreground] = compositions[0]!.layers;
  assert.ok(background!.depthRange[1] < foreground!.depthRange[0], "background sits behind the foreground");
  assert.equal(background!.renderMode, "depthMesh", "wide shots give the background relief");
  const stage = compositions[0]!.stage25d;
  assert.equal(stage.cameraEnvelope.maxPanX, 0.04);
  assert.ok(stage.plannedSafeCamera.maxPanX > stage.cameraEnvelope.maxPanX);
  assert.ok(stage.plannedSafeCamera.maxZoom >= stage.cameraEnvelope.maxZoom);
  assert.ok(stage.backgroundOverscan.x > 0 && stage.backgroundCanvas.width > 1);
  assert.ok(stage.parallax.background! < stage.parallax[foreground!.layerId]!, "near layers move more");
  assert.match(background!.prompt, /beyond the left and right edges/);
  const forecast = forecastOf(compositions, [...plans.values()], 0.05);
  assert.equal(forecast.shotsPlanned, 4);
  assert.equal(forecast.reuseRate, 0.5);
  assert.equal(forecast.imagesToGenerate, 1 + 4);
});
