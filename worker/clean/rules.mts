/**
 * The guards that make model-written cleaning safe.
 *
 * The cleaning stage may repair scan damage and delete page furniture; it may
 * never reword the book. Nothing the model returns is trusted: every cleaned
 * paragraph is aligned word by word against the raw one here. Each difference
 * is judged on its own: a change that cannot be explained as scan repair keeps
 * the raw words in its place, and the paragraph's other repairs still land.
 */

import type { Paragraph } from "../types.mts";

export type CleanDecision =
  | { accepted: true; text: string; changedWords: number; removedWords: number; refused: string[] }
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
 * Scan debris that carries no word of the book: a bullet, asterisk or stray
 * mark ("•", "¥", "~"), or a lone letter the book never uses as a word.
 * Ordinary punctuation is the author's and never counts.
 */
function isDebris(word: string, singleLetterWords: Set<string>): boolean {
  if (!hasWord(word)) return !/[\p{Pd}\p{Ps}\p{Pe}\p{Pi}\p{Pf}&%$£€'".,;:!?…]/u.test(word);
  const bare = word.replace(/[^\p{L}\p{N}]/gu, "");
  return /^\p{L}$/u.test(bare) && !singleLetterWords.has(bare.toLowerCase());
}

const hasWord = (token: string) => /[\p{L}\p{N}]/u.test(token);

/** Punctuation-only tokens compare with quote and dash styles normalised, nothing more. */
function samePunctuation(left: string, right: string): boolean {
  const normal = (token: string) =>
    token.replace(/[‘’‚‛`´]/g, "'").replace(/[“”„‟]/g, '"').replace(/[‐-―-]+/g, "-");
  return normal(left) === normal(right);
}

/** Where the two word lists agree again after a difference: offsets into each, or null. */
function resync(from: string[], to: string[], i: number, j: number): [number, number] | null {
  const same = (fi: number, tj: number) =>
    fi < from.length && tj < to.length && letters(from[fi]!) !== "" && letters(from[fi]!) === letters(to[tj]!);
  for (let total = 1; total <= 8; total += 1) {
    for (let a = 0; a <= Math.min(total, 4); a += 1) {
      const b = total - a;
      if (b > 4) continue;
      // Two agreeing words, so a common word like "the" cannot anchor a wrong alignment.
      const next = i + a + 1 >= from.length || j + b + 1 >= to.length || isRepair(from[i + a + 1]!, to[j + b + 1]!);
      if (same(i + a, j + b) && next) return [a, b];
    }
  }
  return null;
}

/**
 * Single-letter words of this book ("a", "I", or "y" and "e" in other
 * languages): they are frequent, where a letter left by the scanner is rare.
 */
export function singleLetterWords(paragraphs: Paragraph[]): Set<string> {
  const counts = new Map<string, number>();
  let total = 0;
  for (const paragraph of paragraphs) {
    for (const word of words(paragraph.text)) {
      total += 1;
      const bare = word.replace(/[^\p{L}]/gu, "").toLowerCase();
      if (bare.length === 1) counts.set(bare, (counts.get(bare) ?? 0) + 1);
    }
  }
  const threshold = Math.max(5, total / 1000);
  return new Set(Array.from(counts).filter(([, count]) => count >= threshold).map(([letter]) => letter));
}

/**
 * Builds the cleaned paragraph from the model's text, difference by
 * difference. Accepted: a scan repair, a word rejoined or split at a line
 * break, a deletion of known page furniture or of scan debris. Anything else —
 * inserted, reordered or rewritten wording — keeps the raw words in its place,
 * so every word of the result comes from the page.
 */
export function judgeCleaned(
  raw: string,
  cleaned: string,
  furniture: Set<string>,
  singleLetters: Set<string> = new Set(["a", "i", "o"]),
): CleanDecision {
  const trimmed = cleaned.replace(/\s+/g, " ").trim();
  if (!trimmed) return { accepted: false, reason: "empty" };
  const from = words(raw);
  const to = words(trimmed);
  const out: string[] = [];
  const refused: string[] = [];
  let i = 0;
  let j = 0;
  let changedWords = 0;
  let removedWords = 0;
  const debrisAt = (index: number) => isDebris(from[index]!, singleLetters);
  const damagedAt = (token: string) =>
    isDebris(token, singleLetters) || /^[^\p{L}\p{N}"'“‘(]/u.test(token) || /\p{Ll}\p{Lu}/u.test(token);

  while (i < from.length && j < to.length) {
    // Tokens without letters are the author's punctuation or scan debris; the
    // letter comparisons below would treat every one of them as equal.
    if (!hasWord(from[i]!)) {
      if (!hasWord(to[j]!) && samePunctuation(from[i]!, to[j]!)) {
        out.push(to[j]!);
        j += 1;
      } else if (debrisAt(i)) {
        removedWords += 1;
      } else {
        refused.push(`kept "${from[i]}"`);
        out.push(from[i]!);
        if (!hasWord(to[j]!)) j += 1;
      }
      i += 1;
      continue;
    }
    if (!hasWord(to[j]!)) {
      refused.push(`added "${to[j]}"`);
      j += 1;
      continue;
    }
    if (letters(from[i]!) === letters(to[j]!)) {
      out.push(to[j]!);
      i += 1;
      j += 1;
      continue;
    }
    const merge = [2, 3, 4].find((count) => i + count <= from.length && joined(from, i, count) === letters(to[j]!));
    if (merge) {
      out.push(to[j]!);
      changedWords += 1;
      i += merge;
      j += 1;
      continue;
    }
    const split = [2, 3].find((count) => j + count <= to.length && joined(to, j, count) === letters(from[i]!));
    if (split) {
      out.push(...to.slice(j, j + split));
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
    // Debris is deleted only when the words after it line up again.
    if (debrisAt(i) && i + 1 < from.length && letters(from[i + 1]!) === letters(to[j]!)) {
      removedWords += 1;
      i += 1;
      continue;
    }
    if (isRepair(from[i]!, to[j]!)) {
      out.push(to[j]!);
      changedWords += 1;
      i += 1;
      j += 1;
      continue;
    }
    // A word the scanner broke around a stray mark: "imperti j nence", "raV .lges".
    // Only a visibly damaged run qualifies, so "a man" can never become "man".
    const damagedMerge = [2, 3, 4].find(
      (count) =>
        i + count <= from.length &&
        from.slice(i, i + count).some(damagedAt) &&
        isRepair(joined(from, i, count), to[j]!),
    );
    if (damagedMerge) {
      out.push(to[j]!);
      changedWords += 1;
      i += damagedMerge;
      j += 1;
      continue;
    }
    const agree = resync(from, to, i, j);
    const [skipRaw, skipCleaned] = agree ?? [from.length - i, to.length - j];
    refused.push(`"${from.slice(i, i + skipRaw).join(" ")}" became "${to.slice(j, j + skipCleaned).join(" ")}"`);
    out.push(...from.slice(i, i + skipRaw));
    i += skipRaw;
    j += skipCleaned;
  }

  while (i < from.length) {
    const run = furnitureRun(from, i, furniture);
    if (run > 0) {
      removedWords += run;
      i += run;
    } else if (debrisAt(i)) {
      removedWords += 1;
      i += 1;
    } else {
      // Raw words the cleaned text left out are restored, never lost.
      refused.push(`dropped "${from[i]}"`);
      out.push(from[i]!);
      i += 1;
    }
  }
  for (; j < to.length; j += 1) refused.push(`added "${to[j]}"`);
  const budget = Math.max(2, Math.ceil(from.length * 0.25));
  if (changedWords > budget) return { accepted: false, reason: `${changedWords} words rewritten` };
  const text = out.join(" ");
  if (!text) return { accepted: false, reason: "empty" };
  return { accepted: true, text, changedWords, removedWords, refused };
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
