/**
 * Turns judged paragraph repairs into the cleaned canonical paragraph stream.
 *
 * Pure: cleaning never edits the raw source in place, and this module only
 * builds the new stream. `persist.mts` writes it as a second, immutable
 * canonical source, so the raw extraction stays exactly as it came off the page
 * and every repair can still be traced afterwards.
 */

import {
  looksLikeChapterHeading,
  stableTextHash,
  type Paragraph as CanonicalParagraph,
  type ParagraphKind,
} from "../../lib/canonical.ts";
import type { JoinedParagraph } from "./rejoin.mts";

export type CleanedParagraph = {
  text: string;
  kind: ParagraphKind;
  isStory: boolean;
  chapterStart: boolean;
  drop: boolean;
  cleanliness: number;
};

/** A cleaned paragraph keeps a pointer to the raw ones it came from; `rawParagraphId` is the first. */
export type CleanParagraph = CanonicalParagraph & { cleanliness: number; rawParagraphId: string; rawParagraphIds?: string[] };

export type Chapter = { id: string; title: string; seqStart: number; seqEnd: number };

/**
 * What the labels miss on a scanned page: a line with no letters ("* * *") is
 * a section break, and a lone letter or two with no sentence around it is
 * debris from a drop cap or an illustration, never a paragraph of the story.
 */
export function structuralKind(text: string, kind: ParagraphKind, chapterStart: boolean): ParagraphKind {
  if (!/[\p{L}\p{N}]/u.test(text)) return "break";
  const letterCount = text.replace(/[^\p{L}]/gu, "").length;
  if (kind === "body" && !chapterStart && letterCount <= 2 && !/[.!?…]/.test(text)) return "note";
  return kind;
}

export function buildCleanParagraphs(raw: JoinedParagraph[], cleaned: Map<string, CleanedParagraph>): CleanParagraph[] {
  const paragraphs: CleanParagraph[] = [];
  let chapterNumber = 0;
  let chapterId = "chapter_0001";
  for (const source of raw) {
    const result = cleaned.get(source.id);
    if (!result || result.drop) continue;
    const startsChapter = result.chapterStart || looksLikeChapterHeading(result.text);
    if (startsChapter && (paragraphs.length > 0 || chapterNumber === 0)) {
      chapterNumber += 1;
      chapterId = `chapter_${String(chapterNumber).padStart(4, "0")}`;
    }
    const seq = paragraphs.length;
    const kind = structuralKind(result.text, result.kind, startsChapter);
    paragraphs.push({
      id: `p${String(seq).padStart(6, "0")}`,
      seq,
      page: source.page,
      chapterId,
      text: result.text,
      hash: stableTextHash(result.text),
      kind,
      isStory: result.isStory && kind === "body",
      cleanliness: result.cleanliness,
      rawParagraphId: source.id,
      ...(source.joinedIds.length > 1 ? { rawParagraphIds: source.joinedIds } : {}),
    });
  }
  return paragraphs;
}

export function chaptersOf(paragraphs: CleanParagraph[]): Chapter[] {
  const ids = Array.from(new Set(paragraphs.map((paragraph) => paragraph.chapterId)));
  return ids.map((id) => {
    const own = paragraphs.filter((paragraph) => paragraph.chapterId === id);
    const heading = own.find((paragraph) => paragraph.kind === "heading");
    return {
      id,
      title: heading?.text ?? `Chapter ${Number(id.slice(-4))}`,
      seqStart: own[0]!.seq,
      seqEnd: own.at(-1)!.seq,
    };
  });
}

export function countWords(paragraphs: CleanParagraph[]): number {
  return paragraphs.reduce((total, paragraph) => total + paragraph.text.split(/\s+/).filter(Boolean).length, 0);
}
