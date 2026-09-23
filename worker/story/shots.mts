/**
 * Shot rules applied after the model proposes shots.
 *
 * Two failures this exists to stop. A shot described as "the narrator sitting
 * by the window" came back with a cast of John, and every image of it drew the
 * wrong person. And a Moment-wide location put the garden shot inside the
 * mansion. So a shot's cast must contain everyone its own description names,
 * and its place is read from the description too when it names one.
 */

import type { Shot } from "../../lib/story-types.ts";
import { nameRegex } from "../evidence.mts";
import type { Entity } from "../types.mts";

export type NamedEntity = { entityId: string; type: Entity["type"]; patterns: RegExp[] };

export function nameIndex(entities: Entity[]): NamedEntity[] {
  return entities.map((entity) => ({
    entityId: entity.entityId,
    type: entity.type,
    patterns: [entity.canonicalName, ...entity.aliases.map((alias) => alias.name)]
      .map(nameRegex)
      .filter((pattern): pattern is RegExp => pattern !== null),
  }));
}

function namedIn(description: string, index: NamedEntity[], types: Entity["type"][]): string[] {
  return index
    .filter((entity) => types.includes(entity.type) && entity.patterns.some((pattern) => pattern.test(description)))
    .map((entity) => entity.entityId);
}

const NARRATOR = /\bnarrators?\b/i;

export type ShotRuleOptions = {
  index: NamedEntity[];
  /** The Moment's place, used when a shot's description names none. */
  momentLocationId: string | null;
  narratorEntityId: string | null;
  stateOf: (entityId: string) => string | null;
  reuseKeyOf: (shot: Omit<Shot, "reuseKey">) => string;
};

/**
 * Gives every shot its own place and a cast that matches what it describes,
 * then makes a Moment's shots read as a sequence: establishing first, closest
 * last, when the model gave them all the same framing.
 */
export function applyShotRules(shots: Omit<Shot, "reuseKey">[], options: ShotRuleOptions): Shot[] {
  const { index, momentLocationId, narratorEntityId, stateOf, reuseKeyOf } = options;
  const placed = shots.map((shot) => {
    const describedPlace = namedIn(shot.description, index, ["location"])[0] ?? null;
    const cast = new Set(shot.entityStates.map((state) => state.entityId));
    for (const entityId of namedIn(shot.description, index, ["character", "group", "object"])) cast.add(entityId);
    // "The narrator" is a person in the picture even though the book never names them.
    if (narratorEntityId && NARRATOR.test(shot.description)) cast.add(narratorEntityId);
    const locationId = describedPlace ?? shot.locationId ?? momentLocationId;
    return {
      ...shot,
      locationId,
      locationStateId: locationId ? stateOf(locationId) : null,
      entityStates: [...cast].map((entityId) => ({ entityId, stateId: stateOf(entityId) })),
    };
  });

  const framings = new Set(placed.map((shot) => shot.framing));
  if (placed.length > 1 && framings.size === 1) {
    placed[0]!.framing = "wide";
    placed.at(-1)!.framing = "close";
  }
  return placed.map((shot) => ({ ...shot, reuseKey: reuseKeyOf(shot) }));
}
