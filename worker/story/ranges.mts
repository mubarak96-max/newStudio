/**
 * Pure range arithmetic for Episodes and Moments. Model output only ever
 * proposes start points; these functions turn any proposal into an exact
 * tiling, so a sloppy or partial answer still yields complete ownership.
 */

export type Span = { seqStart: number; seqEnd: number };

export type Weights = {
  /** prefix[i] = story words in seq [0, i). */
  prefix: number[];
};

export function buildWeights(wordsBySeq: number[]): Weights {
  const prefix = [0];
  for (const words of wordsBySeq) prefix.push(prefix.at(-1)! + words);
  return { prefix };
}

export function weightOf(weights: Weights, span: Span): number {
  return weights.prefix[span.seqEnd + 1]! - weights.prefix[span.seqStart]!;
}

/** Nearest candidate by seq distance; ties go to the earlier candidate. */
export function snapToNearest(value: number, candidates: number[]): number {
  let best = candidates[0] ?? value;
  for (const candidate of candidates) {
    if (Math.abs(candidate - value) < Math.abs(best - value)) best = candidate;
  }
  return best;
}

export function tileFromStarts(starts: number[], rangeStart: number, rangeEnd: number): Span[] {
  const sorted = Array.from(
    new Set(starts.filter((seq) => Number.isInteger(seq) && seq > rangeStart && seq <= rangeEnd)),
  ).sort((left, right) => left - right);
  const all = [rangeStart, ...sorted];
  return all.map((seqStart, index) => ({
    seqStart,
    seqEnd: index + 1 < all.length ? all[index + 1]! - 1 : rangeEnd,
  }));
}

export type RebalanceOptions = {
  minWords: number;
  maxWords: number;
  targetWords: number;
  /** Sorted seqs where a new span may start; others are used only when no candidate exists. */
  cutPoints: number[];
  /** Cut points that are better than others (chapter starts, scene changes). */
  preferred?: Set<number>;
};

function mergeSmall(spans: Span[], weights: Weights, minWords: number): Span[] {
  const result = spans.map((span) => ({ ...span }));
  for (;;) {
    if (result.length < 2) return result;
    let smallest = -1;
    for (let index = 0; index < result.length; index += 1) {
      const weight = weightOf(weights, result[index]!);
      if (weight < minWords && (smallest < 0 || weight < weightOf(weights, result[smallest]!))) smallest = index;
    }
    if (smallest < 0) return result;
    const previous = smallest > 0 ? result[smallest - 1]! : null;
    const next = smallest + 1 < result.length ? result[smallest + 1]! : null;
    const previousWeight = previous ? weightOf(weights, previous) : Infinity;
    const nextWeight = next ? weightOf(weights, next) : Infinity;
    const intoPrevious = previousWeight <= nextWeight;
    const merged = intoPrevious
      ? { seqStart: previous!.seqStart, seqEnd: result[smallest]!.seqEnd }
      : { seqStart: result[smallest]!.seqStart, seqEnd: next!.seqEnd };
    // A merge that creates an oversized span is still made: a fragment is worse
    // than a long span, and the split pass cuts it again at a better seam.
    if (intoPrevious) result.splice(smallest - 1, 2, merged);
    else result.splice(smallest, 2, merged);
  }
}

function splitLarge(span: Span, weights: Weights, options: RebalanceOptions): Span[] {
  const total = weightOf(weights, span);
  if (total <= options.maxWords || span.seqEnd <= span.seqStart) return [span];
  const parts = Math.max(2, Math.round(total / options.targetWords));
  const inside = options.cutPoints.filter((seq) => seq > span.seqStart && seq <= span.seqEnd);
  const fallback: number[] = [];
  for (let seq = span.seqStart + 1; seq <= span.seqEnd; seq += 1) fallback.push(seq);
  const candidates = inside.length > 0 ? inside : fallback;
  const cuts: number[] = [];
  for (let part = 1; part < parts; part += 1) {
    const goal = weights.prefix[span.seqStart]! + (total * part) / parts;
    let best: number | null = null;
    let bestScore = Infinity;
    for (const seq of candidates) {
      if (cuts.length > 0 && seq <= cuts.at(-1)!) continue;
      const distance = Math.abs(weights.prefix[seq]! - goal);
      const score = options.preferred?.has(seq) ? distance * 0.6 : distance;
      if (score < bestScore) {
        bestScore = score;
        best = seq;
      }
    }
    if (best !== null) cuts.push(best);
  }
  return tileFromStarts(cuts, span.seqStart, span.seqEnd);
}

/**
 * Merge fragments below minWords into their smaller neighbour, then split
 * spans above maxWords at the cut points closest to even parts. Always
 * returns an exact tiling of the input's overall range.
 */
export function rebalance(spans: Span[], weights: Weights, options: RebalanceOptions): Span[] {
  const merged = mergeSmall(spans, weights, options.minWords);
  const split = merged.flatMap((span) => splitLarge(span, weights, options));
  return reattachEmpty(split, weights);
}

/** A span with no story words (a run of headings or front matter) joins its neighbour. */
export function reattachEmpty(spans: Span[], weights: Weights): Span[] {
  const result: Span[] = [];
  for (const span of spans) {
    if (weightOf(weights, span) === 0 && result.length > 0) {
      result[result.length - 1] = { ...result.at(-1)!, seqEnd: span.seqEnd };
    } else if (result.length > 0 && weightOf(weights, result.at(-1)!) === 0) {
      result[result.length - 1] = { seqStart: result.at(-1)!.seqStart, seqEnd: span.seqEnd };
    } else {
      result.push({ ...span });
    }
  }
  return result;
}

/**
 * Episode spans that never cross a chapter boundary.
 *
 * An episode that starts mid-chapter and ends inside the next one reads as two
 * halves of different stories, and it is how one Animal Farm episode came to
 * hold the Battle of the Cowshed, Mollie leaving, the windmill dispute and
 * Snowball's expulsion at once. So chapters are the unit: short neighbours
 * merge until they are worth an episode, and a chapter too long for one
 * episode is cut inside itself at the best seam available.
 */
export function chapterAlignedSpans(
  chapters: Span[],
  weights: Weights,
  options: RebalanceOptions,
): Span[] {
  if (chapters.length === 0) return [];
  const ordered = [...chapters].sort((left, right) => left.seqStart - right.seqStart);
  const merged: Span[] = [];
  for (const chapter of ordered) {
    const open = merged.at(-1);
    // Front matter and other word-less runs join the chapter after them, not before.
    if (open && (weightOf(weights, open) < options.minWords || weightOf(weights, chapter) === 0)) {
      const combined = { seqStart: open.seqStart, seqEnd: chapter.seqEnd };
      if (weightOf(weights, combined) <= options.maxWords || weightOf(weights, open) === 0) {
        merged[merged.length - 1] = combined;
        continue;
      }
    }
    merged.push({ ...chapter });
  }
  return merged.flatMap((span) => splitLarge(span, weights, options));
}

export type TilingReport = { ok: boolean; missing: number[]; duplicated: number[] };

export function validateTiling(spans: Span[], rangeStart: number, rangeEnd: number): TilingReport {
  const owners = new Map<number, number>();
  for (const span of spans) {
    for (let seq = span.seqStart; seq <= span.seqEnd; seq += 1) owners.set(seq, (owners.get(seq) ?? 0) + 1);
  }
  const missing: number[] = [];
  const duplicated: number[] = [];
  for (let seq = rangeStart; seq <= rangeEnd; seq += 1) {
    const count = owners.get(seq) ?? 0;
    if (count === 0) missing.push(seq);
    if (count > 1) duplicated.push(seq);
  }
  const outside = spans.some((span) => span.seqStart < rangeStart || span.seqEnd > rangeEnd || span.seqStart > span.seqEnd);
  return { ok: missing.length === 0 && duplicated.length === 0 && !outside, missing, duplicated };
}
