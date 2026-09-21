import type { EpisodeProposal, StoryAct, StoryArc, StoryMap } from "../../lib/story-types.ts";
import { asNumber, asString, records, strings } from "../coerce.mts";
import { episodeMaxWords, episodeMinWords, episodeTargetWords } from "../config.mts";
import { unique } from "../evidence.mts";
import { buildSceneRanges } from "../mentions.mts";
import type { Annotation, Ledger, SceneRange } from "../types.mts";
import { storyWorkerVersion, type StoryContext } from "./context.mts";
import { wordCount, type StoryInputs } from "./inputs.mts";
import { storyMapSystemPrompt } from "./prompts.mts";
import {
  buildWeights,
  rebalance,
  snapToNearest,
  tileFromStarts,
  weightOf,
  type Span,
  type Weights,
} from "./ranges.mts";

export type PlannedEpisodeSpan = Span & { title: string; rationale: string };

export function storyWeights(inputs: StoryInputs): Weights {
  return buildWeights(inputs.paragraphs.map((paragraph) => (paragraph.isStory ? wordCount(paragraph.text) : 0)));
}

export function sceneRangesOf(inputs: StoryInputs): SceneRange[] {
  // buildSceneRanges only reads the annotations of the ledger it is given.
  const annotations: Record<string, Annotation> = Object.fromEntries(inputs.annotations);
  return buildSceneRanges({ annotations } as Ledger, inputs.paragraphs);
}

function clip(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function mapPayload(inputs: StoryInputs, scenes: SceneRange[], weights: Weights) {
  const summaryById = new Map(inputs.chapterSummaries.map((summary) => [summary.chapterId, summary.summary]));
  const totalWords = weightOf(weights, { seqStart: 0, seqEnd: inputs.paragraphs.length - 1 });
  return {
    sizing: {
      totalStoryWords: totalWords,
      targetWordsPerEpisode: episodeTargetWords,
      minWordsPerEpisode: episodeMinWords,
      maxWordsPerEpisode: episodeMaxWords,
      approximateEpisodeCount: Math.max(1, Math.round(totalWords / episodeTargetWords)),
    },
    world: inputs.world,
    synopsis: inputs.synopsis,
    chapters: inputs.chapters.map((chapter) => ({
      chapterId: chapter.id,
      title: chapter.title,
      seqStart: chapter.seqStart,
      seqEnd: chapter.seqEnd,
      words: weightOf(weights, chapter),
      summary: summaryById.get(chapter.id) ?? "",
    })),
    scenes: scenes.map(
      (scene) =>
        `seq ${scene.seqStart}-${scene.seqEnd} ${scene.chapterId} ${weightOf(weights, scene)}w loc=${scene.locationId ?? "-"}: ${clip(scene.summary, 90)}`,
    ),
    events: inputs.events
      .slice(0, 1_500)
      .map((event) => `[${event.eventId} seq ${event.seqStart}] ${clip(event.summary, 140)}`),
    principalEntities: inputs.entities
      .filter((entity) => entity.importance === "major")
      .slice(0, 40)
      .map((entity) => `${entity.entityId} (${entity.type}) ${entity.canonicalName}: ${entity.profile?.role || entity.description}`),
  };
}

function chronologyOf(inputs: StoryInputs): StoryMap["chronology"] {
  const groups = new Map<number, string[]>();
  for (const event of inputs.events) {
    const list = groups.get(event.storyTime) ?? [];
    list.push(event.eventId);
    groups.set(event.storyTime, list);
  }
  return Array.from(groups)
    .sort(([left], [right]) => left - right)
    .map(([storyTime, eventIds]) => ({ storyTime, eventIds }));
}

function eventsIn(inputs: StoryInputs, span: Span): string[] {
  return inputs.events
    .filter((event) => event.seqStart >= span.seqStart && event.seqStart <= span.seqEnd)
    .map((event) => event.eventId);
}

function chapterTitleAt(inputs: StoryInputs, seq: number): string {
  return inputs.chapters.find((chapter) => seq >= chapter.seqStart && seq <= chapter.seqEnd)?.title ?? "Untitled";
}

export async function planStoryMap(
  context: StoryContext,
): Promise<{ storyMap: StoryMap; spans: PlannedEpisodeSpan[] }> {
  const { inputs } = context;
  const lastSeq = inputs.paragraphs.length - 1;
  const weights = storyWeights(inputs);
  const scenes = sceneRangesOf(inputs);
  const chapterStarts = new Set(inputs.chapters.map((chapter) => chapter.seqStart));
  const cutPoints = unique([0, ...chapterStarts, ...scenes.map((scene) => scene.seqStart)].map(String))
    .map(Number)
    .sort((left, right) => left - right);
  const notes: string[] = [];

  const data = await context.callModel("story map", storyMapSystemPrompt, mapPayload(inputs, scenes, weights));
  const proposed = records(data?.episodes)
    .filter((row) => asNumber(row.startSeq, -1) >= 0)
    .map((row) => ({
      seq: snapToNearest(asNumber(row.startSeq), cutPoints),
      title: asString(row.title).trim(),
      rationale: asString(row.rationale).trim(),
    }));
  const source: StoryMap["planning"]["source"] = proposed.length > 0 ? "model" : "fallback";
  if (source === "fallback") notes.push("No usable episode proposal came back; episodes start at chapter boundaries.");

  const starts = source === "model" ? proposed.map((row) => row.seq) : [...chapterStarts];
  const tiled = tileFromStarts(starts, 0, lastSeq);
  const spans = rebalance(tiled, weights, {
    minWords: episodeMinWords,
    maxWords: episodeMaxWords,
    targetWords: episodeTargetWords,
    cutPoints,
    preferred: chapterStarts,
  });
  if (spans.length !== tiled.length) {
    notes.push(`Sizing adjusted ${tiled.length} proposed episodes to ${spans.length} (target ${episodeTargetWords} words).`);
  }
  const proposalAt = new Map(proposed.map((row) => [row.seq, row]));
  const planned: PlannedEpisodeSpan[] = spans.map((span) => {
    const proposal = proposalAt.get(span.seqStart);
    return {
      ...span,
      title: proposal?.title || chapterTitleAt(inputs, span.seqStart),
      rationale: proposal?.rationale || "Placed at the nearest chapter or scene boundary for reading length.",
    };
  });

  const actStarts = records(data?.acts)
    .filter((row) => asNumber(row.startSeq, -1) >= 0)
    .map((row) => ({
      seq: snapToNearest(asNumber(row.startSeq), cutPoints),
      title: asString(row.title).trim(),
      summary: asString(row.summary).trim(),
    }));
  // Whatever precedes the model's first act (title page, epigraph) belongs to that act.
  const firstAct = actStarts.reduce<(typeof actStarts)[number] | null>(
    (earliest, act) => (!earliest || act.seq < earliest.seq ? act : earliest),
    null,
  );
  if (firstAct) firstAct.seq = 0;
  const actSpans = tileFromStarts(actStarts.map((act) => act.seq), 0, lastSeq);
  const actAt = new Map(actStarts.map((act) => [act.seq, act]));
  const acts: StoryAct[] = actSpans.map((span, index) => ({
    order: index + 1,
    title: actAt.get(span.seqStart)?.title || (actSpans.length === 1 ? "Whole book" : `Part ${index + 1}`),
    summary: actAt.get(span.seqStart)?.summary || "",
    seqStart: span.seqStart,
    seqEnd: span.seqEnd,
    eventIds: eventsIn(inputs, span),
  }));

  const knownEvents = new Set(inputs.events.map((event) => event.eventId));
  const arcs: StoryArc[] = records(data?.arcs)
    .map((row, index) => ({
      arcId: `arc_${String(index + 1).padStart(2, "0")}`,
      title: asString(row.title).trim(),
      summary: asString(row.summary).trim(),
      entityIds: unique(strings(row.entityIds).filter((id) => inputs.entityById.has(id))),
      eventIds: unique(strings(row.eventIds).filter((id) => knownEvents.has(id))),
    }))
    .filter((arc) => arc.title);

  const episodeProposals: EpisodeProposal[] = planned.map((span, index) => ({
    order: index + 1,
    title: span.title,
    rationale: span.rationale,
    seqStart: span.seqStart,
    seqEnd: span.seqEnd,
  }));
  context.log(`story map: ${acts.length} acts, ${arcs.length} arcs, ${planned.length} episodes (${source}).`);
  return {
    storyMap: {
      schemaVersion: 1,
      sourceId: inputs.sourceId,
      canonicalHash: inputs.canonicalHash,
      jobId: context.jobId,
      workerVersion: storyWorkerVersion,
      acts,
      arcs,
      episodeProposals,
      chronology: chronologyOf(inputs),
      planning: { source, notes },
    },
    spans: planned,
  };
}
