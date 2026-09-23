import assert from "node:assert/strict";
import { test } from "node:test";
import type { Shot } from "../../lib/story-types.ts";
import { applyShotRules, nameIndex } from "./shots.mts";
import type { Entity } from "../types.mts";

function entity(entityId: string, type: Entity["type"], canonicalName: string, aliases: string[] = []): Entity {
  return {
    entityId,
    type,
    canonicalName,
    aliases: aliases.map((name) => ({ name, firstSeq: 0, paragraphIds: [] })),
    importance: "supporting",
    firstSeq: 0,
    lastSeq: 0,
    description: "",
    parentLocationId: null,
    facts: [],
    fills: [],
    states: [],
    reveals: [],
    relationships: [],
    mentions: [],
    mentionCount: 1,
    profile: null,
  };
}

const entities = [
  entity("ch_john", "character", "John"),
  entity("ch_narrator", "character", "The narrator"),
  entity("loc_garden", "location", "Garden"),
  entity("loc_nursery", "location", "Atrocious Nursery", ["nursery"]),
];

function draft(description: string, extra: Partial<Omit<Shot, "reuseKey">> = {}): Omit<Shot, "reuseKey"> {
  return {
    shotId: "m1_s1",
    description,
    entityStates: [],
    framing: "medium",
    mood: "uneasy",
    timeOfDay: "interior",
    locationId: null,
    locationStateId: null,
    ...extra,
  };
}

const options = {
  index: nameIndex(entities),
  momentLocationId: "loc_nursery",
  narratorEntityId: "ch_narrator",
  stateOf: () => null,
  reuseKeyOf: (shot: Omit<Shot, "reuseKey">) =>
    `${shot.locationId ?? "-"}|${shot.entityStates.map((state) => state.entityId).sort().join(",")}|${shot.framing}`,
};

test("a shot that describes the narrator casts the narrator", () => {
  const [shot] = applyShotRules([draft("A close shot of the narrator sitting by the window, looking out.")], options);
  assert.deepEqual(
    shot!.entityStates.map((state) => state.entityId),
    ["ch_narrator"],
  );
});

test("a named character in the description joins the cast", () => {
  const [shot] = applyShotRules([draft("John stands with arms crossed while the narrator looks away.")], options);
  assert.deepEqual(shot!.entityStates.map((state) => state.entityId).sort(), ["ch_john", "ch_narrator"]);
});

test("a shot takes the place its own description names", () => {
  const shots = applyShotRules(
    [draft("A wide view of the Garden with grape arbors and long shaded paths."), draft("Back inside the nursery, the wallpaper peels.")],
    options,
  );
  assert.equal(shots[0]!.locationId, "loc_garden");
  assert.equal(shots[1]!.locationId, "loc_nursery");
});

test("a shot without a place falls back to the Moment's location", () => {
  const [shot] = applyShotRules([draft("Hands pulling at the paper, close enough to see the pattern.")], options);
  assert.equal(shot!.locationId, "loc_nursery");
});

test("shots all framed alike become a sequence from wide to close", () => {
  const shots = applyShotRules([draft("First."), draft("Second."), draft("Third.")], options);
  assert.deepEqual(
    shots.map((shot) => shot.framing),
    ["wide", "medium", "close"],
  );
});

test("framings the model varied are left alone", () => {
  const shots = applyShotRules([draft("First.", { framing: "wide" }), draft("Second.", { framing: "insert" })], options);
  assert.deepEqual(
    shots.map((shot) => shot.framing),
    ["wide", "insert"],
  );
});

test("the reuse key follows the shot's own place", () => {
  const shots = applyShotRules([draft("A wide view of the Garden."), draft("Inside the nursery again.")], options);
  assert.notEqual(shots[0]!.reuseKey, shots[1]!.reuseKey);
});
