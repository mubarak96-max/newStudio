import { nameRegex, normalizeText, unique } from "./evidence.mts";
import { addMentions } from "./merge.mts";
import type { Entity, Ledger, Paragraph, SceneRange } from "./types.mts";

/**
 * Deterministic pass over the whole text once names and aliases are settled.
 * The model reports who is present when it annotates a paragraph, but it does
 * not reliably list every name in it; a whole-word scan does, and it is what
 * makes firstSeq/lastSeq and mention counts trustworthy.
 */
export function scanMentions(ledger: Ledger, paragraphs: Paragraph[]): void {
  const owners = new Map<string, Set<string>>();
  for (const entity of ledger.entities) {
    for (const name of [entity.canonicalName, ...entity.aliases.map((alias) => alias.name)]) {
      const key = normalizeText(name);
      if (!key) continue;
      const set = owners.get(key) ?? new Set<string>();
      set.add(entity.entityId);
      owners.set(key, set);
    }
  }
  const paragraphById = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph]));
  const story = paragraphs.filter((paragraph) => paragraph.isStory);
  for (const entity of ledger.entities) {
    const patterns = [entity.canonicalName, ...entity.aliases.map((alias) => alias.name)]
      .filter((name) => (owners.get(normalizeText(name))?.size ?? 0) === 1)
      .map(nameRegex)
      .filter((regex): regex is RegExp => regex !== null);
    if (patterns.length === 0) continue;
    const hits = story
      .filter((paragraph) => patterns.some((regex) => regex.test(paragraph.text)))
      .map((paragraph) => paragraph.id);
    addMentions(entity, hits, paragraphById, "scan");
  }
  for (const entity of ledger.entities) {
    entity.mentionCount = entity.mentions.length;
    if (entity.mentions.length > 0) {
      entity.firstSeq = entity.mentions[0]!.seq;
      entity.lastSeq = entity.mentions.at(-1)!.seq;
    }
  }
}

/**
 * Importance comes from how much of the book an entity touches, not from the
 * model's guess in the window that introduced it (which was "supporting" for
 * everyone, protagonist included).
 */
export function assignImportance(ledger: Ledger, storyParagraphCount: number): void {
  const majorFloor = Math.max(6, Math.round(storyParagraphCount * 0.04));
  const supportingFloor = Math.max(3, Math.round(storyParagraphCount * 0.01));
  for (const entity of ledger.entities) {
    entity.importance =
      entity.mentionCount >= majorFloor
        ? "major"
        : entity.mentionCount >= supportingFloor
          ? "supporting"
          : "minor";
  }
}

/** Fills annotation entity lists from the scan and attaches events by paragraph membership. */
export function enrichAnnotations(ledger: Ledger): void {
  const byParagraph = new Map<string, string[]>();
  for (const entity of ledger.entities) {
    for (const mention of entity.mentions) {
      const list = byParagraph.get(mention.paragraphId) ?? [];
      list.push(entity.entityId);
      byParagraph.set(mention.paragraphId, list);
    }
  }
  const eventsByParagraph = new Map<string, string[]>();
  for (const event of ledger.events) {
    for (const paragraphId of event.paragraphIds) {
      const list = eventsByParagraph.get(paragraphId) ?? [];
      list.push(event.eventId);
      eventsByParagraph.set(paragraphId, list);
    }
  }
  for (const annotation of Object.values(ledger.annotations)) {
    const already = new Set([
      ...annotation.presentEntityIds,
      ...annotation.speakerEntityIds,
      ...annotation.mentionedEntityIds,
    ]);
    for (const entityId of byParagraph.get(annotation.paragraphId) ?? []) {
      if (!already.has(entityId) && entityId !== annotation.locationId) {
        annotation.mentionedEntityIds.push(entityId);
        already.add(entityId);
      }
    }
    annotation.eventIds = unique([
      ...annotation.eventIds,
      ...(eventsByParagraph.get(annotation.paragraphId) ?? []),
    ]);
  }
}

/**
 * Locations inherit forward: a paragraph without a stated location is where the
 * previous one was. Inheritance crosses chapter boundaries on purpose — a new
 * chapter usually opens in the place the last one left off, and the model
 * states the location again whenever it actually changes.
 */
export function inheritLocations(ledger: Ledger, paragraphs: Paragraph[]): void {
  let current: string | null = null;
  for (const paragraph of paragraphs) {
    const annotation = ledger.annotations[paragraph.id];
    if (!annotation) continue;
    if (annotation.locationId) current = annotation.locationId;
    else if (current) annotation.locationId = current;
  }
}

/** Contiguous runs of story paragraphs sharing a location inside one chapter: raw material for Moment planning. */
export function buildSceneRanges(ledger: Ledger, paragraphs: Paragraph[]): SceneRange[] {
  const scenes: SceneRange[] = [];
  let open: SceneRange | null = null;
  for (const paragraph of paragraphs) {
    const annotation = ledger.annotations[paragraph.id];
    if (!annotation) continue;
    const present = [...annotation.presentEntityIds, ...annotation.speakerEntityIds];
    const continues =
      open &&
      open.chapterId === annotation.chapterId &&
      (annotation.locationId === null || open.locationId === annotation.locationId);
    if (continues && open) {
      open.seqEnd = annotation.seq;
      open.entityIds = unique([...open.entityIds, ...present]);
      continue;
    }
    open = {
      sceneId: `scene_${String(scenes.length + 1).padStart(4, "0")}`,
      chapterId: annotation.chapterId,
      seqStart: annotation.seq,
      seqEnd: annotation.seq,
      locationId: annotation.locationId,
      entityIds: unique(present),
      summary: annotation.summary,
    };
    scenes.push(open);
  }
  return scenes;
}

export function entitiesByMentions(ledger: Ledger): Entity[] {
  return [...ledger.entities].sort(
    (left, right) => right.mentionCount - left.mentionCount || left.firstSeq - right.firstSeq,
  );
}
