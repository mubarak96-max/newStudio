import { isNarrator } from "./narrator.mts";
/**
 * Book model integrity: the gate between understanding and everything that
 * spends money on it.
 *
 * The extraction prompt asks for a narrator, forbids the author as a character
 * and expects places to be locations, but a prompt is not a guarantee: both
 * books in production carry an author-as-character, a concept used as the only
 * place, and (for a first-person book) no narrator at all. These rules repair
 * what can be repaired deterministically and fail the stage for what cannot.
 */

import type { Entity, Ledger, Paragraph } from "./types.mts";

export type IntegrityReport = {
  removedEntityIds: string[];
  retypedLocationIds: string[];
  merges: { keepEntityId: string; mergedEntityIds: string[]; reason: string }[];
  strippedClaims: number;
  narratorEntityId: string | null;
  failures: string[];
};

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Every place a foreign entity id can appear in the ledger. */
function remapEntityId(ledger: Ledger, fromId: string, toId: string | null): void {
  const swap = (ids: string[]): string[] => {
    const mapped = ids.map((id) => (id === fromId ? toId : id)).filter((id): id is string => Boolean(id));
    return Array.from(new Set(mapped));
  };
  for (const annotation of Object.values(ledger.annotations)) {
    annotation.presentEntityIds = swap(annotation.presentEntityIds);
    annotation.mentionedEntityIds = swap(annotation.mentionedEntityIds);
    annotation.speakerEntityIds = swap(annotation.speakerEntityIds);
    if (annotation.locationId === fromId) annotation.locationId = toId;
  }
  for (const event of ledger.events) {
    event.participants = swap(event.participants);
    event.objectIds = swap(event.objectIds);
    if (event.locationId === fromId) event.locationId = toId;
  }
  for (const scene of ledger.sceneRanges) {
    scene.entityIds = swap(scene.entityIds);
    if (scene.locationId === fromId) scene.locationId = toId;
  }
  for (const chapter of ledger.chapterSummaries) {
    chapter.entityIds = swap(chapter.entityIds);
    chapter.locationIds = swap(chapter.locationIds);
  }
  for (const entity of ledger.entities) {
    if (entity.parentLocationId === fromId) entity.parentLocationId = toId;
    entity.relationships = entity.relationships.filter((relationship) => {
      if (relationship.toEntityId !== fromId) return true;
      if (!toId) return false;
      relationship.toEntityId = toId;
      return true;
    });
  }
}

function absorb(keep: Entity, merged: Entity): void {
  const byKey = <T,>(items: T[], key: (item: T) => string): T[] => {
    const seen = new Map<string, T>();
    for (const item of items) if (!seen.has(key(item))) seen.set(key(item), item);
    return [...seen.values()];
  };
  keep.aliases = byKey([...keep.aliases, ...merged.aliases, { name: merged.canonicalName, firstSeq: merged.firstSeq, paragraphIds: [] }], (alias) =>
    normalizeName(alias.name),
  );
  keep.facts = byKey([...keep.facts, ...merged.facts], (fact) => `${fact.key}|${normalizeName(fact.value)}`);
  keep.states = byKey([...keep.states, ...merged.states], (state) => state.stateId);
  keep.reveals = [...keep.reveals, ...merged.reveals];
  keep.relationships = byKey([...keep.relationships, ...merged.relationships], (relationship) => `${relationship.toEntityId}|${relationship.type}`);
  keep.mentions = byKey([...keep.mentions, ...merged.mentions], (mention) => mention.paragraphId);
  keep.mentionCount += merged.mentionCount;
  keep.firstSeq = Math.min(keep.firstSeq, merged.firstSeq);
  keep.lastSeq = Math.max(keep.lastSeq, merged.lastSeq);
  keep.profile ??= merged.profile;
}

function removeEntity(ledger: Ledger, entity: Entity): void {
  ledger.entities = ledger.entities.filter((candidate) => candidate.entityId !== entity.entityId);
  remapEntityId(ledger, entity.entityId, null);
}

/** The author and the book itself are not characters in their own story. */
function removeBookMetadataEntities(ledger: Ledger, title: string, author: string): string[] {
  const banned = new Set([normalizeName(author), normalizeName(title)].filter((value) => value.length >= 4));
  if (banned.size === 0) return [];
  const removed: string[] = [];
  for (const entity of [...ledger.entities]) {
    if (entity.type === "location" || isNarrator(entity)) continue;
    const names = [entity.canonicalName, ...entity.aliases.map((alias) => alias.name)].map(normalizeName);
    if (!names.some((name) => banned.has(name))) continue;
    removed.push(entity.entityId);
    removeEntity(ledger, entity);
  }
  return removed;
}

/** Two entities with the same name are the same thing, whatever type each was given. */
function mergeSameNamed(ledger: Ledger): IntegrityReport["merges"] {
  const groups = new Map<string, Entity[]>();
  for (const entity of ledger.entities) {
    const key = normalizeName(entity.canonicalName);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(entity);
  }
  const merges: IntegrityReport["merges"] = [];
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const ranked = [...group].sort((left, right) => right.mentionCount - left.mentionCount || left.firstSeq - right.firstSeq);
    const keep = ranked[0]!;
    const rest = ranked.slice(1);
    for (const entity of rest) {
      absorb(keep, entity);
      ledger.entities = ledger.entities.filter((candidate) => candidate.entityId !== entity.entityId);
      remapEntityId(ledger, entity.entityId, keep.entityId);
    }
    merges.push({ keepEntityId: keep.entityId, mergedEntityIds: rest.map((entity) => entity.entityId), reason: "same canonical name" });
  }
  return merges;
}

/**
 * A small group that only names a moment of a bigger one ("the pigs walking",
 * "the confessing sheep") is a state of that group, not another cast member.
 */
function mergeSubsetGroups(ledger: Ledger): IntegrityReport["merges"] {
  const groups = ledger.entities.filter((entity) => entity.type === "group");
  const merges: IntegrityReport["merges"] = [];
  for (const entity of [...groups]) {
    if (entity.mentionCount > 2) continue;
    const name = normalizeName(entity.canonicalName);
    const host = groups.find(
      (candidate) =>
        candidate.entityId !== entity.entityId &&
        candidate.mentionCount > entity.mentionCount &&
        name.includes(normalizeName(candidate.canonicalName)) &&
        normalizeName(candidate.canonicalName).length >= 4,
    );
    if (!host) continue;
    absorb(host, entity);
    ledger.entities = ledger.entities.filter((candidate) => candidate.entityId !== entity.entityId);
    remapEntityId(ledger, entity.entityId, host.entityId);
    merges.push({ keepEntityId: host.entityId, mergedEntityIds: [entity.entityId], reason: "subset of a larger group" });
  }
  return merges;
}

/** Anything the book uses as a place is a location, however the model typed it. */
function retypePlaces(ledger: Ledger): string[] {
  const used = new Set<string>();
  for (const annotation of Object.values(ledger.annotations)) if (annotation.locationId) used.add(annotation.locationId);
  for (const event of ledger.events) if (event.locationId) used.add(event.locationId);
  for (const scene of ledger.sceneRanges) if (scene.locationId) used.add(scene.locationId);
  const retyped: string[] = [];
  for (const entity of ledger.entities) {
    if (!used.has(entity.entityId) || entity.type === "location") continue;
    entity.type = "location";
    retyped.push(entity.entityId);
  }
  return retyped;
}

/** A claim with no paragraph behind it cannot be checked, so it is not kept. */
function stripUngroundedClaims(ledger: Ledger): number {
  let stripped = 0;
  const grounded = <T extends { paragraphIds: string[] }>(items: T[]): T[] => {
    const kept = items.filter((item) => item.paragraphIds.length > 0);
    stripped += items.length - kept.length;
    return kept;
  };
  for (const entity of ledger.entities) {
    entity.facts = grounded(entity.facts);
    entity.states = grounded(entity.states);
    entity.reveals = grounded(entity.reveals);
    entity.relationships = grounded(entity.relationships);
  }
  ledger.events = grounded(ledger.events);
  return stripped;
}

const FIRST_PERSON = /(^|[^\p{L}])(I|I'm|I've|I'd|I'll|my|me|mine)([^\p{L}]|$)/u;

/** Story paragraphs written in the first person, as a fraction of all of them. */
export function firstPersonRatio(paragraphs: Paragraph[]): number {
  const story = paragraphs.filter((paragraph) => paragraph.isStory);
  if (story.length === 0) return 0;
  const hits = story.filter((paragraph) => FIRST_PERSON.test(paragraph.text.replace(/[?"][^?"]*[?"]/g, ""))).length;
  return hits / story.length;
}

/**
 * Finds the narrator of a first-person book: the entity the model named as the
 * narrator, or the character who is present in most of the first-person
 * paragraphs when the narrator is named in the text instead.
 */
function findNarrator(ledger: Ledger): string | null {
  const narrators = ledger.entities.filter(isNarrator);
  return narrators.length === 1 ? narrators[0]!.entityId : null;
}

/**
 * Repairs what is mechanical and reports what is not. The caller fails the job
 * when `failures` is non-empty: a book whose protagonist is missing produces
 * shots bound to the wrong character, which is far more expensive to find later.
 */
export function enforceIntegrity(
  ledger: Ledger,
  paragraphs: Paragraph[],
  book: { title: string; author: string },
): IntegrityReport {
  const removedEntityIds = removeBookMetadataEntities(ledger, book.title, book.author);
  const merges = [...mergeSameNamed(ledger), ...mergeSubsetGroups(ledger)];
  const retypedLocationIds = retypePlaces(ledger);
  const strippedClaims = stripUngroundedClaims(ledger);

  const failures: string[] = [];
  const firstPerson = firstPersonRatio(paragraphs);
  const narratorEntityId = firstPerson >= 0.15 ? findNarrator(ledger) : null;
  if (firstPerson >= 0.15 && !ledger.entities.some(isNarrator)) {
    failures.push(
      `This book is narrated in the first person (${Math.round(firstPerson * 100)}% of story paragraphs) but no narrator ` +
        "character exists in the model. Every shot of the narrator would be bound to another character.",
    );
  }
  if (ledger.entities.filter((entity) => entity.type === "location").length === 0) {
    failures.push("The model has no location entities, so no scene can be given a place.");
  }

  ledger.diagnostics.merges = [...ledger.diagnostics.merges, ...merges];
  return { removedEntityIds, retypedLocationIds, merges, strippedClaims, narratorEntityId, failures };
}
