import {
  unitMaxCharacters,
  windowMaxCharacters,
  windowMaxParagraphs,
  windowOverlapParagraphs,
} from "./config.mts";
import type { Paragraph, Window } from "./types.mts";

function splitForProcessing(
  text: string,
  maxCharacters = unitMaxCharacters,
): string[] {
  if (text.length <= maxCharacters) return [text];
  const fragments: string[] = [];
  let rest = text;
  while (rest.length > maxCharacters) {
    const candidate = rest.slice(0, maxCharacters);
    const boundary = Math.max(
      candidate.lastIndexOf("\n"),
      candidate.lastIndexOf(". "),
      candidate.lastIndexOf(" "),
    );
    const end = boundary > maxCharacters * 0.6 ? boundary + 1 : maxCharacters;
    fragments.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) fragments.push(rest);
  return fragments;
}

export function buildProcessingUnits(paragraphs: Paragraph[]): Paragraph[] {
  const units: Paragraph[] = [];
  for (const paragraph of paragraphs) {
    const fragments = splitForProcessing(paragraph.text);
    fragments.forEach((text, fragmentIndex) => {
      units.push({
        ...paragraph,
        text,
        unitIndex: units.length,
        fragmentIndex,
        fragmentCount: fragments.length,
      });
    });
  }
  return units;
}

/** Windows never cross a chapter: a chapter break is the one boundary the text itself declares. */
export function buildWindows(
  paragraphs: Paragraph[],
  maxParagraphs = windowMaxParagraphs,
  maxCharacters = windowMaxCharacters,
  overlap = windowOverlapParagraphs,
): Window[] {
  const windows: Window[] = [];
  const chapters = new Map<string, Paragraph[]>();
  for (const paragraph of paragraphs) {
    const chapter = chapters.get(paragraph.chapterId) ?? [];
    chapter.push(paragraph);
    chapters.set(paragraph.chapterId, chapter);
  }
  for (const chapter of chapters.values()) {
    for (let start = 0; start < chapter.length; ) {
      let end = start;
      let characters = 0;
      while (end < chapter.length && end - start < maxParagraphs) {
        const nextCharacters = chapter[end]!.text.length;
        if (end > start && characters + nextCharacters > maxCharacters) break;
        characters += nextCharacters;
        end += 1;
      }
      windows.push({
        index: windows.length,
        owned: chapter.slice(start, end),
        contextBefore: chapter.slice(Math.max(0, start - overlap), start),
        contextAfter: chapter.slice(end, end + overlap),
      });
      start = end;
    }
  }
  return windows;
}

export function splitWindow(window: Window): [Window, Window] {
  const mid = Math.max(1, Math.ceil(window.owned.length / 2));
  const firstOwned = window.owned.slice(0, mid);
  const secondOwned = window.owned.slice(mid);
  const crossOverlap = 2;
  return [
    {
      index: window.index,
      owned: firstOwned,
      contextBefore: window.contextBefore,
      contextAfter: secondOwned.slice(0, crossOverlap),
    },
    {
      index: window.index,
      owned: secondOwned,
      contextBefore: [...window.contextBefore, ...firstOwned].slice(
        -crossOverlap,
      ),
      contextAfter: window.contextAfter,
    },
  ];
}

/**
 * Repair windows: the given paragraphs (by id) grouped into contiguous runs,
 * each re-sent with real neighbours as context so the model can place them.
 */
export function buildRepairWindows(
  paragraphs: Paragraph[],
  targetIds: Set<string>,
  firstIndex: number,
  maxParagraphs = windowMaxParagraphs,
  overlap = windowOverlapParagraphs,
): Window[] {
  const windows: Window[] = [];
  const positions = paragraphs
    .map((paragraph, position) => ({ paragraph, position }))
    .filter(({ paragraph }) => targetIds.has(paragraph.id));
  let run: { paragraph: Paragraph; position: number }[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const start = run[0]!.position;
    const end = run.at(-1)!.position + 1;
    windows.push({
      index: firstIndex + windows.length,
      owned: paragraphs.slice(start, end),
      contextBefore: paragraphs.slice(Math.max(0, start - overlap), start),
      contextAfter: paragraphs.slice(end, end + overlap),
    });
    run = [];
  };
  for (const item of positions) {
    const previous = run.at(-1);
    const sameChapter = previous?.paragraph.chapterId === item.paragraph.chapterId;
    const adjacent = previous ? item.position - previous.position <= 2 : true;
    if (previous && (!sameChapter || !adjacent || run.length >= maxParagraphs)) flush();
    run.push(item);
  }
  flush();
  return windows;
}
