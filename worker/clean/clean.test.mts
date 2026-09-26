import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCleanParagraphs, structuralKind, type CleanedParagraph } from "./build.mts";
import { rejoinParagraphs } from "./rejoin.mts";
import { cleanlinessOf, furniturePhrases, isFurniture, judgeCleaned, letters, singleLetterWords } from "./rules.mts";
import type { Paragraph } from "../types.mts";

const noFurniture = new Set<string>();

function accepted(raw: string, cleaned: string, furniture = noFurniture): string {
  const verdict = judgeCleaned(raw, cleaned, furniture);
  assert.ok(verdict.accepted, `expected accepted, got ${verdict.accepted ? "" : verdict.reason}`);
  return verdict.accepted ? verdict.text : "";
}

/** A refused change keeps the raw words: the result says what the page says. */
function refused(raw: string, cleaned: string, furniture = noFurniture): void {
  const verdict = judgeCleaned(raw, cleaned, furniture);
  if (!verdict.accepted) return;
  assert.equal(letters(verdict.text), letters(raw), `expected the raw words back for "${cleaned}", got "${verdict.text}"`);
  assert.ok(verdict.refused.length > 0);
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

test("deletes scan debris but never the author's punctuation or a real word", () => {
  assert.equal(accepted("the same thing. •", "the same thing."), "the same thing.");
  assert.equal(accepted("write a word. • • • • * •", "write a word."), "write a word.");
  assert.equal(accepted("through the wars. H But I don't mind", "through the wars. But I don't mind"), "through the wars. But I don't mind");
  refused("my mind - ) per haps", "my mind ) perhaps");
  refused("there is a man", "there is man");
});

test("rejoins a word the scanner broke around a stray mark", () => {
  assert.equal(accepted("angry with the imperti j nence of it", "angry with the impertinence of it"), "angry with the impertinence of it");
  assert.equal(accepted("I never saw such raV .lges as", "I never saw such ravages as"), "I never saw such ravages as");
});

test("a refused change keeps its raw words while the paragraph's other repairs land", () => {
  const verdict = judgeCleaned("John is a physician, and perltaps he laughs at me", "John is a doctor, and perhaps he laughs at me", noFurniture);
  assert.ok(verdict.accepted);
  assert.equal(verdict.accepted && verdict.text, "John is a physician, and perhaps he laughs at me");
  assert.equal(verdict.accepted && verdict.refused.length, 1);
});

test("single-letter words are learnt from the book, so a stray letter is not one", () => {
  const paragraphs = Array.from({ length: 10 }, (_, index) => ({
    id: `p${index}`,
    seq: index,
    page: 1,
    chapterId: "chapter_0001",
    text: "I saw a bird and I said so.",
    hash: "0",
    kind: "body",
    isStory: true,
  }));
  const found = singleLetterWords(paragraphs);
  assert.ok(found.has("i") && found.has("a"));
  assert.ok(!found.has("h"));
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
  const result = buildCleanParagraphs(
    raw.map((paragraph) => ({ ...paragraph, joinedIds: [paragraph.id] })),
    cleaned,
  );
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

function body(id: string, text: string, kind = "body"): Paragraph {
  return { id, seq: Number(id.slice(1)), page: 1, chapterId: "chapter_0001", text, hash: "0", kind, isStory: kind === "body" };
}

test("sentences cut into one paragraph per line are rejoined without losing a character", () => {
  const scanned = [
    body("p0", "It is very seldom"),
    body("p1", "that mere ordi"),
    body("p2", "nary people like us"),
    body("p3", "secure ancestral halls for the summer."),
    body("p4", "A colonial man"),
    body("p5", "sion, a hereditary estate."),
    body("p6", "a kind of \"debased Roma-"),
    body("p7", "nesque\" pattern."),
  ];
  const joined = rejoinParagraphs(scanned, () => false);
  assert.deepEqual(
    joined.map((paragraph) => paragraph.text),
    [
      "It is very seldom that mere ordi nary people like us secure ancestral halls for the summer.",
      "A colonial man sion, a hereditary estate.",
      "a kind of \"debased Romanesque\" pattern.",
    ],
  );
  assert.deepEqual(joined[0]!.joinedIds, ["p0", "p1", "p2", "p3"]);
  assert.equal(letters(joined.map((paragraph) => paragraph.text).join("")), letters(scanned.map((paragraph) => paragraph.text).join("")));
});

test("the author's paragraph breaks stay: a closed sentence, a capital, a dash", () => {
  const scanned = [
    body("p0", "So I take phosphates."),
    body("p1", "and tonics, and journeys"),
    body("p2", "But what is one to do?"),
    body("p3", "I sometimes fancy that if I had less opposition—"),
    body("p4", "but John says the very worst thing"),
    body("p5", "a great relief to my mind -"),
    body("p6", "per haps that is one reason"),
    body("p7", "* * * * * *"),
    body("p8", "t"),
  ];
  assert.equal(rejoinParagraphs(scanned, () => false).length, 8);
});

test("page furniture between the halves of a sentence moves after the joined paragraph", () => {
  const scanned = [body("p0", "Out of one window I can see the"), body("p1", "THE YELLOW WALL-PAPER. 649", "note"), body("p2", "garden, those arbors.")];
  const joined = rejoinParagraphs(scanned, (paragraph) => paragraph.kind === "note");
  assert.deepEqual(
    joined.map((paragraph) => paragraph.id),
    ["p0", "p1"],
  );
  assert.equal(joined[0]!.text, "Out of one window I can see the garden, those arbors.");
});

test("section breaks and stray letters are never story paragraphs", () => {
  assert.equal(structuralKind("* * * * * *", "body", false), "break");
  assert.equal(structuralKind("* * * ¥ * *", "body", false), "break");
  assert.equal(structuralKind("t", "body", false), "note");
  assert.equal(structuralKind("No.", "body", false), "body");
  assert.equal(structuralKind("II", "heading", true), "heading");
});
