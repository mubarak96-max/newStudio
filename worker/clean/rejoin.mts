/**
 * Rejoins sentences the scan cut into separate paragraphs.
 *
 * Text set around an illustration or in a narrow column comes off the page one
 * line per paragraph ("It is very seldom" / "that mere ordi" / "nary people"),
 * which breaks every sentence, quotation and spoken line that crosses a cut.
 * Joining only concatenates, so no character of the book is added or lost and
 * the cleaning guards still judge every repair against these same words.
 */

import { continuesAcrossPage, joinAcrossPage } from "../../lib/canonical.ts";
import type { Paragraph } from "../types.mts";

/** A paragraph after rejoining, with the raw paragraphs it was built from. */
export type JoinedParagraph = Paragraph & { joinedIds: string[] };

/**
 * Stricter than a page seam: inside a page a paragraph break is usually the
 * author's, so only an open sentence followed by a lowercase continuation
 * joins. A sentence broken off with a dash ends its paragraph on purpose.
 */
export function continuesParagraph(previous: string, next: string): boolean {
  // A section break ("* * *") has no sentence to continue.
  if (!/\p{L}/u.test(previous)) return false;
  if (/(\s\p{Pd}|[—–])\s*$/u.test(previous)) return false;
  return /^\s*[\p{Ll},;]/u.test(next) && continuesAcrossPage(previous, next);
}

/**
 * Joins each body paragraph into the one before it when it continues that
 * sentence. Page furniture between the two halves (`isFurniture`) is moved
 * after the joined paragraph rather than left splitting it.
 */
export function rejoinParagraphs(paragraphs: Paragraph[], isFurniture: (paragraph: Paragraph) => boolean): JoinedParagraph[] {
  const out: JoinedParagraph[] = [];
  let open: JoinedParagraph | null = null;
  let held: JoinedParagraph[] = [];
  for (const paragraph of paragraphs) {
    const item: JoinedParagraph = { ...paragraph, joinedIds: [paragraph.id] };
    if (open && isFurniture(paragraph)) {
      held.push(item);
      continue;
    }
    if (open && paragraph.kind === "body" && continuesParagraph(open.text, paragraph.text)) {
      open.text = joinAcrossPage(open.text, paragraph.text);
      open.joinedIds.push(paragraph.id);
      continue;
    }
    out.push(...held, item);
    held = [];
    open = item.kind === "body" ? item : null;
  }
  out.push(...held);
  return out;
}
