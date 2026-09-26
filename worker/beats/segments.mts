/**
 * The Beat text is the book itself, cut rather than chosen: every paragraph of
 * a Moment is read in full, in order, as subtitle-sized pieces. The model
 * only stages the pieces (shot and camera); it can no longer leave half the
 * book unread or replace a passage with a note about it.
 */

import type { Commentary, Shot, TextSelection } from "../../lib/story-types.ts";
import { splitSentences } from "./camera.mts";

type Range = { start: number; end: number };

const wordsIn = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** A sentence longer than a subtitle is cut at its clause breaks (comma, semicolon, colon, dash). */
function clauses(text: string, range: Range, maxWords: number): Range[] {
  const slice = text.slice(range.start, range.end);
  if (wordsIn(slice) <= maxWords) return [range];
  const cuts = Array.from(slice.matchAll(/[,;:—–]\s+|\s[-–—]\s+/g), (match) => match.index! + match[0].length);
  const pieces: Range[] = [];
  let from = 0;
  while (wordsIn(slice.slice(from)) > maxWords) {
    const fitting = cuts.filter((cut) => cut > from && wordsIn(slice.slice(from, cut)) <= maxWords);
    const cut = fitting.at(-1) ?? cuts.find((candidate) => candidate > from);
    if (cut === undefined) break;
    pieces.push({ start: range.start + from, end: range.start + from + slice.slice(from, cut).trimEnd().length });
    from = cut;
  }
  pieces.push({ start: range.start + from, end: range.end });
  return pieces;
}

/** Every paragraph cut at sentence ends into pieces of at most `maxWords`, each an exact substring. */
export function segmentParagraphs(paragraphs: { id: string; text: string }[], maxWords: number): TextSelection[] {
  return paragraphs.flatMap((paragraph) =>
    splitSentences(paragraph.text, maxWords)
      .flatMap((range) => clauses(paragraph.text, range, maxWords))
      .map((range) => ({ paragraphId: paragraph.id, ...range, text: paragraph.text.slice(range.start, range.end) }))
      .filter((segment) => segment.text.trim()),
  );
}

/** The shot a segment falls under when shots simply follow the text in order. */
export function shotInOrder(index: number, count: number, shots: Shot[]): Shot | null {
  if (shots.length === 0) return null;
  return shots[Math.min(shots.length - 1, Math.floor((index * shots.length) / Math.max(1, count)))]!;
}

/**
 * Puts each note beside the words it explains: on the first segment of the
 * earliest paragraph it cites, or the next segment with room. A note with no
 * citation has nowhere true to stand and is left out.
 */
export function placeCommentary(
  segments: TextSelection[],
  notes: Commentary[],
  seqOf: (paragraphId: string) => number,
  perSegment = 2,
): Commentary[][] {
  const placed = segments.map((): Commentary[] => []);
  const seen = new Set<string>();
  for (const note of notes) {
    const key = note.text.trim().toLowerCase();
    if (!key || seen.has(key) || note.groundedIn.length === 0) continue;
    seen.add(key);
    const first = [...note.groundedIn].sort((left, right) => seqOf(left) - seqOf(right))[0];
    const at = segments.findIndex((segment) => segment.paragraphId === first);
    if (at < 0) continue;
    const host = placed.findIndex((list, index) => index >= at && list.length < perSegment);
    if (host >= 0) placed[host]!.push(note);
  }
  return placed;
}
