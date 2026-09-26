import type {
  Commentary,
  Dialogue,
  Episode,
  Moment,
  MomentOutlineItem,
  Shot,
  TextSelection,
} from "../../lib/story-types.ts";
import { asString, nullableString, records, strings } from "../coerce.mts";
import { nameRegex, unique } from "../evidence.mts";
import { isNarrator } from "../narrator.mts";
import type { Entity } from "../types.mts";
import type { StoryContext } from "./context.mts";
import { entitiesInRange, entityAsOf, paragraphLines } from "./evidence.mts";
import { commentaryIssues } from "./commentary.mts";
import type { StoryInputs } from "./inputs.mts";
import { wordCount } from "./text.mts";
import { momentSystemPrompt } from "./prompts.mts";
import { applyShotRules, nameIndex } from "./shots.mts";
import { readDirection, visualIdentity } from "./direction.mts";
import { locateQuote, quotedSpans } from "./text.mts";

const framings = new Set(["wide", "medium", "close", "over-shoulder", "insert"]);
const commentaryKinds = new Set(["scene", "context", "clarify"]);

function stateAt(entity: Entity | undefined, seq: number): string | null {
  if (!entity) return null;
  const state = [...entity.states]
    .filter((candidate) => candidate.validFromSeq <= seq)
    .sort((left, right) => right.validFromSeq - left.validFromSeq)[0];
  return state?.stateId ?? null;
}

function mostFrequent(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

/** Names of entities the reader has not met by `seq`, used to catch commentary that spoils. */
function futureNamePatterns(inputs: StoryInputs, seq: number): RegExp[] {
  return inputs.entities
    .filter((entity) => entity.firstSeq > seq)
    .flatMap((entity) => [entity.canonicalName, ...entity.aliases.map((alias) => alias.name)])
    .map(nameRegex)
    .filter((pattern): pattern is RegExp => pattern !== null);
}

type Frame = {
  inputs: StoryInputs;
  outline: MomentOutlineItem;
  storyIds: string[];
  entityIds: Set<string>;
};

/** Entities the reader meets for the first time inside this Moment. */
function newEntitiesIn(inputs: StoryInputs, outline: MomentOutlineItem): Entity[] {
  return inputs.entities.filter((entity) => entity.firstSeq >= outline.seqStart && entity.firstSeq <= outline.seqEnd);
}

function checkCommentary(frame: Frame, rows: Record<string, unknown>[], momentId: string): Commentary[] {
  const allowed = new Set(frame.storyIds);
  const future = futureNamePatterns(frame.inputs, frame.outline.seqEnd);
  const newEntityNames = newEntitiesIn(frame.inputs, frame.outline)
    .flatMap((entity) => [entity.canonicalName, ...entity.aliases.map((alias) => alias.name)])
    .map(nameRegex)
    .filter((pattern): pattern is RegExp => pattern !== null);
  return rows
    .map((row, index) => {
      const text = asString(row.text).trim();
      const cited = strings(row.groundedIn).filter((id) => allowed.has(id));
      const kind = (commentaryKinds.has(asString(row.kind)) ? asString(row.kind) : "scene") as Commentary["kind"];
      const issues: string[] = [];
      if (cited.length === 0) issues.push("No citation inside this moment.");
      const leaked = future.find((pattern) => pattern.test(text));
      if (leaked) issues.push("Names an entity the reader has not met yet.");
      issues.push(
        ...commentaryIssues({
          text,
          kind,
          citedText: cited.map((id) => frame.inputs.paragraphById.get(id)?.text ?? "").join(" "),
          newEntityNames,
        }),
      );
      return {
        id: `${momentId}_c${index + 1}`,
        text,
        kind,
        groundedIn: cited,
        verified: issues.length === 0,
        issues,
      };
    })
    .filter((commentary) => commentary.text);
}

function selectionsFrom(frame: Frame, rows: Record<string, unknown>[], warnings: string[]): TextSelection[] {
  const allowed = new Set(frame.storyIds);
  const selections: TextSelection[] = [];
  let missed = 0;
  for (const row of rows) {
    const paragraphId = asString(row.paragraphId).trim();
    const paragraph = frame.inputs.paragraphById.get(paragraphId);
    const located = paragraph && allowed.has(paragraphId) ? locateQuote(paragraph.text, asString(row.text)) : null;
    if (!paragraph || !located) {
      missed += 1;
      continue;
    }
    if (selections.some((selection) => selection.paragraphId === paragraphId && selection.start === located.start)) continue;
    selections.push({ paragraphId, ...located, text: paragraph.text.slice(located.start, located.end) });
  }
  if (missed > 0) warnings.push(`${missed} proposed text selection(s) did not match the source and were dropped.`);
  return selections.sort(
    (left, right) =>
      frame.inputs.paragraphById.get(left.paragraphId)!.seq - frame.inputs.paragraphById.get(right.paragraphId)!.seq ||
      left.start - right.start,
  );
}

export async function buildMoment(
  context: StoryContext,
  episode: Episode,
  outline: MomentOutlineItem,
  order: number,
): Promise<Moment> {
  const { inputs } = context;
  const span = { seqStart: outline.seqStart, seqEnd: outline.seqEnd };
  const story = inputs.paragraphs.slice(span.seqStart, span.seqEnd + 1).filter((paragraph) => paragraph.isStory);
  const annotations = story.map((paragraph) => inputs.annotations.get(paragraph.id)).filter((annotation) => annotation !== undefined);
  const entities = entitiesInRange(inputs, span, 30);
  for (const narrator of inputs.entities.filter(isNarrator)) if (!entities.some((entity) => entity.entityId === narrator.entityId)) entities.push(narrator);
  const frame: Frame = {
    inputs,
    outline,
    storyIds: story.map((paragraph) => paragraph.id),
    entityIds: new Set(entities.map((entity) => entity.entityId)),
  };
  const warnings: string[] = [];

  const quotes = story.flatMap((paragraph) =>
    quotedSpans(paragraph.text).map((quote) => ({ paragraphId: paragraph.id, ...quote })),
  );
  const quoteIds = quotes.map((_, index) => `q${index + 1}`);
  const outlineIndex = episode.storyPlan?.momentOutline.findIndex((item) => item.momentId === outline.momentId) ?? -1;
  const neighbours = episode.storyPlan?.momentOutline ?? [];

  const data =
    story.length === 0
      ? null
      : await context.callModel(`moment ${outline.momentId}`, momentSystemPrompt, {
          episode: { title: episode.title, summary: episode.summary, openingState: episode.storyPlan?.openingState },
          moment: { momentId: outline.momentId, title: outline.title, purpose: outline.purpose },
          previousMoment: outlineIndex > 0 ? neighbours[outlineIndex - 1] : null,
          entities: entities.map((entity) => ({ ...entityAsOf(entity, span.seqEnd), availableStates: entity.states.filter((state) => state.validFromSeq <= span.seqEnd).map(({ stateId, label, validFromSeq, validFromStoryTime, validToStoryTime }) => ({ stateId, label, validFromSeq, validFromStoryTime, validToStoryTime })) })),
          narratorEntityId: inputs.narratorEntityId,
          annotations: annotations.map(({ paragraphId, presentEntityIds, mentionedEntityIds, speakerEntityIds, mode, locationId }) => ({ paragraphId, presentEntityIds, mentionedEntityIds, speakerEntityIds, mode, locationId })),
          newEntityIds: newEntitiesIn(inputs, outline).map((entity) => entity.entityId),
          quotedLines: quotes.map((quote, index) => ({
            quoteId: quoteIds[index],
            paragraphId: quote.paragraphId,
            text: quote.text.length > 240 ? `${quote.text.slice(0, 240)}…` : quote.text,
          })),
          paragraphs: paragraphLines(inputs, span),
        });
  if (story.length > 0 && !data) throw new Error(`Moment direction failed for ${outline.momentId}; visuals were not invented.`);

  const characterIds = unique(
    annotations.flatMap((annotation) => [...annotation.presentEntityIds, ...annotation.speakerEntityIds]),
  ).filter((id) => inputs.entityById.get(id)?.type === "character");
  const characters = characterIds.map((entityId) => ({
    entityId,
    stateId: stateAt(inputs.entityById.get(entityId), span.seqStart),
  }));
  const locationId = mostFrequent(annotations.flatMap((annotation) => (annotation.locationId ? [annotation.locationId] : [])));
  const locationStateId = locationId ? stateAt(inputs.entityById.get(locationId), span.seqStart) : null;
  const eventsInside = inputs.events.filter((event) => event.seqStart >= span.seqStart && event.seqStart <= span.seqEnd);
  const objectIds = unique([
    ...annotations.flatMap((annotation) => annotation.presentEntityIds),
    ...eventsInside.flatMap((event) => event.objectIds),
  ]).filter((id) => inputs.entityById.get(id)?.type === "object");
  const priorEvent = [...inputs.events].reverse().find((event) => event.seqStart <= span.seqEnd);
  const storyTime = eventsInside.length > 0 ? Math.min(...eventsInside.map((event) => event.storyTime)) : (priorEvent?.storyTime ?? 0);

  const speakers = new Map(
    records(data?.dialogueSpeakers).map((row) => [
      asString(row.quoteId),
      { speaker: nullableString(row.speakerEntityId), addressee: nullableString(row.addresseeEntityId) },
    ]),
  );
  const known = (id: string | null | undefined) => (id && inputs.entityById.has(id) ? id : null);
  const dialogue: Dialogue[] = quotes.map((quote, index) => {
    const attribution = speakers.get(quoteIds[index]!);
    const annotationSpeakers = inputs.annotations.get(quote.paragraphId)?.speakerEntityIds ?? [];
    return {
      paragraphId: quote.paragraphId,
      start: quote.start,
      end: quote.end,
      text: quote.text,
      speakerEntityId: known(attribution?.speaker) ?? (annotationSpeakers.length === 1 ? known(annotationSpeakers[0]) : null),
      addresseeEntityId: known(attribution?.addressee),
    };
  });

  const drafted: Omit<Shot, "reuseKey">[] = records(data?.shots)
    .map((row, index) => {
      const sourceIds = strings(row.sourceParagraphIds);
      const sourceSeq = Math.min(...sourceIds.map((id) => inputs.paragraphById.get(id)?.seq ?? Infinity));
      if (strings(row.entityIds).some((id) => !inputs.entityById.has(id))) throw new Error("Shot names an unknown visible entity.");
      const chosenStates = new Map(records(row.entityStates).map((state) => [asString(state.entityId), nullableString(state.stateId)]));
      const entityStates = unique(strings(row.entityIds)).map((entityId) => {
        const stateId = chosenStates.has(entityId) ? chosenStates.get(entityId)! : asString(row.presentation) === "physical" ? stateAt(inputs.entityById.get(entityId), sourceSeq) : null;
        if (stateId && !inputs.entityById.get(entityId)?.states.some((state) => state.stateId === stateId && state.validFromSeq <= sourceSeq)) throw new Error("Shot uses an unknown or unrevealed state.");
        return { entityId, stateId };
      });
      const direction = readDirection(row, new Set(frame.storyIds), new Set(entityStates.map((state) => state.entityId)));
      const shotLocation = nullableString(row.locationId);
      const locationState = nullableString(row.locationStateId) ?? (direction.presentation === "physical" ? stateAt(inputs.entityById.get(shotLocation ?? ""), sourceSeq) : null);
      if (locationState && !inputs.entityById.get(shotLocation ?? "")?.states.some((state) => state.stateId === locationState && state.validFromSeq <= sourceSeq)) throw new Error("Shot uses an unknown or unrevealed location state.");
      return {
        shotId: `${outline.momentId}_s${index + 1}`,
        description: asString(row.description).trim(),
        entityStates,
        framing: framings.has(asString(row.framing)) ? asString(row.framing) : "medium",
        mood: asString(row.mood).trim(),
        timeOfDay: asString(row.timeOfDay).trim() || "unknown",
        locationId: shotLocation && inputs.entityById.get(shotLocation)?.type === "location" ? shotLocation : null,
        locationStateId: locationState,
        direction: { ...direction, sourceSeq, sourceEvidence: sourceIds.map((id) => ({ paragraphId: id, text: inputs.paragraphById.get(id)!.text })) },
      };
    })
    .filter((shot) => shot.description);
  if (story.length > 0 && drafted.length === 0) throw new Error("Moment direction produced no shots.");
  const shots = applyShotRules(drafted, {
    index: nameIndex(entities),
    momentLocationId: locationId,
    narratorEntityId: inputs.narratorEntityId,
    stateOf: (entityId) => stateAt(inputs.entityById.get(entityId), span.seqStart),
    reuseKeyOf: visualIdentity,
  });

  if (frame.storyIds.some((id) => !shots.some((shot) => shot.direction?.sourceParagraphIds.includes(id)))) throw new Error("Moment direction leaves source paragraphs without a supported visual.");
  const annotationSummary = annotations.map((annotation) => annotation.summary).join(" ");
  return {
    schemaVersion: 1,
    sourceId: inputs.sourceId,
    canonicalHash: inputs.canonicalHash,
    momentId: outline.momentId,
    episodeId: episode.episodeId,
    order,
    // The moment call reads the final range; the outline title may predate a split or merge.
    title: asString(data?.title).trim() || outline.title,
    seqStart: span.seqStart,
    seqEnd: span.seqEnd,
    sourceParagraphIds: frame.storyIds,
    wordCount: story.reduce((sum, paragraph) => sum + wordCount(paragraph.text), 0),
    summary: asString(data?.summary).trim() || annotationSummary.slice(0, 600),
    startState: asString(data?.startState).trim() || annotations[0]?.summary || "",
    endState: asString(data?.endState).trim() || annotations.at(-1)?.summary || "",
    storyTime,
    characters,
    locationId,
    locationStateId,
    objectIds,
    eventIds: eventsInside.map((event) => event.eventId),
    exactTextSelections: selectionsFrom(frame, records(data?.exactTextSelections), warnings),
    dialogue,
    commentary: checkCommentary(frame, records(data?.commentary).slice(0, 3), outline.momentId),
    visualPlan: { shots },
    inspectableEntities: records(data?.inspectables)
      .map((row) => ({ entityId: asString(row.entityId), reason: asString(row.reason).trim() }))
      .filter((row) => frame.entityIds.has(row.entityId)),
    compositionIds: [],
    readingBeats: [],
    beatCoverage: null,
    status: data || story.length === 0 ? "planned" : "fallback",
    warnings,
  };
}
