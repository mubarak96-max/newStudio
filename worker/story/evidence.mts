import { unique } from "../evidence.mts";
import type { Entity } from "../types.mts";
import type { StoryInputs } from "./inputs.mts";
import type { Span } from "./ranges.mts";

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

