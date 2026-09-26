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
  const { momentLocationId, stateOf, reuseKeyOf } = options;
  return shots.map((shot) => {
    // Presence is an explicit source-grounded decision, never a name match.
    const locationId = shot.locationId ?? momentLocationId;
    const placed = { ...shot, locationId, locationStateId: shot.direction ? shot.locationStateId : shot.locationStateId ?? (locationId ? stateOf(locationId) : null) };
    return { ...placed, reuseKey: reuseKeyOf(placed) };
  });
}
