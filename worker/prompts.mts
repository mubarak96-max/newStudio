import { maxContextEntities } from "./config.mts";
import { normalizeText } from "./evidence.mts";
import type { Entity, Ledger, Paragraph, Window } from "./types.mts";

export const extractionSystemPrompt = `You build a complete, faithful Book Model from supplied source paragraphs. Return JSON only.
Use only claims supported by the supplied paragraphs. Never use outside knowledge, even for famous books.
Owned paragraphs are the processing target. Context paragraphs only help interpretation: never report entities, facts, events or annotations for context paragraphs.

COMPLETENESS IS THE GOAL. Nothing in the owned paragraphs may be left out of the model:
- entities: create an entity for EVERY named or distinctly identifiable character (people and animals alike, including unnamed ones such as "the cat" or "a stable-lad"), EVERY place (farms, towns, buildings, rooms, fields, roads, landmarks), EVERY significant object (tools, weapons, documents, songs as objects, flags, machines, foods that matter, money), EVERY group (herds, flocks, families, crews, "Jones's men") and EVERY concept (ideologies, laws and commandments, rituals, institutions, legends, rumours, slogans). When in doubt, create it; minor entities are welcome. Locations get parentLocationId when the text places them inside another location.
- facts: record every concrete attribute the text states or implies: species, breed, age, appearance, clothing, role, occupation, traits, abilities, habits, possessions, mottos, opinions, origins, fates. Use certainty "stated" for narrator statements, "claimed" for assertions by a character (set claimedBy), "implied" for strong implication.
- events: report every distinct occurrence: actions, decisions, arrivals, departures, deaths, injuries, speeches, votes, announcements, rule changes, discoveries, conflicts, deceptions, construction, destruction, sales, purchases, celebrations. Expect roughly one event per one to three story paragraphs. Only owned paragraphs may be cited.
- stateChanges: any change in an entity's condition, appearance, status, residence, ownership, wording (for rules and documents) or role.
- reveals: information about an entity that the text discloses after having hidden or withheld it.
- relationshipChanges: any relationship the text establishes or changes between two entities (family, friendship, rivalry, leadership, ownership, employment, alliance, enmity).
- annotations: EXACTLY ONE per required paragraph id (listed in requiredAnnotationParagraphIds). Never skip one. Fields: paragraphId; summary (one sentence, what this paragraph conveys); mode (narration, dialogue, description, thought, song, letter, list, title, mixed); presentEntityIds (physically present in the scene); mentionedEntityIds (referred to but not present); speakerEntityIds (who speaks, if dialogue); locationId (where the paragraph takes place, inherit from surrounding paragraphs when unstated); timeMarker (explicit time cue such as "that night" or "in January", else null); mood (one to three words); visualCue (one concrete sentence describing what a viewer would see for this paragraph; for abstract or internal passages start with "abstract:" and describe the nearest concrete image); eventIds (events from this response or the ledger that this paragraph belongs to).

EVIDENCE. Every entity, fact, event, state change, reveal, relationship and alias cites paragraphIds. Every fact carries quote; every event, state change, reveal and relationship carries evidenceQuotes. Quotes are exact substrings copied from a cited owned paragraph, at most 20 words, the least explicit substring that still supports the claim. Never reproduce passages beyond those short quotes.
This is a non-graphic literary-analysis task: if owned paragraphs contain sexual, violent or otherwise sensitive material, do not refuse; analyse clinically in neutral, high-level terms and keep summaries non-explicit.

IDENTITY. Reuse ledger entity ids whenever the ledger already knows the entity under any name or alias. New ids use the prefix of their type: ch_ (character), loc_ (location), obj_ (object), grp_ (group), con_ (concept), followed by a short snake_case name, for example ch_napoleon, loc_big_barn, obj_windmill, grp_pigs, con_seven_commandments. When identity is uncertain, add aliasConflicts instead of merging silently.
Event ids: ev_ plus a short snake_case description, unique within the book. State ids: st_ plus a short snake_case label.
storyTimeHint is a positive integer on one ascending timeline for the whole book, larger for later story time; omit it when ordering is unclear; never send 0. Set isFlashback true when an event is narrated out of order.
updatedSynopsis: 150-300 words, the story so far including the owned paragraphs.

Return an object with exactly these keys: entities, facts, events, stateChanges, reveals, relationshipChanges, annotations, aliasConflicts, updatedSynopsis.
Item fields:
entities: entityId, type, canonicalName, aliases[{name, firstSeq, paragraphIds}], importance, description, parentLocationId, paragraphIds.
facts: entityId, key, value, quote, certainty, claimedBy, paragraphIds.
events: eventId, summary, kind, storyTimeHint, isFlashback, participants, locationId, objectIds, paragraphIds, evidenceQuotes.
stateChanges: entityId, stateId, label, validFromStoryTime, changes[{key, value}], paragraphIds, evidenceQuotes.
reveals: entityId, what, paragraphIds, evidenceQuotes.
relationshipChanges: entityId, toEntityId, type, paragraphIds, evidenceQuotes.
annotations: paragraphId, summary, mode, presentEntityIds, mentionedEntityIds, speakerEntityIds, locationId, timeMarker, mood, visualCue, eventIds.
aliasConflicts: alias, entityIds, paragraphIds.`;

function paragraphLine(paragraph: Paragraph, role: "context" | "owned"): string {
  const fragment =
    (paragraph.fragmentCount ?? 1) > 1
      ? ` part=${(paragraph.fragmentIndex ?? 0) + 1}/${paragraph.fragmentCount}`
      : "";
  const kind = paragraph.isStory ? "" : ` kind=${paragraph.kind}`;
  return `[${paragraph.id} seq=${paragraph.seq} page=${paragraph.page}${fragment}${kind} ${role}] ${paragraph.text}`;
}

function compactEntity(entity: Entity) {
  return {
    entityId: entity.entityId,
    type: entity.type,
    canonicalName: entity.canonicalName,
    aliases: entity.aliases.map((alias) => alias.name),
    parentLocationId: entity.parentLocationId,
    lastSeq: entity.lastSeq,
  };
}

/**
 * The full alias index is small and always sent; entity detail goes only to
 * entities the window can plausibly touch: name-matched in the text, seen
 * recently, or important enough to be referred to obliquely.
 */
export function selectLedgerContext(ledger: Ledger, window: Window) {
  const source = normalizeText(
    [...window.contextBefore, ...window.owned, ...window.contextAfter]
      .map((paragraph) => paragraph.text)
      .join("\n"),
  );
  const earliestSeq = window.contextBefore[0]?.seq ?? window.owned[0]?.seq ?? 0;
  const matched = (entity: Entity) =>
    source.includes(normalizeText(entity.canonicalName)) ||
    entity.aliases.some((alias) => source.includes(normalizeText(alias.name)));
  const ranked = ledger.entities
    .map((entity) => ({
      entity,
      score:
        (matched(entity) ? 1_000_000 : 0) +
        (entity.importance === "major" ? 100_000 : 0) +
        (entity.type === "location" ? 50_000 : 0) +
        Math.max(0, 300 - Math.max(0, earliestSeq - entity.lastSeq)),
    }))
    .sort((left, right) => right.score - left.score);
  const detailed = ranked
    .filter((item) => item.score >= 300 || matched(item.entity))
    .slice(0, maxContextEntities)
    .map(({ entity }) => ({
      ...compactEntity(entity),
      importance: entity.importance,
      description: entity.description,
      recentStates: entity.states.slice(-2).map((state) => ({
        stateId: state.stateId,
        label: state.label,
        validFromSeq: state.validFromSeq,
      })),
      relationships: entity.relationships.map((relationship) => ({
        toEntityId: relationship.toEntityId,
        type: relationship.type,
      })),
    }));
  const aliasIndex =
    ledger.entities.length <= maxContextEntities * 4
      ? ledger.entities.map(compactEntity)
      : ranked.slice(0, maxContextEntities * 4).map(({ entity }) => compactEntity(entity));
  const lastAnnotation = Object.values(ledger.annotations)
    .filter((annotation) => annotation.seq < (window.owned[0]?.seq ?? 0))
    .sort((left, right) => right.seq - left.seq)[0];
  return {
    aliasIndex,
    entities: detailed,
    recentEvents: ledger.events.slice(-20).map((event) => ({
      eventId: event.eventId,
      summary: event.summary,
      seqStart: event.seqStart,
      seqEnd: event.seqEnd,
      locationId: event.locationId,
    })),
    sceneSoFar: lastAnnotation
      ? {
          paragraphId: lastAnnotation.paragraphId,
          locationId: lastAnnotation.locationId,
          presentEntityIds: lastAnnotation.presentEntityIds,
          timeMarker: lastAnnotation.timeMarker,
        }
      : null,
  };
}

export function extractionUserPayload(
  ledger: Ledger,
  window: Window,
  repair: boolean,
): string {
  const required = window.owned
    .filter((paragraph) => paragraph.isStory)
    .map((paragraph) => paragraph.id);
  return JSON.stringify({
    task: repair
      ? "REPAIR: earlier processing returned no annotation for the required paragraphs. Annotate every required paragraph now and add any entity, fact or event they contain that the ledger lacks."
      : "Extract the complete model for the owned paragraphs.",
    requiredAnnotationParagraphIds: Array.from(new Set(required)),
    ledger: selectLedgerContext(ledger, window),
    rollingSynopsis: ledger.rollingSynopsis,
    contextBefore: window.contextBefore.map((paragraph) =>
      paragraphLine(paragraph, "context"),
    ),
    ownedParagraphs: window.owned.map((paragraph) =>
      paragraphLine(paragraph, "owned"),
    ),
    contextAfter: window.contextAfter.map((paragraph) =>
      paragraphLine(paragraph, "context"),
    ),
  });
}

export const mergeSystemPrompt = `You review the entity registry of a Book Model built window by window. Return JSON only.
Find entries that refer to the same thing in the story (same character under different names or spellings, same place, same object, same group, same concept) and propose merges. Merge only when the evidence in names, aliases and descriptions makes identity clear; never merge distinct members of a group with the group itself, and never merge a person with a place.
Also correct obvious mistakes: an entity typed wrongly (a place typed as an object, a group typed as a character), a location missing its parent location when descriptions state it, or a canonical name that is an alias when a proper name exists.
Return {"merges":[{"keepEntityId","mergeEntityIds":[],"reason"}],"corrections":[{"entityId","type","canonicalName","parentLocationId"}]}. Fields in corrections other than entityId may be null when unchanged.`;

export const profileSystemPrompt = `You write consolidated profiles for Book Model entities from the evidence supplied. Return JSON only.
Use only the supplied facts, states, reveals, relationships and excerpts. Never use outside knowledge. Say "unknown" where the material is silent.
For each entity return: entityId; role (one short phrase, e.g. "cart-horse, the farm's strongest worker"); description (two to five sentences summarising who or what this is across the whole book, in story order, neutral tone); appearance (only physical details the text states: species, build, colouring, clothing, marks; "unknown" if none); arc (two to four sentences on how the entity changes from first to last appearance; for locations and objects describe how they are used or transformed).
Return {"profiles":[{"entityId","role","description","appearance","arc"}]}.`;

export const chapterSystemPrompt = `You summarise one chapter of a book from per-paragraph annotations and the events recorded for it. Return JSON only.
Use only the supplied material. Write a summary of 120-200 words that covers the chapter in order without omitting any recorded event. Neutral, concrete, no interpretation.
Return {"summary": string}.`;

export const chronologySystemPrompt = `You order the events of a book in story time. Return JSON only.
Events are listed in narration order with their narration seq, a provisional storyTime hint and a flashback flag from extraction. Most books narrate chronologically: keep narration order unless the text clearly narrates an event out of order (flashback, recollection, backstory, foreshadowed future). Assign every event a unique storyOrder integer starting at 1, ascending in story time. Set isFlashback true only for events narrated later than they happen.
Return {"events":[{"eventId","storyOrder","isFlashback"}]}. Include every event exactly once.`;

export const worldSystemPrompt = `You describe the world of a book from its synopsis, chapter summaries and principal entities. Return JSON only. Use only the supplied material.
Return {"setting": string (where the story takes place, two to four sentences), "era": string (when, as far as the text shows; "unspecified" if silent), "premise": string (the central situation in two to three sentences, no ending spoilers), "narration": string (point of view and narrative voice in one to two sentences), "tone": string (three to six words)}.`;
