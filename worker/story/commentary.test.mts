import assert from "node:assert/strict";
import { test } from "node:test";
import { commentaryIssues, type NoteCheck } from "./commentary.mts";

const check = (text: string, extra: Partial<NoteCheck> = {}) =>
  commentaryIssues({ text, kind: "clarify", citedText: "", newEntityNames: [], ...extra });

test("notes about the text, analysis and scan damage never reach the reader", () => {
  assert.ok(check("The narrator is confined in a nursery she finds unpleasant.").length > 0);
  assert.ok(check("The fragmented text suggests she is beginning to reflect.").length > 0);
  assert.ok(check("John and she are described as ordinary people, highlighting class.").length > 0);
  assert.ok(check("The wallpaper reflects her disturbed mental state.").length > 0);
});

test("a plain explanation of an unfamiliar word passes", () => {
  assert.deepEqual(check("A draught is a current of cold air coming in through a gap.", { citedText: "he said what I felt was a draught" }), []);
});

test("context notes only introduce someone the reader meets here", () => {
  const john = /(?<![\p{L}\p{N}])John(?![\p{L}\p{N}])/u;
  assert.deepEqual(check("John is her husband, a physician.", { kind: "context", newEntityNames: [john] }), []);
  assert.ok(check("John is her husband, a physician.", { kind: "context" }).length > 0);
});

test("a note that retells the cited paragraph is withheld", () => {
  const citedText = "I lie here on this great immovable bed and follow that pattern about by the hour, pretending to sleep.";
  assert.ok(check("She lies on the immovable bed following the pattern for hours, pretending sleep.", { kind: "scene", citedText }).length > 0);
});
