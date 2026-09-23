import assert from "node:assert/strict";
import { test } from "node:test";
import { enforceIntegrity, firstPersonRatio } from "./integrity.mts";
import { emptyLedger, type Annotation, type Entity, type Ledger, type Paragraph } from "./types.mts";

function entity(entityId: string, type: Entity["type"], canonicalName: string, extra: Partial<Entity> = {}): Entity {
  return {
    entityId,
    type,
    canonicalName,
    aliases: [],
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
    ...extra,
  };
}

function annotation(paragraphId: string, extra: Partial<Annotation> = {}): Annotation {
  return {
    paragraphId,
    seq: Number(paragraphId.slice(1)),
    chapterId: "chapter_0001",
    summary: "",
    mode: "narration",
    presentEntityIds: [],
    mentionedEntityIds: [],
    speakerEntityIds: [],
    locationId: null,
    timeMarker: null,
    mood: "",
    visualCue: "",
    eventIds: [],
    stub: false,
    ...extra,
  };
}

function paragraph(id: string, text: string, isStory = true): Paragraph {
  return { id, seq: Number(id.slice(1)), page: 1, chapterId: "chapter_0001", text, hash: "0", kind: "body", isStory };
}

function ledgerWith(entities: Entity[], annotations: Annotation[] = []): Ledger {
  const ledger = emptyLedger("src_1", "hash_1");
  ledger.entities = entities;
  ledger.annotations = Object.fromEntries(annotations.map((item) => [item.paragraphId, item]));
  return ledger;
}

const thirdPerson = [paragraph("p000000", "Mr Jones locked the hen-houses for the night.")];

test("the author is removed from the cast", () => {
  const ledger = ledgerWith(
    [entity("ch_orwell", "character", "George Orwell"), entity("ch_jones", "character", "Mr Jones"), entity("loc_farm", "location", "Manor Farm")],
    [annotation("p000000", { presentEntityIds: ["ch_orwell", "ch_jones"], locationId: "loc_farm" })],
  );
  const report = enforceIntegrity(ledger, thirdPerson, { title: "Animal Farm", author: "George Orwell" });
  assert.deepEqual(report.removedEntityIds, ["ch_orwell"]);
  assert.deepEqual(ledger.annotations.p000000!.presentEntityIds, ["ch_jones"]);
  assert.deepEqual(report.failures, []);
});

test("a concept used as a place becomes a location", () => {
  const ledger = ledgerWith(
    [entity("con_animal_farm", "concept", "Animal Farm"), entity("loc_barn", "location", "Big Barn")],
    [annotation("p000000", { locationId: "con_animal_farm" })],
  );
  const report = enforceIntegrity(ledger, thirdPerson, { title: "", author: "" });
  assert.deepEqual(report.retypedLocationIds, ["con_animal_farm"]);
  assert.equal(ledger.entities.find((item) => item.entityId === "con_animal_farm")?.type, "location");
});

test("duplicates with the same name merge into the better-attested one", () => {
  const ledger = ledgerWith(
    [
      entity("obj_windmill", "object", "Windmill", { mentionCount: 12 }),
      entity("con_windmill", "concept", "Windmill", { mentionCount: 3 }),
      entity("loc_barn", "location", "Big Barn"),
    ],
    [annotation("p000000", { mentionedEntityIds: ["con_windmill"], locationId: "loc_barn" })],
  );
  const report = enforceIntegrity(ledger, thirdPerson, { title: "", author: "" });
  assert.deepEqual(report.merges[0], {
    keepEntityId: "obj_windmill",
    mergedEntityIds: ["con_windmill"],
    reason: "same canonical name",
  });
  assert.deepEqual(ledger.annotations.p000000!.mentionedEntityIds, ["obj_windmill"]);
  assert.equal(ledger.entities.some((item) => item.entityId === "con_windmill"), false);
});

test("a one-off subset group folds into the group it names", () => {
  const ledger = ledgerWith(
    [
      entity("grp_sheep", "group", "The Sheep", { mentionCount: 9 }),
      entity("grp_sheep_confessors", "group", "The Sheep Confessors", { mentionCount: 1 }),
      entity("loc_barn", "location", "Big Barn"),
    ],
    [annotation("p000000", { presentEntityIds: ["grp_sheep_confessors"], locationId: "loc_barn" })],
  );
  const report = enforceIntegrity(ledger, thirdPerson, { title: "", author: "" });
  assert.equal(report.merges.some((merge) => merge.reason === "subset of a larger group"), true);
  assert.deepEqual(ledger.annotations.p000000!.presentEntityIds, ["grp_sheep"]);
});

test("claims with no paragraph behind them are stripped", () => {
  const ledger = ledgerWith([
    entity("ch_john", "character", "John", {
      facts: [
        { key: "job", value: "physician", quote: "", certainty: "stated", claimedBy: null, firstSeq: 0, verified: true, paragraphIds: ["p000000"] },
        { key: "mood", value: "kind", quote: "", certainty: "implied", claimedBy: null, firstSeq: 0, verified: false, paragraphIds: [] },
      ],
    }),
    entity("loc_house", "location", "The House"),
  ]);
  const report = enforceIntegrity(ledger, thirdPerson, { title: "", author: "" });
  assert.equal(report.strippedClaims, 1);
  assert.equal(ledger.entities[0]!.facts.length, 1);
});

test("a first-person book without a narrator fails the stage", () => {
  const firstPerson = [
    paragraph("p000000", "I am sitting by the window in this atrocious nursery."),
    paragraph("p000001", "My brother is also a physician, and I am told to rest."),
  ];
  assert.ok(firstPersonRatio(firstPerson) >= 0.15);
  const ledger = ledgerWith([entity("ch_john", "character", "John"), entity("loc_nursery", "location", "Nursery")]);
  const report = enforceIntegrity(ledger, firstPerson, { title: "", author: "" });
  assert.equal(report.narratorEntityId, null);
  assert.match(report.failures[0] ?? "", /first person/);
});

test("a named narrator present through the first-person text satisfies the check", () => {
  const firstPerson = [
    paragraph("p000000", "I am sitting by the window in this atrocious nursery."),
    paragraph("p000001", "My brother is also a physician, and I am told to rest."),
  ];
  const ledger = ledgerWith(
    [entity("ch_jane", "character", "Jane"), entity("loc_nursery", "location", "Nursery")],
    [
      annotation("p000000", { presentEntityIds: ["ch_jane"] }),
      annotation("p000001", { presentEntityIds: ["ch_jane"] }),
    ],
  );
  const report = enforceIntegrity(ledger, firstPerson, { title: "", author: "" });
  assert.equal(report.narratorEntityId, "ch_jane");
  assert.deepEqual(report.failures, []);
});

test("a third-person book needs no narrator", () => {
  const ledger = ledgerWith([entity("ch_jones", "character", "Mr Jones"), entity("loc_farm", "location", "Manor Farm")]);
  const report = enforceIntegrity(ledger, thirdPerson, { title: "", author: "" });
  assert.deepEqual(report.failures, []);
  assert.equal(report.narratorEntityId, null);
});
