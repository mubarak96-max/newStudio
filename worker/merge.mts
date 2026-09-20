import {
  evidenceSeqs,
  normalizeText,
  resolveEvidence,
  unique,
  validEvidence,
  type ParagraphIndex,
} from "./evidence.mts";
import type {
  Annotation,
  Delta,
  Entity,
  EntityType,
  Ledger,
  Mention,
  Window,
} from "./types.mts";

export type MergeStats = { dropped: number; unverified: number; remapped: number };

const typePrefix: Record<EntityType, string> = {
  character: "ch_",
  location: "loc_",
  object: "obj_",
  group: "grp_",
  concept: "con_",
};

function findEntity(ledger: Ledger, entityId: string): Entity | undefined {
  return ledger.entities.find((entity) => entity.entityId === entityId);
}

function namesOf(entity: Pick<Entity, "canonicalName" | "aliases">): string[] {
  return [entity.canonicalName, ...entity.aliases.map((alias) => alias.name)]
    .map(normalizeText)
    .filter(Boolean);
}

function withPrefix(entityId: string, type: EntityType): string {
  const prefix = typePrefix[type];
  if (entityId.startsWith(prefix)) return entityId;
  const stripped = entityId.replace(/^(ch|loc|obj|grp|con|e|entity)_/, "");
  return `${prefix}${stripped || entityId}`;
}

/**
 * The model coins an id per window and is told to reuse ledger ids, but it
 * still re-creates known entities under fresh ids. Names and aliases already in
 * the ledger win: the delta is rewritten to point at the existing entity before
 * anything is merged, so facts and annotations follow.
 */
export function resolveEntityIds(ledger: Ledger, delta: Delta): number {
  const map = new Map<string, string>();
  const taken = new Set(ledger.entities.map((entity) => entity.entityId));
  for (const incoming of delta.entities) {
    if (taken.has(incoming.entityId) && !map.has(incoming.entityId)) {
      const existing = findEntity(ledger, incoming.entityId)!;
      if (existing.type === incoming.type || !incoming.canonicalName) continue;
    }
    const names = namesOf(incoming);
    const match = ledger.entities.find(
      (entity) =>
        entity.type === incoming.type &&
        namesOf(entity).some((name) => names.includes(name)),
    );
    if (match) {
      if (match.entityId !== incoming.entityId) map.set(incoming.entityId, match.entityId);
      continue;
    }
    let candidate = withPrefix(incoming.entityId, incoming.type);
    while (taken.has(candidate) && candidate !== incoming.entityId) {
      candidate = `${candidate}_${Math.random().toString(36).slice(2, 6)}`;
    }
    if (candidate !== incoming.entityId) map.set(incoming.entityId, candidate);
    taken.add(candidate);
  }
  if (map.size === 0) return 0;
  const remap = (id: string | null) => (id ? (map.get(id) ?? id) : id);
  const remapAll = (ids: string[]) => unique(ids.map((id) => remap(id)!));
  for (const entity of delta.entities) {
    entity.entityId = remap(entity.entityId)!;
    entity.parentLocationId = remap(entity.parentLocationId);
  }
  for (const fact of delta.facts) {
    fact.entityId = remap(fact.entityId)!;
    fact.claimedBy = remap(fact.claimedBy);
  }
  for (const event of delta.events) {
    event.participants = remapAll(event.participants);
    event.locationId = remap(event.locationId);
    event.objectIds = remapAll(event.objectIds);
  }
  for (const change of delta.stateChanges) change.entityId = remap(change.entityId)!;
  for (const reveal of delta.reveals) reveal.entityId = remap(reveal.entityId)!;
  for (const relationship of delta.relationshipChanges) {
    relationship.entityId = remap(relationship.entityId)!;
    relationship.toEntityId = remap(relationship.toEntityId)!;
  }
  for (const annotation of delta.annotations) {
    annotation.presentEntityIds = remapAll(annotation.presentEntityIds);
    annotation.mentionedEntityIds = remapAll(annotation.mentionedEntityIds);
    annotation.speakerEntityIds = remapAll(annotation.speakerEntityIds);
    annotation.locationId = remap(annotation.locationId);
  }
  for (const conflict of delta.aliasConflicts) conflict.entityIds = remapAll(conflict.entityIds);
  return map.size;
}

export function addMentions(
  entity: Entity,
  paragraphIds: string[],
  paragraphById: ParagraphIndex,
  source: Mention["source"],
): void {
  const known = new Set(entity.mentions.map((mention) => mention.paragraphId));
  for (const paragraphId of paragraphIds) {
    const paragraph = paragraphById.get(paragraphId);
    if (!paragraph || known.has(paragraphId)) continue;
    entity.mentions.push({ paragraphId, seq: paragraph.seq, source });
    known.add(paragraphId);
  }
  entity.mentions.sort((left, right) => left.seq - right.seq);
  entity.mentionCount = entity.mentions.length;
  if (entity.mentions.length > 0) {
    entity.firstSeq = Math.min(entity.firstSeq, entity.mentions[0]!.seq);
    entity.lastSeq = Math.max(entity.lastSeq, entity.mentions.at(-1)!.seq);
  }
}

const nameStopWords = new Set([
  "the",
  "and",
  "from",
  "with",
  "that",
  "this",
  "into",
  "over",
  "other",
  "another",
  "some",
  "their",
  "there",
  "which",
  "about",
]);

/** Content words of a name: what must show up in the text for the entity to be real. */
function nameTokens(names: string[]): string[] {
  return unique(
    names.flatMap((name) =>
      name
        .split(/[^\p{L}\p{N}]+/u)
        .filter((token) => token.length >= 4 && !nameStopWords.has(token)),
    ),
  );
}

/**
 * Evidence paragraphs are kept only where the entity is actually named, which
 * is what stops a window from inventing people. The whole name is not required:
 * descriptive names the book never writes verbatim ("the stable-lad from
 * Foxwood") are real entities, so a content word of the name is enough.
 */
function nameAppears(
  names: string[],
  ids: string[],
  paragraphById: ParagraphIndex,
): string[] {
  const tokens = nameTokens(names);
  return ids.filter((id) => {
    const text = normalizeText(paragraphById.get(id)?.text ?? "");
    return (
      names.some((name) => text.includes(name)) ||
      tokens.some((token) => text.includes(token))
    );
  });
}

function mergeEntities(
  ledger: Ledger,
  delta: Delta,
  ownedIds: string[],
  paragraphById: ParagraphIndex,
  stats: MergeStats,
): void {
  for (const incoming of delta.entities) {
    if (!incoming.entityId || !incoming.canonicalName) {
      stats.dropped += 1;
      continue;
    }
    const names = namesOf(incoming);
    let evidenceIds = nameAppears(
      names,
      validEvidence(incoming.paragraphIds, paragraphById),
      paragraphById,
    );
    if (evidenceIds.length === 0) evidenceIds = nameAppears(names, ownedIds, paragraphById);
    if (evidenceIds.length === 0) {
      stats.dropped += 1;
      continue;
    }
    const seqs = evidenceSeqs(evidenceIds, paragraphById);
    let entity = findEntity(ledger, incoming.entityId);
    if (!entity) {
      entity = {
        entityId: incoming.entityId,
        type: incoming.type,
        canonicalName: incoming.canonicalName,
        aliases: [],
        importance: incoming.importance,
        firstSeq: Math.min(...seqs),
        lastSeq: Math.max(...seqs),
        description: incoming.description,
        parentLocationId: null,
        facts: [],
        fills: [],
        states: [],
        reveals: [],
        relationships: [],
        mentions: [],
        mentionCount: 0,
        profile: null,
      };
      ledger.entities.push(entity);
    }
    if (!entity.description && incoming.description) entity.description = incoming.description;
    if (
      normalizeText(incoming.canonicalName) !== normalizeText(entity.canonicalName) &&
      !entity.aliases.some(
        (alias) => normalizeText(alias.name) === normalizeText(incoming.canonicalName),
      )
    ) {
      entity.aliases.push({
        name: incoming.canonicalName,
        firstSeq: Math.min(...seqs),
        paragraphIds: evidenceIds,
      });
    }
    for (const alias of incoming.aliases) {
      const paragraphIds = validEvidence(alias.paragraphIds, paragraphById);
      const known = normalizeText(alias.name);
      if (
        !known ||
        known === normalizeText(entity.canonicalName) ||
        entity.aliases.some((candidate) => normalizeText(candidate.name) === known)
      )
        continue;
      entity.aliases.push({
        name: alias.name,
        firstSeq: paragraphIds.length ? Math.min(...evidenceSeqs(paragraphIds, paragraphById)) : alias.firstSeq,
        paragraphIds: paragraphIds.length ? paragraphIds : evidenceIds,
      });
    }
    addMentions(entity, evidenceIds, paragraphById, "model");
  }
  for (const incoming of delta.entities) {
    const entity = findEntity(ledger, incoming.entityId);
    if (!entity || entity.parentLocationId || !incoming.parentLocationId) continue;
    const parent = findEntity(ledger, incoming.parentLocationId);
    if (parent && parent.type === "location" && parent.entityId !== entity.entityId) {
      entity.parentLocationId = parent.entityId;
    }
  }
}

function mergeFacts(
  ledger: Ledger,
  delta: Delta,
  ownedIds: string[],
  paragraphById: ParagraphIndex,
  stats: MergeStats,
): void {
  for (const fact of delta.facts) {
    const entity = findEntity(ledger, fact.entityId);
    const { paragraphIds, verified } = resolveEvidence(
      fact.paragraphIds,
      [fact.quote],
      ownedIds,
      paragraphById,
    );
    if (!entity || !fact.key || !fact.value || paragraphIds.length === 0) {
      stats.dropped += 1;
      continue;
    }
    const duplicate = entity.facts.some(
      (candidate) =>
        candidate.key === fact.key &&
        normalizeText(candidate.value) === normalizeText(fact.value),
    );
    if (duplicate) continue;
    if (!verified) stats.unverified += 1;
    entity.facts.push({
      key: fact.key,
      value: fact.value,
      quote: fact.quote,
      certainty: fact.certainty,
      claimedBy: fact.claimedBy && findEntity(ledger, fact.claimedBy) ? fact.claimedBy : null,
      firstSeq: Math.min(...evidenceSeqs(paragraphIds, paragraphById)),
      verified,
      paragraphIds,
    });
    addMentions(entity, paragraphIds, paragraphById, "model");
  }
}

function mergeStatesRevealsRelationships(
  ledger: Ledger,
  delta: Delta,
  ownedIds: string[],
  paragraphById: ParagraphIndex,
  stats: MergeStats,
): void {
  for (const change of delta.stateChanges) {
    const entity = findEntity(ledger, change.entityId);
    const { paragraphIds, verified } = resolveEvidence(
      change.paragraphIds,
      change.evidenceQuotes,
      ownedIds,
      paragraphById,
    );
    if (!entity || !change.stateId || !change.label || paragraphIds.length === 0) {
      stats.dropped += 1;
      continue;
    }
    if (entity.states.some((state) => state.stateId === change.stateId)) continue;
    if (!verified) stats.unverified += 1;
    const validFromSeq = Math.min(...evidenceSeqs(paragraphIds, paragraphById));
    const previous = entity.states.at(-1);
    if (previous && previous.validToStoryTime === null && change.validFromStoryTime > 0) {
      previous.validToStoryTime = change.validFromStoryTime;
    }
    entity.states.push({
      stateId: change.stateId,
      label: change.label,
      validFromStoryTime: change.validFromStoryTime,
      validToStoryTime: null,
      validFromSeq,
      changes: change.changes,
      verified,
      paragraphIds,
    });
    addMentions(entity, paragraphIds, paragraphById, "model");
  }

  for (const reveal of delta.reveals) {
    const entity = findEntity(ledger, reveal.entityId);
    const { paragraphIds, verified } = resolveEvidence(
      reveal.paragraphIds,
      reveal.evidenceQuotes,
      ownedIds,
      paragraphById,
    );
    if (!entity || !reveal.what || paragraphIds.length === 0) {
      stats.dropped += 1;
      continue;
    }
    if (entity.reveals.some((candidate) => normalizeText(candidate.what) === normalizeText(reveal.what)))
      continue;
    if (!verified) stats.unverified += 1;
    entity.reveals.push({
      what: reveal.what,
      seq: Math.min(...evidenceSeqs(paragraphIds, paragraphById)),
      verified,
      paragraphIds,
    });
    addMentions(entity, paragraphIds, paragraphById, "model");
  }

  for (const relationship of delta.relationshipChanges) {
    const entity = findEntity(ledger, relationship.entityId);
    const target = findEntity(ledger, relationship.toEntityId);
    const { paragraphIds, verified } = resolveEvidence(
      relationship.paragraphIds,
      relationship.evidenceQuotes,
      ownedIds,
      paragraphById,
    );
    if (!entity || !target || entity === target || !relationship.type || paragraphIds.length === 0) {
      stats.dropped += 1;
      continue;
    }
    if (
      entity.relationships.some(
        (candidate) =>
          candidate.toEntityId === relationship.toEntityId &&
          candidate.type === relationship.type,
      )
    )
      continue;
    if (!verified) stats.unverified += 1;
    entity.relationships.push({
      toEntityId: relationship.toEntityId,
      type: relationship.type,
      validFromSeq: Math.min(...evidenceSeqs(paragraphIds, paragraphById)),
      validToSeq: null,
      verified,
      paragraphIds,
    });
    addMentions(entity, paragraphIds, paragraphById, "model");
    addMentions(target, paragraphIds, paragraphById, "model");
  }
}

function mergeEvents(
  ledger: Ledger,
  delta: Delta,
  ownedIdList: string[],
  paragraphById: ParagraphIndex,
  stats: MergeStats,
): Map<string, string> {
  const idMap = new Map<string, string>();
  const ownedIds = new Set(ownedIdList);
  const knownEntityIds = new Set(ledger.entities.map((entity) => entity.entityId));
  for (const incoming of delta.events) {
    const resolved = resolveEvidence(
      incoming.paragraphIds,
      incoming.evidenceQuotes,
      ownedIdList,
      paragraphById,
    );
    const paragraphIds = resolved.paragraphIds.filter((id) => ownedIds.has(id));
    if (!incoming.summary || paragraphIds.length === 0) {
      stats.dropped += 1;
      continue;
    }
    const summaryKey = normalizeText(incoming.summary);
    const duplicate = ledger.events.find(
      (event) =>
        normalizeText(event.summary) === summaryKey &&
        event.paragraphIds.some((id) => paragraphIds.includes(id)),
    );
    if (duplicate) {
      idMap.set(incoming.eventId, duplicate.eventId);
      continue;
    }
    let eventId = incoming.eventId.startsWith("ev_") ? incoming.eventId : `ev_${incoming.eventId}`;
    while (ledger.events.some((event) => event.eventId === eventId)) {
      eventId = `${eventId}_${ledger.events.length + 1}`;
    }
    idMap.set(incoming.eventId, eventId);
    const seqs = evidenceSeqs(paragraphIds, paragraphById);
    const verified = resolved.verified;
    if (!verified) stats.unverified += 1;
    const location = incoming.locationId ? findEntity(ledger, incoming.locationId) : undefined;
    const participants = unique(incoming.participants.filter((id) => knownEntityIds.has(id)));
    const objectIds = unique(
      incoming.objectIds.filter((id) => findEntity(ledger, id)?.type === "object"),
    );
    const order = ledger.events.length + 1;
    ledger.events.push({
      eventId,
      order,
      summary: incoming.summary,
      seqStart: Math.min(...seqs),
      seqEnd: Math.max(...seqs),
      chapterId: paragraphById.get(paragraphIds[0]!)!.chapterId,
      storyTime: incoming.storyTimeHint > 0 ? incoming.storyTimeHint : order,
      storyOrder: order,
      isFlashback: incoming.isFlashback,
      participants,
      locationId: location?.type === "location" ? location.entityId : null,
      objectIds,
      kind: incoming.kind,
      verified,
      paragraphIds,
    });
    for (const id of [...participants, ...objectIds]) {
      addMentions(findEntity(ledger, id)!, paragraphIds, paragraphById, "model");
    }
  }
  return idMap;
}

function mergeAnnotations(
  ledger: Ledger,
  delta: Delta,
  ownedIds: Set<string>,
  paragraphById: ParagraphIndex,
  eventIdMap: Map<string, string>,
  stats: MergeStats,
): void {
  const knownEntity = (id: string) => Boolean(findEntity(ledger, id));
  const knownEventIds = new Set(ledger.events.map((event) => event.eventId));
  for (const incoming of delta.annotations) {
    const paragraph = paragraphById.get(incoming.paragraphId);
    if (!paragraph || !ownedIds.has(incoming.paragraphId) || !incoming.summary) {
      stats.dropped += 1;
      continue;
    }
    const existing = ledger.annotations[incoming.paragraphId];
    if (existing && !existing.stub) continue;
    const location = incoming.locationId ? findEntity(ledger, incoming.locationId) : undefined;
    const annotation: Annotation = {
      paragraphId: incoming.paragraphId,
      seq: paragraph.seq,
      chapterId: paragraph.chapterId,
      summary: incoming.summary,
      mode: incoming.mode,
      presentEntityIds: unique(incoming.presentEntityIds.filter(knownEntity)),
      mentionedEntityIds: unique(incoming.mentionedEntityIds.filter(knownEntity)),
      speakerEntityIds: unique(incoming.speakerEntityIds.filter(knownEntity)),
      locationId: location?.type === "location" ? location.entityId : null,
      timeMarker: incoming.timeMarker,
      mood: incoming.mood,
      visualCue: incoming.visualCue,
      eventIds: unique(
        incoming.eventIds
          .map((id) => eventIdMap.get(id) ?? id)
          .filter((id) => knownEventIds.has(id)),
      ),
      stub: false,
    };
    ledger.annotations[incoming.paragraphId] = annotation;
    const mentioned = unique([
      ...annotation.presentEntityIds,
      ...annotation.mentionedEntityIds,
      ...annotation.speakerEntityIds,
      ...(annotation.locationId ? [annotation.locationId] : []),
    ]);
    for (const id of mentioned) {
      addMentions(findEntity(ledger, id)!, [annotation.paragraphId], paragraphById, "model");
    }
  }
}

export function mergeDelta(
  ledger: Ledger,
  delta: Delta,
  window: Window,
  paragraphById: ParagraphIndex,
): MergeStats {
  const stats: MergeStats = { dropped: 0, unverified: 0, remapped: 0 };
  stats.remapped = resolveEntityIds(ledger, delta);
  const ownedIds = unique(window.owned.map((paragraph) => paragraph.id));
  mergeEntities(ledger, delta, ownedIds, paragraphById, stats);
  mergeFacts(ledger, delta, ownedIds, paragraphById, stats);
  mergeStatesRevealsRelationships(ledger, delta, ownedIds, paragraphById, stats);
  const eventIdMap = mergeEvents(ledger, delta, ownedIds, paragraphById, stats);
  mergeAnnotations(ledger, delta, new Set(ownedIds), paragraphById, eventIdMap, stats);
  for (const conflict of delta.aliasConflicts) {
    if (!conflict.alias) continue;
    ledger.aliasConflicts.push({
      alias: conflict.alias,
      entityIds: unique(conflict.entityIds),
      paragraphIds: validEvidence(conflict.paragraphIds, paragraphById),
    });
  }
  if (delta.updatedSynopsis) ledger.rollingSynopsis = delta.updatedSynopsis;
  ledger.diagnostics.droppedItems += stats.dropped;
  ledger.diagnostics.unverifiedItems += stats.unverified;
  ledger.diagnostics.remappedEntityIds += stats.remapped;
  return stats;
}

/** Progress bookkeeping for the sequential pass; repair windows must not call this. */
export function advanceProgress(ledger: Ledger, window: Window): void {
  ledger.processedWindow = window.index;
  ledger.processedUnitIndex = window.owned.at(-1)?.unitIndex ?? ledger.processedUnitIndex;
  const completed = window.owned.filter(
    (paragraph) => (paragraph.fragmentIndex ?? 0) === (paragraph.fragmentCount ?? 1) - 1,
  );
  ledger.processedThroughSeq = completed.at(-1)?.seq ?? ledger.processedThroughSeq;
  ledger.coveredParagraphIds = unique([
    ...ledger.coveredParagraphIds,
    ...completed.map((paragraph) => paragraph.id),
  ]);
}
