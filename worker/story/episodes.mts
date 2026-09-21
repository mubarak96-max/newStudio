import type { Episode, MomentOutlineItem } from "../../lib/story-types.ts";
import { asString, records, strings } from "../coerce.mts";
import { momentMaxWords, momentMinWords, momentTargetWords } from "../config.mts";
import { unique } from "../evidence.mts";
import type { Entity } from "../types.mts";
import type { StoryContext } from "./context.mts";
import { wordCount, type StoryInputs } from "./inputs.mts";
import type { PlannedEpisodeSpan } from "./map.mts";
import { storyWeights } from "./map.mts";
import { episodePlanSystemPrompt } from "./prompts.mts";
import { rebalance, tileFromStarts, validateTiling, type Span } from "./ranges.mts";

export function paddedOrder(order: number, total: number): string {
  return String(order).padStart(Math.max(2, String(total).length), "0");
}

export function paragraphLines(inputs: StoryInputs, span: Span): string[] {
  return inputs.paragraphs
    .slice(span.seqStart, span.seqEnd + 1)
    .map((paragraph) => `[${paragraph.id}${paragraph.isStory ? "" : ` ${paragraph.kind}`}] ${paragraph.text}`);
}

/** Entities in a range by how often the annotations show them, most frequent first. */
export function entitiesInRange(inputs: StoryInputs, span: Span, limit: number): Entity[] {
  const counts = new Map<string, number>();
  for (const paragraph of inputs.paragraphs.slice(span.seqStart, span.seqEnd + 1)) {
    const annotation = inputs.annotations.get(paragraph.id);
    if (!annotation) continue;
    const ids = unique([
      ...annotation.presentEntityIds,
      ...annotation.speakerEntityIds,
      ...annotation.mentionedEntityIds,
      ...(annotation.locationId ? [annotation.locationId] : []),
    ]);
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return Array.from(counts)
    .sort((left, right) => right[1] - left[1])
    .map(([id]) => inputs.entityById.get(id))
    .filter((entity): entity is Entity => Boolean(entity))
    .slice(0, limit);
}

/**
 * What a reader knows about an entity by `seq`: aliases, facts and the current
 * state introduced up to that point only. Whole-book profiles are never sent,
 * because they describe endings the reader has not reached.
 */
export function entityAsOf(entity: Entity, seq: number) {
  const state = [...entity.states]
    .filter((candidate) => candidate.validFromSeq <= seq)
    .sort((left, right) => right.validFromSeq - left.validFromSeq)[0];
  return {
    entityId: entity.entityId,
    type: entity.type,
    name: entity.canonicalName,
    aliases: entity.aliases.filter((alias) => alias.firstSeq <= seq).map((alias) => alias.name),
    introducedAs: entity.firstSeq <= seq ? entity.description : "",
    facts: entity.facts
      .filter((fact) => fact.firstSeq <= seq)
      .slice(0, 10)
      .map((fact) => `${fact.key}: ${fact.value}`),
    currentState: state ? { stateId: state.stateId, label: state.label } : null,
  };
}

/**
 * Seqs where a Moment may start: a change of place (preferred), a change of
 * who is present, or the start of an event.
 */
export function momentCutPoints(inputs: StoryInputs, span: Span): { cutPoints: number[]; preferred: Set<number> } {
  const cutPoints: number[] = [];
  const preferred = new Set<number>();
  const eventStarts = new Set(inputs.events.map((event) => event.seqStart));
  let lastLocation: string | null = null;
  let lastPresent: Set<string> | null = null;
  for (let seq = span.seqStart; seq <= span.seqEnd; seq += 1) {
    const paragraph = inputs.paragraphs[seq]!;
    const annotation = inputs.annotations.get(paragraph.id);
    if (!paragraph.isStory || !annotation) continue;
    const present = new Set([...annotation.presentEntityIds, ...annotation.speakerEntityIds]);
    if (lastPresent) {
      const before = lastPresent;
      const moved = annotation.locationId !== null && annotation.locationId !== lastLocation;
      const shared = [...present].filter((id) => before.has(id)).length;
      const castChanged = present.size > 0 && before.size > 0 && shared / Math.max(present.size, before.size) < 0.34;
      if (moved) preferred.add(seq);
      if (moved || castChanged || eventStarts.has(seq)) cutPoints.push(seq);
    }
    lastLocation = annotation.locationId ?? lastLocation;
    lastPresent = present;
  }
  return { cutPoints, preferred };
}

/** Models write "p000123", "[p000123]", "p123" or the bare seq; all resolve to the same paragraph. */
export function paragraphSeqOf(value: unknown, inputs: StoryInputs): number {
  if (typeof value === "number" && Number.isInteger(value)) return inputs.paragraphs[value] ? value : -1;
  const match = /p?(\d+)/i.exec(asString(value));
  if (!match) return -1;
  const seq = Number(match[1]);
  return inputs.paragraphs[seq] ? seq : -1;
}

function summaryFallback(inputs: StoryInputs, span: Span): string {
  return inputs.paragraphs
    .slice(span.seqStart, span.seqEnd + 1)
    .map((paragraph) => inputs.annotations.get(paragraph.id)?.summary)
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");
}

export async function planEpisode(
  context: StoryContext,
  span: PlannedEpisodeSpan,
  order: number,
  total: number,
  previousEndingState: string,
): Promise<Episode> {
  const { inputs } = context;
  const episodeId = `ep_${paddedOrder(order, total)}`;
  const paragraphs = inputs.paragraphs.slice(span.seqStart, span.seqEnd + 1);
  const story = paragraphs.filter((paragraph) => paragraph.isStory);
  const eventsInside = inputs.events.filter((event) => event.seqStart >= span.seqStart && event.seqStart <= span.seqEnd);
  const warnings: string[] = [];

  const data = await context.callModel(`episode ${episodeId}`, episodePlanSystemPrompt, {
    episode: { episodeId, provisionalTitle: span.title, seqStart: span.seqStart, seqEnd: span.seqEnd },
    sizing: { targetWordsPerMoment: momentTargetWords, minWordsPerMoment: momentMinWords },
    previousEpisodeEndingState: previousEndingState || null,
    entities: entitiesInRange(inputs, span, 40).map((entity) => entityAsOf(entity, span.seqStart)),
    events: eventsInside.map((event) => `[${event.eventId}] ${event.summary}`),
    paragraphs: paragraphLines(inputs, span),
  });
  if (!data) warnings.push("The episode plan call failed; the plan was built from paragraph annotations.");

  const weights = storyWeights(inputs);
  const { cutPoints, preferred } = momentCutPoints(inputs, span);
  const proposed = records(data?.moments)
    .map((row) => ({
      seq: paragraphSeqOf(row.startParagraphId ?? row.startParagraph ?? row.paragraphId ?? row.startSeq, inputs),
      title: asString(row.title).trim(),
      purpose: asString(row.purpose).trim(),
    }))
    .filter((row) => row.seq >= span.seqStart && row.seq <= span.seqEnd);
  if (data && proposed.length === 0) warnings.push("The plan proposed no usable moment starts; moments follow scene changes.");
  const starts = proposed.length > 0 ? proposed.map((row) => row.seq) : [...preferred];
  const momentSpans = rebalance(tileFromStarts(starts, span.seqStart, span.seqEnd), weights, {
    minWords: momentMinWords,
    maxWords: momentMaxWords,
    targetWords: momentTargetWords,
    cutPoints,
    preferred,
  });
  const tiling = validateTiling(momentSpans, span.seqStart, span.seqEnd);
  if (!tiling.ok) throw new Error(`Moment outline for ${episodeId} does not tile its range.`);
  const proposalAt = new Map(proposed.map((row) => [row.seq, row]));
  const momentOutline: MomentOutlineItem[] = momentSpans.map((momentSpan, index) => {
    const proposal = proposalAt.get(momentSpan.seqStart);
    const firstSummary = summaryFallback(inputs, momentSpan).split(/(?<=[.!?])\s/)[0] ?? "";
    return {
      momentId: `${episodeId}_m${paddedOrder(index + 1, momentSpans.length)}`,
      title: proposal?.title || firstSummary.split(/\s+/).slice(0, 6).join(" ") || `Moment ${index + 1}`,
      purpose: proposal?.purpose || firstSummary,
      seqStart: momentSpan.seqStart,
      seqEnd: momentSpan.seqEnd,
    };
  });

  const knownEvents = new Set(eventsInside.map((event) => event.eventId));
  const summary = asString(data?.summary).trim() || summaryFallback(inputs, span);
  return {
    schemaVersion: 1,
    sourceId: inputs.sourceId,
    canonicalHash: inputs.canonicalHash,
    episodeId,
    order,
    title: asString(data?.title).trim() || span.title,
    summary,
    seqStart: span.seqStart,
    seqEnd: span.seqEnd,
    chapterIds: inputs.chapters
      .filter((chapter) => chapter.seqStart <= span.seqEnd && chapter.seqEnd >= span.seqStart)
      .map((chapter) => chapter.id),
    paragraphCount: paragraphs.length,
    storyParagraphCount: story.length,
    wordCount: story.reduce((sum, paragraph) => sum + wordCount(paragraph.text), 0),
    storyPlan: {
      arc: asString(data?.arc).trim(),
      openingState: asString(data?.openingState).trim(),
      endingState: asString(data?.endingState).trim(),
      emotionalProgression: asString(data?.emotionalProgression).trim(),
      revealProgression: strings(data?.revealProgression),
      keyEventIds: strings(data?.keyEventIds).filter((id) => knownEvents.has(id)),
      visualStrategy: asString(data?.visualStrategy).trim(),
      reuseCandidates: strings(data?.reuseCandidates),
      momentOutline,
    },
    stageStatus: { planned: "done", moments: "pending" },
    momentCount: momentOutline.length,
    warnings,
  };
}
