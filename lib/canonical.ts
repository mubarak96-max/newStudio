/**
 * Canonical text construction and addressing.
 *
 * Pure functions only — no Firebase, no React. `persistCanonicalSource` in
 * `book-pipeline.ts` writes what this module builds; the worker reads the same
 * bytes back from `canonical.json` in Storage.
 *
 * Two invariants this module exists to protect:
 *  1. No character of extracted text is dropped (see `computeCoverage`).
 *  2. A paragraph's Firestore chunk is a pure function of its `seq`, so any seq
 *     range resolves to document IDs without a query (see `chunkIdsForSeqRange`).
 */

import type { ExtractedPage, ExtractionResult } from './pdf-extract';

export type ParagraphKind =
  | 'body'
  | 'heading'
  | 'frontmatter'
  | 'backmatter'
  | 'note'
  | 'caption'
  | 'break';

export type Paragraph = {
  id: string;
  seq: number;
  page: number;
  chapterId: string;
  text: string;
  hash: string;
  kind: ParagraphKind;
  isStory: boolean;
};

export type Coverage = {
  /** Characters in the raw extraction after normalization. */
  sourceChars: number;
  /** Characters across all canonical paragraphs after the same normalization. */
  canonicalChars: number;
  /** sourceChars - canonicalChars. Zero means nothing was dropped. */
  missingChars: number;
  ratio: number;
  ok: boolean;
};

export const PARAGRAPHS_PER_CHUNK = 20;

/**
 * A single paragraph longer than this is split. 20 x 20k keeps a full chunk
 * document near 400KB, well inside Firestore's 1MB ceiling — which is what
 * makes the fixed 20-paragraph chunk size safe to rely on.
 */
export const MAX_PARAGRAPH_CHARS = 20_000;
export const MAX_CHUNK_BYTES = 900_000;

/** Extraction fails above this drift; any non-zero drift is still recorded. */
export const COVERAGE_FAIL_RATIO = 0.005;

/**
 * Whitespace and hyphens are stripped from both sides of the coverage
 * comparison so paragraph re-wrapping and de-hyphenation across page breaks are
 * invisible to it, while genuinely dropped text is not.
 */
export function normalizeForCoverage(text: string): string {
  return text.replace(/[\s­‐-―-]+/g, '');
}

export function stableTextHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function chunkIndexForSeq(seq: number): number {
  return Math.floor(seq / PARAGRAPHS_PER_CHUNK);
}

export function chunkDocId(sourceId: string, canonicalHash: string, chunkIndex: number): string {
  return `${sourceId}__${canonicalHash.slice(0, 12)}__c${String(chunkIndex).padStart(5, '0')}`;
}

/** Document IDs covering an inclusive seq range. No query, no composite index. */
export function chunkIdsForSeqRange(
  sourceId: string,
  canonicalHash: string,
  seqStart: number,
  seqEnd: number
): string[] {
  const low = Math.max(0, Math.min(seqStart, seqEnd));
  const high = Math.max(0, Math.max(seqStart, seqEnd));
  const ids: string[] = [];
  for (let index = chunkIndexForSeq(low); index <= chunkIndexForSeq(high); index += 1) {
    ids.push(chunkDocId(sourceId, canonicalHash, index));
  }
  return ids;
}

const TERMINATED = /["'”’»)\]]*[.!?…:;]["'”’»)\]]*$/;
const HYPHENATED = /[­‐-―-]$/;

function splitBlankLineBlocks(pageText: string): string[] {
  return pageText
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

type WrapProfile = { full: number; threshold: number };

/**
 * Detects hard-wrapped body text and the width it wraps at.
 *
 * Many PDFs carry no blank line between paragraphs — each line simply ends at
 * the measure. Without this, an entire page collapses into one "paragraph" and
 * every paragraphId points at a page rather than a paragraph.
 *
 * Measured across the whole book, not per page: the measure is a property of
 * the typeset block and is constant, while a single page of verse or dialogue
 * has too few full-width lines to recognise on its own.
 */
function analyzeWrap(pages: ExtractedPage[]): WrapProfile | null {
  const lengths = pages
    .flatMap((page) => page.text.replace(/\r\n?/g, '\n').split('\n'))
    .map((line) => line.trim().length)
    .filter((length) => length > 0)
    .sort((left, right) => left - right);
  if (lengths.length < 6) return null;
  const full = lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * 0.9))]!;
  if (full < 40 || full > 140) return null;
  // Wrapped text clusters at the measure; one-paragraph-per-line text does not.
  const nearFull = lengths.filter((length) => length >= full * 0.9).length;
  if (nearFull / lengths.length < 0.35) return null;
  return { full, threshold: full * 0.8 };
}

function startsDialogue(line: string): boolean {
  return /^["“‘'']/.test(line);
}

function joinWrappedLine(current: string, next: string): string {
  if (HYPHENATED.test(current)) return `${current.slice(0, -1)}${next}`;
  return `${current} ${next}`;
}

/**
 * Splits one blank-line block into paragraphs using the wrap measure: a line
 * noticeably shorter than the measure is the last line of a paragraph. A block
 * that is already a single paragraph yields itself, because only its final line
 * is short.
 */
function unwrapBlock(block: string, profile: WrapProfile | null): string[] {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!profile || lines.length === 0) return block ? [block] : [];

  const paragraphs: string[] = [];
  let current = '';
  const push = () => {
    if (current) paragraphs.push(current);
    current = '';
  };
  for (const line of lines) {
    // A numeral or heading line is its own unit, never the tail of the
    // paragraph above it — otherwise a chapter marker sitting under a
    // full-width line is swallowed and the division is lost.
    if (current && (isBareNumber(line) || looksLikeHeading(line))) push();
    else if (current && startsDialogue(line) && TERMINATED.test(current)) push();
    current = current ? joinWrappedLine(current, line) : line;
    if (line.length < profile.threshold) push();
  }
  push();
  return paragraphs;
}

function splitBlocks(pageText: string, profile: WrapProfile | null): string[] {
  return splitBlankLineBlocks(pageText).flatMap((block) => unwrapBlock(block, profile));
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const ROMAN = '[ivxlcdm]+';
const WORD_NUMBER =
  'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty';
const CHAPTER_OPENER = new RegExp(
  `^(chapter|part|book|canto|act|section)\\s+(\\d{1,4}|${ROMAN}|${WORD_NUMBER})\\b`,
  'i'
);
const STANDALONE_DIVISION =
  /^(prologue|epilogue|introduction|foreword|preface|afterword|appendix|interlude)\b[\s.:—-]*$/i;

/**
 * Only an explicit division opener starts a new chapter. The all-caps heuristic
 * below is deliberately not used for this: epigraphs, letters and shouted
 * dialogue trip it, and every false chapter is a hard window boundary the
 * understanding pass cannot read across.
 */
export function looksLikeChapterHeading(text: string): boolean {
  const line = compact(text);
  if (!line || line.length > 80) return false;
  return CHAPTER_OPENER.test(line) || STANDALONE_DIVISION.test(line);
}

/** Cosmetic heading detection — sets `kind`, never splits a chapter. */
export function looksLikeHeading(text: string): boolean {
  const line = compact(text);
  if (!line || line.length > 120) return false;
  if (looksLikeChapterHeading(line)) return true;
  const letters = line.replace(/[^a-z]/gi, '');
  return letters.length >= 3 && line === line.toUpperCase() && !/[.!?]$/.test(line);
}

const BARE_NUMBER = /^[\s.\-–—[\]()]*(\d{1,4}|[ivxlcdm]{1,8})[\s.\-–—[\]()]*$/i;

function isBareNumber(text: string): boolean {
  return BARE_NUMBER.test(text);
}

const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

function decodeBareNumber(text: string): number | null {
  const token = text.match(BARE_NUMBER)?.[1];
  if (!token) return null;
  if (/^\d+$/.test(token)) return Number(token);
  const digits = [...token.toLowerCase()].map((character) => ROMAN_VALUES[character] ?? 0);
  let total = 0;
  for (const [index, value] of digits.entries()) {
    total += value < (digits[index + 1] ?? 0) ? -value : value;
  }
  return total > 0 ? total : null;
}

/**
 * Tells chapter markers apart from page folios when both are bare numbers.
 *
 * Many books number divisions with nothing but a numeral ("I", "II", …). Folios
 * appear on nearly every page; division markers appear on a few and count up
 * from one. Without this the folio rule swallows every chapter marker and the
 * whole book lands in a single chapter.
 */
function findDivisionMarkers(pages: ExtractedPage[], profile: WrapProfile | null): Set<string> {
  const markers: { key: string; value: number }[] = [];
  for (const page of pages) {
    for (const block of splitBlocks(page.text, profile)) {
      if (!isBareNumber(block)) continue;
      const value = decodeBareNumber(block);
      if (value !== null) markers.push({ key: compact(block).toLowerCase(), value });
    }
  }
  // Folios land on nearly every page; division markers on a small fraction of them.
  if (markers.length < 2 || markers.length > Math.max(3, pages.length / 2)) return new Set();
  if (markers[0]!.value > 2) return new Set();
  for (let index = 1; index < markers.length; index += 1) {
    if (markers[index]!.value <= markers[index - 1]!.value) return new Set();
  }
  return new Set(markers.map((marker) => marker.key));
}

/**
 * Running heads and folios repeat on most pages. They stay in the canonical
 * stream (nothing is discarded) but are marked non-story, and they do not
 * terminate a paragraph running across the page break beneath them.
 *
 * Keys have their digits collapsed so a head carrying the page number
 * ("Page 5 of 71") still matches itself across pages.
 */
function runningHeadKey(text: string): string {
  return compact(text).toLowerCase().replace(/\d+/g, '#');
}

function findRunningHeads(pages: ExtractedPage[], profile: WrapProfile | null): Set<string> {
  const counts = new Map<string, number>();
  let considered = 0;
  for (const page of pages) {
    const blocks = splitBlocks(page.text, profile);
    if (blocks.length === 0) continue;
    considered += 1;
    for (const edge of new Set([blocks[0]!, blocks.at(-1)!])) {
      const key = runningHeadKey(edge);
      if (!key || key.length > 80) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.floor(considered * 0.25));
  const heads = new Set<string>();
  for (const [key, count] of counts) {
    if (count >= threshold) heads.add(key);
  }
  return heads;
}


/** True when `next` continues `previous`, interrupted only by a page break. */
export function continuesAcrossPage(previous: string, next: string): boolean {
  const tail = previous.trimEnd();
  const head = next.trimStart();
  if (!tail || !head) return false;
  if (looksLikeHeading(tail) || looksLikeHeading(head)) return false;
  if (HYPHENATED.test(tail)) return true;
  if (TERMINATED.test(tail)) return false;
  // An unterminated tail plus a capitalised head is ambiguous; leave it split.
  return /^[\p{Ll}\p{Pd},;'"“‘(]/u.test(head);
}

export function joinAcrossPage(previous: string, next: string): string {
  const tail = previous.trimEnd();
  const head = next.trimStart();
  if (HYPHENATED.test(tail)) return `${tail.slice(0, -1)}${head}`;
  return `${tail} ${head}`;
}

function splitLongBlock(text: string): string[] {
  if (text.length <= MAX_PARAGRAPH_CHARS) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > MAX_PARAGRAPH_CHARS) {
    const candidate = rest.slice(0, MAX_PARAGRAPH_CHARS);
    const splitAt = Math.max(candidate.lastIndexOf('\n'), candidate.lastIndexOf(' '));
    const end = splitAt > MAX_PARAGRAPH_CHARS * 0.6 ? splitAt : MAX_PARAGRAPH_CHARS;
    parts.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) parts.push(rest);
  return parts;
}

type Draft = { text: string; page: number; kind: ParagraphKind; division: boolean };

/**
 * Builds the canonical paragraph stream from the raw page extraction.
 *
 * Paragraphs are stitched across page boundaries: splitting per page turns one
 * paragraph into two whenever it spans a page, which breaks every verbatim
 * quote straddling the seam.
 */
export function buildCanonicalParagraphs(result: ExtractionResult): Paragraph[] {
  const profile = analyzeWrap(result.pages);
  const divisions = findDivisionMarkers(result.pages, profile);
  const runningHeads = findRunningHeads(result.pages, profile);
  const drafts: Draft[] = [];
  let pending: Draft | null = null;
  let held: Draft[] = [];

  const flush = (): void => {
    if (pending) drafts.push(pending);
    pending = null;
    if (held.length > 0) {
      drafts.push(...held);
      held = [];
    }
  };

  for (const page of result.pages) {
    let firstBody = true;
    for (const block of splitBlocks(page.text, profile)) {
      const division = divisions.has(compact(block).toLowerCase());
      if (!division && (isBareNumber(block) || runningHeads.has(runningHeadKey(block)))) {
        const note: Draft = { text: block, page: page.pageNumber, kind: 'note', division: false };
        if (pending) held.push(note);
        else drafts.push(note);
        continue;
      }
      const open: Draft | null = pending;
      if (firstBody && !division && open && continuesAcrossPage(open.text, block)) {
        open.text = joinAcrossPage(open.text, block);
        firstBody = false;
        continue;
      }
      firstBody = false;
      flush();
      pending = {
        text: block,
        page: page.pageNumber,
        kind: division || looksLikeHeading(block) ? 'heading' : 'body',
        division,
      };
    }
  }
  flush();

  const paragraphs: Paragraph[] = [];
  let chapterNumber = 1;
  let chapterId = `chapter_${String(chapterNumber).padStart(4, '0')}`;

  for (const draft of drafts) {
    const startsChapter =
      draft.kind !== 'note' && (draft.division || looksLikeChapterHeading(draft.text));
    if (startsChapter && paragraphs.length > 0) {
      chapterNumber += 1;
      chapterId = `chapter_${String(chapterNumber).padStart(4, '0')}`;
    }
    for (const text of splitLongBlock(draft.text)) {
      const seq = paragraphs.length;
      paragraphs.push({
        id: `p${String(seq).padStart(6, '0')}`,
        seq,
        page: draft.page,
        chapterId,
        text,
        hash: stableTextHash(text),
        kind: draft.kind,
        isStory: draft.kind === 'body',
      });
    }
  }
  return paragraphs;
}

/**
 * Chunk N always holds seq N*20 .. N*20+19. Never size chunks by bytes: an
 * early break makes the index unpredictable and forces a two-field range query
 * that Firestore cannot serve.
 */
export function buildChunks(paragraphs: Paragraph[]): Paragraph[][] {
  const chunks: Paragraph[][] = [];
  for (const paragraph of paragraphs) {
    const index = chunkIndexForSeq(paragraph.seq);
    (chunks[index] ??= []).push(paragraph);
  }
  chunks.forEach((chunk, index) => {
    if (!chunk) throw new Error(`Canonical chunk ${index} is empty; seq numbering is not dense.`);
    const bytes = new TextEncoder().encode(JSON.stringify(chunk)).byteLength;
    if (bytes > MAX_CHUNK_BYTES) {
      throw new Error(
        `Canonical chunk ${index} is ${bytes} bytes, over the ${MAX_CHUNK_BYTES} byte limit.`
      );
    }
  });
  return chunks;
}

export function computeCoverage(result: ExtractionResult, paragraphs: Paragraph[]): Coverage {
  const source = normalizeForCoverage(result.pages.map((page) => page.text).join(''));
  const canonical = normalizeForCoverage(paragraphs.map((paragraph) => paragraph.text).join(''));
  const missingChars = source.length - canonical.length;
  return {
    sourceChars: source.length,
    canonicalChars: canonical.length,
    missingChars,
    ratio: source.length === 0 ? 1 : canonical.length / source.length,
    ok: missingChars === 0,
  };
}

/** Concatenated paragraph text — the payload the worker re-hashes to prove integrity. */
export function canonicalTextOf(paragraphs: Paragraph[]): string {
  return paragraphs.map((paragraph) => paragraph.text).join('\n');
}
