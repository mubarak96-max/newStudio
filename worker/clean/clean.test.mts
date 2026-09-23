import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCleanParagraphs, type CleanedParagraph } from "./build.mts";
import { cleanlinessOf, furniturePhrases, isFurniture, judgeCleaned } from "./rules.mts";
import type { Paragraph } from "../types.mts";

const noFurniture = new Set<string>();

function accepted(raw: string, cleaned: string, furniture = noFurniture): string {
  const verdict = judgeCleaned(raw, cleaned, furniture);
  assert.ok(verdict.accepted, `expected accepted, got ${verdict.accepted ? "" : verdict.reason}`);
  return verdict.accepted ? verdict.text : "";
}

function refused(raw: string, cleaned: string, furniture = noFurniture): void {
  assert.equal(judgeCleaned(raw, cleaned, furniture).accepted, false, `expected refusal for "${cleaned}"`);
}

test("accepts scan repairs inside words", () => {
  assert.equal(accepted("John is a physician, and perltaps", "John is a physician, and perhaps"), "John is a physician, and perhaps");
  assert.equal(accepted("only very num::!rous.", "only very numerous."), "only very numerous.");
  assert.equal(accepted("Cltarlotte Perkins", "Charlotte Perkins"), "Charlotte Perkins");
});

test("accepts words rejoined or split at a line break", () => {
  assert.equal(accepted("in my condi tion if", "in my condition if"), "in my condition if");
  assert.equal(accepted("Your ex erc ise depends", "Your exercise depends"), "Your exercise depends");
  assert.equal(accepted("We have been here two·weeks", "We have been here two weeks"), "We have been here two weeks");
});

test("accepts punctuation and spacing normalisation", () => {
  assert.equal(accepted('He said  "why"', 'He said “why”'), "He said “why”");
});

test("refuses rewording, additions and deletions", () => {
  refused("I did write for a while", "I wrote for a while");
  refused("But what is one to do?", "But what is one to do? Nothing.");
  refused("There comes John, and I must put this away", "There comes John");
  refused("It is a dull yet lurid orange", "The paper is a dull yet lurid orange");
});

test("refuses a wholesale rewrite even when every word is close", () => {
  refused("a b c d e f g h", "x y z w v u t s");
});

test("removes page furniture only where it is known furniture", () => {
  const furniture = new Set(["animalfarmbygeorgeorwell"]);
  assert.equal(
    accepted("Comrades, Animal Farm by George Orwell I have something to say", "Comrades, I have something to say", furniture),
    "Comrades, I have something to say",
  );
  refused("Comrades, Animal Farm by George Orwell I have something to say", "Comrades, I have something to say");
});

test("furniture is found from repetition and from the book's own title", () => {
  const pages = [1, 2, 3, 4, 5, 6];
  const paragraphs: Paragraph[] = pages.map((page, index) => ({
    id: `p${index}`,
    seq: index,
    page,
    chapterId: "chapter_0001",
    text: "Animal Farm 12",
    hash: "0",
    kind: "note",
    isStory: false,
  }));
  const furniture = furniturePhrases(paragraphs, "Animal Farm", "George Orwell");
  assert.ok(furniture.has("animalfarm"));
  assert.ok(furniture.has("animalfarmbygeorgeorwell"));
  assert.ok(isFurniture(paragraphs[0]!, furniture));
});

test("cleanliness falls with repairs and leftover damage", () => {
  assert.equal(cleanlinessOf("a clean sentence of plain words", 0), 1);
  assert.ok(cleanlinessOf("a sentence with num::!rous damage left", 0) < 1);
  assert.ok(cleanlinessOf("a repaired sentence of plain words", 2) < 1);
});

test("dropped paragraphs are removed and chapters renumber densely", () => {
  const raw: Paragraph[] = [
    { id: "p000000", seq: 0, page: 1, chapterId: "chapter_0001", text: "CHAPTER I", hash: "0", kind: "heading", isStory: false },
    { id: "p000001", seq: 1, page: 1, chapterId: "chapter_0001", text: "Animal Farm", hash: "0", kind: "note", isStory: false },
    { id: "p000002", seq: 2, page: 1, chapterId: "chapter_0001", text: "Mr Jones locked the hen-houses.", hash: "0", kind: "body", isStory: true },
    { id: "p000003", seq: 3, page: 2, chapterId: "chapter_0001", text: "CHAPTER II", hash: "0", kind: "heading", isStory: false },
    { id: "p000004", seq: 4, page: 2, chapterId: "chapter_0001", text: "Old Major died.", hash: "0", kind: "body", isStory: true },
  ];
  const label = (text: string, kind: CleanedParagraph["kind"], extra: Partial<CleanedParagraph> = {}): CleanedParagraph => ({
    text,
    kind,
    isStory: kind === "body",
    chapterStart: false,
    drop: false,
    cleanliness: 1,
    ...extra,
  });
  const cleaned = new Map<string, CleanedParagraph>([
    ["p000000", label("CHAPTER I", "heading", { chapterStart: true })],
    ["p000001", label("Animal Farm", "note", { drop: true })],
    ["p000002", label("Mr Jones locked the hen-houses.", "body")],
    ["p000003", label("CHAPTER II", "heading", { chapterStart: true })],
    ["p000004", label("Old Major died.", "body")],
  ]);
  const result = buildCleanParagraphs(raw, cleaned);
  assert.deepEqual(
    result.map((paragraph) => [paragraph.id, paragraph.seq, paragraph.chapterId, paragraph.rawParagraphId]),
    [
      ["p000000", 0, "chapter_0001", "p000000"],
      ["p000001", 1, "chapter_0001", "p000002"],
      ["p000002", 2, "chapter_0002", "p000003"],
      ["p000003", 3, "chapter_0002", "p000004"],
    ],
  );
});
