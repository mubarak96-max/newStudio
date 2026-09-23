import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWeights,
  chapterAlignedSpans,
  reattachEmpty,
  rebalance,
  snapToNearest,
  tileFromStarts,
  validateTiling,
  weightOf,
} from "./ranges.mts";
import { locateQuote, quotedSpans } from "./text.mts";

test("tileFromStarts covers the range exactly once whatever the proposal", () => {
  const spans = tileFromStarts([9, 3, 3, 42, -1, 20], 0, 20);
  assert.deepEqual(spans, [
    { seqStart: 0, seqEnd: 2 },
    { seqStart: 3, seqEnd: 8 },
    { seqStart: 9, seqEnd: 19 },
    { seqStart: 20, seqEnd: 20 },
  ]);
  assert.equal(validateTiling(spans, 0, 20).ok, true);
});

test("validateTiling reports gaps and overlaps", () => {
  const report = validateTiling(
    [
      { seqStart: 0, seqEnd: 4 },
      { seqStart: 4, seqEnd: 6 },
      { seqStart: 8, seqEnd: 9 },
    ],
    0,
    9,
  );
  assert.equal(report.ok, false);
  assert.deepEqual(report.duplicated, [4]);
  assert.deepEqual(report.missing, [7]);
});

test("rebalance merges fragments and splits oversized spans at cut points", () => {
  const weights = buildWeights(Array.from({ length: 40 }, () => 100));
  const spans = rebalance(tileFromStarts([1, 2, 30], 0, 39), weights, {
    minWords: 300,
    maxWords: 1_500,
    targetWords: 1_000,
    cutPoints: [10, 20, 25],
  });
  assert.equal(validateTiling(spans, 0, 39).ok, true);
  for (const span of spans) {
    const words = weightOf(weights, span);
    assert.ok(words >= 300 && words <= 1_500, `span ${span.seqStart}-${span.seqEnd} has ${words} words`);
  }
});

test("rebalance folds word-less runs into a neighbour", () => {
  const weights = buildWeights([0, 0, 0, 200, 200, 200, 0, 0]);
  const spans = rebalance(tileFromStarts([3, 6], 0, 7), weights, {
    minWords: 1,
    maxWords: 5_000,
    targetWords: 1_000,
    cutPoints: [],
  });
  assert.deepEqual(spans, [{ seqStart: 0, seqEnd: 7 }]);
});

test("reattachEmpty folds leading front matter into the first span", () => {
  const weights = buildWeights([0, 0, 0, 50, 50, 50]);
  assert.deepEqual(reattachEmpty(tileFromStarts([3, 5], 0, 5), weights), [
    { seqStart: 0, seqEnd: 4 },
    { seqStart: 5, seqEnd: 5 },
  ]);
});

test("snapToNearest picks the closest boundary", () => {
  assert.equal(snapToNearest(12, [0, 10, 20]), 10);
  assert.equal(snapToNearest(16, [0, 10, 20]), 20);
});

test("locateQuote returns offsets into the original text", () => {
  const text = "She said, “Don’t   go,” and turned — slowly.";
  const located = locateQuote(text, `"don't go," and turned - slowly`);
  assert.ok(located);
  assert.equal(text.slice(located.start, located.end), "Don’t   go,” and turned — slowly");
  assert.equal(locateQuote(text, "nothing like this"), null);
});

test("quotedSpans finds every spoken line with exact offsets", () => {
  const text = "“Come in,” she said. “The kettle’s on.” He nodded. “Thanks";
  const spans = quotedSpans(text);
  assert.deepEqual(
    spans.map((span) => span.text),
    ["Come in,", "The kettle’s on.", "Thanks"],
  );
  for (const span of spans) assert.equal(text.slice(span.start, span.end), span.text);
  assert.deepEqual(quotedSpans("The so-called “experts” left."), []);
});

test("quotedSpans handles single-quote dialogue without breaking on apostrophes", () => {
  const text = "‘I don’t know,’ said Harry. ‘Ask Ron’s mum.’";
  assert.deepEqual(
    quotedSpans(text).map((span) => span.text),
    ["I don’t know,", "Ask Ron’s mum."],
  );
});

test("episodes never cross a chapter boundary", () => {
  // Four chapters of 10 seqs each; every seq carries 100 words.
  const weights = buildWeights(Array.from({ length: 40 }, () => 100));
  const chapters = tileFromStarts([10, 20, 30], 0, 39);
  const spans = chapterAlignedSpans(chapters, weights, {
    minWords: 600,
    maxWords: 2_000,
    targetWords: 1_000,
    cutPoints: [5, 10, 15, 20, 25, 30, 35],
  });
  // Each chapter carries 1,000 words, above the minimum, so each is its own episode.
  assert.deepEqual(spans, [
    { seqStart: 0, seqEnd: 9 },
    { seqStart: 10, seqEnd: 19 },
    { seqStart: 20, seqEnd: 29 },
    { seqStart: 30, seqEnd: 39 },
  ]);
  assert.equal(validateTiling(spans, 0, 39).ok, true);
});

test("chapters too short for an episode merge with the next one", () => {
  const weights = buildWeights(Array.from({ length: 40 }, () => 100));
  const chapters = tileFromStarts([10, 20, 30], 0, 39);
  const spans = chapterAlignedSpans(chapters, weights, {
    minWords: 1_500,
    maxWords: 4_000,
    targetWords: 2_000,
    cutPoints: [10, 20, 30],
  });
  assert.deepEqual(spans, [
    { seqStart: 0, seqEnd: 19 },
    { seqStart: 20, seqEnd: 39 },
  ]);
});

test("a chapter too long for one episode is split inside itself", () => {
  const weights = buildWeights(Array.from({ length: 20 }, () => 400));
  const chapters = tileFromStarts([10], 0, 19);
  const spans = chapterAlignedSpans(chapters, weights, {
    minWords: 1_500,
    maxWords: 3_000,
    targetWords: 2_000,
    cutPoints: [5, 10, 15],
  });
  assert.deepEqual(spans, [
    { seqStart: 0, seqEnd: 4 },
    { seqStart: 5, seqEnd: 9 },
    { seqStart: 10, seqEnd: 14 },
    { seqStart: 15, seqEnd: 19 },
  ]);
});

test("front matter joins the first real chapter instead of becoming an episode", () => {
  const weights = buildWeights([0, 0, ...Array.from({ length: 18 }, () => 200)]);
  const chapters = tileFromStarts([2, 11], 0, 19);
  const spans = chapterAlignedSpans(chapters, weights, {
    minWords: 800,
    maxWords: 3_000,
    targetWords: 1_800,
    cutPoints: [2, 11],
  });
  assert.equal(spans[0]!.seqStart, 0);
  assert.equal(spans.length, 2);
  assert.equal(validateTiling(spans, 0, 19).ok, true);
});
