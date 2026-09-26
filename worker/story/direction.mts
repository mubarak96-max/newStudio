import { createHash } from "node:crypto";
import type { Shot } from "../../lib/story-types.ts";
import { asString, records, strings } from "../coerce.mts";

const presentations = new Set(["physical", "memory", "dream", "imagined", "perception", "descriptive"]);

export function readDirection(row: Record<string, unknown>, allowed: Set<string>, visible: Set<string>): NonNullable<Shot["direction"]> {
  const sourceParagraphIds = strings(row.sourceParagraphIds);
  const presentation = asString(row.presentation);
  const purpose = asString(row.purpose).trim();
  const changeReason = asString(row.changeReason).trim();
  if (!sourceParagraphIds.length || sourceParagraphIds.some((id) => !allowed.has(id))) throw new Error("Shot must cite its supporting paragraphs inside this moment.");
  if (!presentations.has(presentation) || !purpose || !changeReason) throw new Error("Shot needs its presentation, purpose and source-motivated change reason.");
  const focusRegions = records(row.focusRegions).map((region) => {
    const { x, y, w, h } = region;
    const entityId = asString(region.entityId);
    if (!visible.has(entityId) || ![x, y, w, h].every((v) => typeof v === "number" && Number.isFinite(v))) throw new Error("Focus region must locate a visible entity.");
    const box = { x: x as number, y: y as number, w: w as number, h: h as number };
    if (box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0 || box.x + box.w > 1.001 || box.y + box.h > 1.001) throw new Error("Focus region lies outside the scene.");
    return { entityId, ...box };
  });
  return { sourceParagraphIds, presentation: presentation as NonNullable<Shot["direction"]>["presentation"], purpose, changeReason, focusRegions };
}

export function visualIdentity(shot: Omit<Shot, "reuseKey">): string {
  return createHash("sha256").update(JSON.stringify({
    location: [shot.locationId, shot.locationStateId],
    cast: [...shot.entityStates].sort((a, b) => a.entityId.localeCompare(b.entityId)),
    description: shot.description.trim(), framing: shot.framing, time: shot.timeOfDay,
    presentation: shot.direction?.presentation, focus: shot.direction?.focusRegions,
  })).digest("hex").slice(0, 16);
}
