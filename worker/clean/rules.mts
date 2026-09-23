/**
 * The guards that make model-written cleaning safe.
 *
 * The cleaning stage may repair scan damage and delete page furniture; it may
 * never reword the book. Nothing the model returns is trusted: every cleaned
 * paragraph is aligned word by word against the raw one here, and a paragraph
 * that cannot be explained as scan repair is discarded and the raw text kept.
 */

import type { Paragraph } from "../types.mts";

export type CleanDecision =
  | { accepted: true; text: string; changedWords: number; removedWords: number }
  | { accepted: false; reason: string };

/** Comparison form: case, punctuation and spacing carry no meaning for alignment. */
export function letters(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasJunk(value: string): boolean {
  return /[0-9]/.test(value);
}

function distance(left: string, right: string): number {
  if (left === right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j]!;
      previous[j] = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length]!;
}

/**
 * True when `cleaned` is a plausible scan repair of `raw`.
 *
 * A word carrying digits inside prose ("111", "num::!rous") is scan noise, so a
 * wider repair is allowed there than for a word that is already well formed.
 */
export function isRepair(raw: string, cleaned: string): boolean {
  const from = letters(raw);
  const to = letters(cleaned);
  if (from === to) return true;
  if (!from || !to) return false;
  if (hasJunk(from) && !hasJunk(to) && Math.abs(from.length - to.length) <= 2) return true;
  const allowed = Math.max(1, Math.floor(Math.max(from.length, to.length) / 4));
  return distance(from, to) <= allowed;
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function joined(list: string[], start: number, count: number): string {
  let value = "";
  for (let index = start; index < start + count; index += 1) value += letters(list[index] ?? "");
  return value;
}

/** How many words from `start` are covered by a furniture phrase, or 0. */
function furnitureRun(list: string[], start: number, furniture: Set<string>): number {
  for (let count = Math.min(12, list.length - start); count >= 1; count -= 1) {
    const key = joined(list, start, count);
    // Heads carrying the folio ("Animal Farm 12") are keyed without their digits.
    if (furniture.has(key) || furniture.has(key.replace(/[0-9]/g, ""))) return count;
  }
  return 0;
}

/**
 * Accepts the cleaned paragraph only when every difference is a scan repair, a
 * word rejoined or split at a line break, or a deletion of known page
 * furniture. Any inserted, reordered or rewritten wording rejects it.
 */
export function judgeCleaned(raw: string, cleaned: string, furniture: Set<string>): CleanDecision {
  const trimmed = cleaned.replace(/\s+/g, " ").trim();
  if (!trimmed) return { accepted: false, reason: "empty" };
  const from = words(raw);
  const to = words(trimmed);
  let i = 0;
  let j = 0;
  let changedWords = 0;
  let removedWords = 0;

  while (i < from.length && j < to.length) {
    if (letters(from[i]!) === letters(to[j]!)) {
      i += 1;
      j += 1;
      continue;
    }
    const merge = [2, 3, 4].find((count) => i + count <= from.length && joined(from, i, count) === letters(to[j]!));
    if (merge) {
      changedWords += 1;
      i += merge;
      j += 1;
      continue;
    }
    const split = [2, 3].find((count) => j + count <= to.length && joined(to, j, count) === letters(from[i]!));
    if (split) {
      changedWords += 1;
      i += 1;
      j += split;
      continue;
    }
    const run = furnitureRun(from, i, furniture);
    if (run > 0) {
      removedWords += run;
      i += run;
      continue;
    }
    if (isRepair(from[i]!, to[j]!)) {
      changedWords += 1;
      i += 1;
      j += 1;
      continue;
    }
    return { accepted: false, reason: `"${from[i]}" became "${to[j]}"` };
  }

  while (i < from.length) {
    const run = furnitureRun(from, i, furniture);
    if (run === 0) return { accepted: false, reason: `dropped "${from[i]}"` };
    removedWords += run;
    i += run;
  }
  if (j < to.length) return { accepted: false, reason: `added "${to[j]}"` };
  const budget = Math.max(2, Math.ceil(from.length * 0.25));
  if (changedWords > budget) return { accepted: false, reason: `${changedWords} words rewritten` };
  return { accepted: true, text: trimmed, changedWords, removedWords };
}

/** Scan damage still visible after cleaning: a prose word carrying digits or stray symbols. */
export function damagedWords(text: string): number {
  return words(text).filter((word) => {
    const bare = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!bare || /^[\p{L}'-]+$/u.test(bare) || /^[\p{N},.:/-]+$/u.test(bare)) return false;
    return true;
  }).length;
}

/** 1 when a paragraph reads clean, lower as repairs and leftover damage add up. */
export function cleanlinessOf(text: string, changedWords: number): number {
  const total = Math.max(1, words(text).length);
  const score = 1 - (changedWords + damagedWords(text) * 2) / total;
  return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000;
}

const shortLine = (text: string) => text.length <= 90;

/**
 * Page furniture: running heads, folios and bylines. A line that repeats on
 * many pages is furniture whatever it says, and the title and author line is
 * furniture even when the scan glued it into the middle of a paragraph — which
 * is how "Animal Farm by George Orwell" became a character.
 */
export function furniturePhrases(paragraphs: Paragraph[], title: string, author: string): Set<string> {
  const pages = new Set(paragraphs.map((paragraph) => paragraph.page)).size;
  const seen = new Map<string, Set<number>>();
  for (const paragraph of paragraphs) {
    if (paragraph.kind !== "note" && !shortLine(paragraph.text)) continue;
    const key = letters(paragraph.text.replace(/\d+/g, ""));
    if (!key || key.length < 4) continue;
    (seen.get(key) ?? seen.set(key, new Set()).get(key)!).add(paragraph.page);
  }
  const phrases = new Set<string>();
  const threshold = Math.max(3, Math.floor(pages * 0.2));
  for (const [key, onPages] of seen) {
    if (onPages.size >= threshold) phrases.add(key);
  }
  for (const phrase of [title && author ? `${title} by ${author}` : "", title, author]) {
    const key = letters(phrase);
    if (key.length >= 4) phrases.add(key);
  }
  return phrases;
}

/** True when a paragraph is nothing but page furniture and can be deleted outright. */
export function isFurniture(paragraph: Paragraph, furniture: Set<string>): boolean {
  const key = letters(paragraph.text.replace(/\d+/g, ""));
  if (!key) return /^[\s.\-–—[\]()]*\d{1,4}[\s.\-–—[\]()]*$/.test(paragraph.text);
  return shortLine(paragraph.text) && furniture.has(key);
}
