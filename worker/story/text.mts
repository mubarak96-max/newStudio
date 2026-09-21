/**
 * Exact-text helpers. Offsets are UTF-16 code-unit indexes into the canonical
 * paragraph string, start inclusive and end exclusive, so
 * `text.slice(start, end)` always reproduces the stored selection.
 */

export type Located = { start: number; end: number };

function normalizeChar(char: string): string {
  if (/[‘’‚‛′`´]/.test(char)) return "'";
  if (/[“”„‟″]/.test(char)) return '"';
  if (/[‐-―­]/.test(char)) return "-";
  return char.toLowerCase();
}

/** Normalized text plus, for each normalized character, its index in the original. */
function normalizeWithMap(text: string): { value: string; map: number[] } {
  let value = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (/\s/.test(char)) {
      pendingSpace = value.length > 0;
      continue;
    }
    if (pendingSpace) {
      value += " ";
      map.push(index);
      pendingSpace = false;
    }
    value += normalizeChar(char);
    map.push(index);
  }
  return { value, map };
}

/**
 * Models copy quotes with straightened punctuation, changed case or collapsed
 * whitespace. The exact match is tried first; otherwise the quote is found in
 * normalized form and mapped back to the original offsets, so the stored text
 * is always the book's own characters.
 */
export function locateQuote(text: string, quote: string): Located | null {
  const trimmed = quote.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  if (!trimmed) return null;
  const exact = text.indexOf(trimmed);
  if (exact >= 0) return { start: exact, end: exact + trimmed.length };
  const haystack = normalizeWithMap(text);
  const needle = normalizeWithMap(trimmed).value;
  const found = haystack.value.indexOf(needle);
  if (found < 0) return null;
  const start = haystack.map[found]!;
  const end = haystack.map[found + needle.length - 1]! + 1;
  return { start, end };
}

export type QuotedSpan = Located & { text: string };

const doubleQuotePattern = /“([^”]*)(”|$)|"([^"]*)("|$)/g;
const singleQuotePattern = /(?<=^|[\s([—–-])‘(.+?)(’(?=$|[\s.,;:!?)\]—–-])|$)/gu;

/**
 * Every quoted span of a paragraph, found deterministically so dialogue is
 * complete and exact by construction; the model only attributes speakers.
 * An unclosed quote runs to the end of the paragraph, which is how prose
 * marks speech that continues into the next paragraph.
 */
export function quotedSpans(text: string): QuotedSpan[] {
  const pattern = /[“"]/.test(text) ? doubleQuotePattern : singleQuotePattern;
  const spans: QuotedSpan[] = [];
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const inner = match[1] ?? match[3] ?? "";
    const leading = inner.length - inner.trimStart().length;
    const content = inner.trim();
    const closed = Boolean(match[2] || match[4]);
    // A closed, lowercase single word is a scare quote or a term, not speech.
    const scareQuote = closed && !/\s/.test(content) && !/[.!?,]$/.test(content) && !/^\p{Lu}/u.test(content);
    if (!content || scareQuote) continue;
    const start = match.index! + 1 + leading;
    spans.push({ start, end: start + content.length, text: content });
  }
  return spans;
}
