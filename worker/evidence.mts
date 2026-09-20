import type { Paragraph } from "./types.mts";

export type ParagraphIndex = Map<string, Paragraph>;

/**
 * Quote checks tolerate the differences a model introduces when it copies:
 * curly versus straight quotes, dash variants, case and whitespace. A quote
 * that fails even this is kept but flagged unverified rather than dropped;
 * silently discarding cited claims is how the old model lost most of a book.
 */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―­-]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function validEvidence(ids: string[], paragraphById: ParagraphIndex): string[] {
  return unique(ids.filter((id) => paragraphById.has(id)));
}

export function evidenceSeqs(ids: string[], paragraphById: ParagraphIndex): number[] {
  return ids.map((id) => paragraphById.get(id)!.seq);
}

export function quoteMatches(
  quote: string,
  ids: string[],
  paragraphById: ParagraphIndex,
): boolean {
  const needle = normalizeText(quote);
  if (!needle) return false;
  return ids.some((id) => {
    const text = paragraphById.get(id)?.text;
    return text ? normalizeText(text).includes(needle) : false;
  });
}

export function evidenceQuotesMatch(
  quotes: string[],
  ids: string[],
  paragraphById: ParagraphIndex,
): boolean {
  return (
    quotes.length > 0 &&
    quotes.every((quote) => quoteMatches(quote, ids, paragraphById))
  );
}

export type ResolvedEvidence = { paragraphIds: string[]; verified: boolean };

/**
 * Models cite the right sentence and the wrong paragraph id surprisingly often,
 * usually a neighbour inside the same window. Rather than flag a true claim as
 * unverified, the quote is looked up across the window and the citation is
 * corrected. Only a quote found nowhere in the window leaves the claim
 * unverified, and the claim is still kept so nothing the book says is lost.
 */
export function resolveEvidence(
  citedIds: string[],
  quotes: string[],
  searchIds: string[],
  paragraphById: ParagraphIndex,
): ResolvedEvidence {
  const cited = validEvidence(citedIds, paragraphById);
  const usable = quotes.filter((quote) => quote.trim());
  if (usable.length === 0) return { paragraphIds: cited, verified: false };
  if (usable.every((quote) => quoteMatches(quote, cited, paragraphById))) {
    return { paragraphIds: cited, verified: true };
  }
  const located: string[] = [];
  let allFound = true;
  for (const quote of usable) {
    const hit = searchIds.find((id) => quoteMatches(quote, [id], paragraphById));
    if (hit) located.push(hit);
    else allFound = false;
  }
  if (located.length === 0) return { paragraphIds: cited, verified: false };
  return {
    paragraphIds: unique([...cited, ...located]),
    verified: allFound,
  };
}

/** Whole-word search that respects Unicode letters; case-sensitive when the name carries capitals. */
export function nameRegex(name: string): RegExp | null {
  const trimmed = name.trim();
  if (trimmed.length < 3) return null;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const caseSensitive = /\p{Lu}/u.test(trimmed);
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    caseSensitive ? "u" : "iu",
  );
}
